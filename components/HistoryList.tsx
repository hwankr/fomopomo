'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { Session } from '@supabase/supabase-js';
import { useStudySubjects } from '@/hooks/useStudySubjects';
import { notifyStudySubjectsChanged, STUDY_SUBJECTS_CHANGED_EVENT } from '@/lib/studySubjects';

type StudySession = {
  id: number;
  mode: string;
  duration: number;
  created_at: string;
  task?: string | null;
  subject_id?: string | null;
  // 저장 배치 ID: 새 행은 session_batch_id, 마이그레이션 이전 행은 group_id에 있다.
  session_batch_id?: string | null;
  group_id?: string | null;
};

// 한 번의 저장에서 분할된 행들을 묶는 배치 키 (구형 행은 group_id 폴백)
const getBatchId = (item: StudySession) =>
  item.session_batch_id ?? item.group_id ?? null;

interface HistoryListProps {
  updateTrigger?: number;
  session?: Session | null;
  onOpenLogin?: () => void;
}

export default function HistoryList({ updateTrigger = 0, session, onOpenLogin }: HistoryListProps) {
  const [history, setHistory] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [taskDraft, setTaskDraft] = useState('');
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const userId = session?.user?.id ?? null;
  const { subjects } = useStudySubjects(userId);
  const accountRef = useRef({ userId, generation: 0 });
  if (accountRef.current.userId !== userId) {
    accountRef.current = { userId, generation: accountRef.current.generation + 1 };
  }

  // 요청 세대 카운터: 값이 바뀌면 그 이전에 시작된 조회의 응답은 폐기된다.
  const fetchGenerationRef = useRef(0);

  // 계정 전환/로그아웃 시 이전 계정의 기록이 잠시라도 남지 않도록 렌더 중 동기적으로 비운다.
  const [lastUserId, setLastUserId] = useState(userId);
  if (userId !== lastUserId) {
    setLastUserId(userId);
    setHistory([]);
    setEditingId(null);
    setTaskDraft('');
    setUpdatingTaskId(null);
    setDeletingId(null);
    setLoading(userId !== null);
  }

  const fetchHistory = useCallback(async () => {
    const generation = ++fetchGenerationRef.current;
    const account = accountRef.current;
    const isCurrent = () => account === accountRef.current && generation === fetchGenerationRef.current;
    if (!userId) {
      setHistory([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!isCurrent()) return;

      if (!user || user.id !== userId) {
        // 로그아웃 상태라면 이전 계정의 기록을 남기지 않는다.
        setHistory([]);
        return;
      }

      const { data, error } = await supabase
        .from('study_sessions')
        .select('id, mode, duration, created_at, task, subject_id, session_batch_id, group_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(20);
      if (!isCurrent()) return;

      if (error) throw error;

      const groupedHistory: StudySession[] = [];
      const processedBatchIds = new Set<string>();

      (data || []).forEach((session) => {
        const batchId = getBatchId(session);
        if (batchId) {
          if (processedBatchIds.has(batchId)) return;

          // Find all segments with this batch id
          const segments = (data || []).filter(s => getBatchId(s) === batchId);
          const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);

          // Use the most recent segment's created_at and other info
          // (Since we ordered by created_at desc, the first one encountered is the latest)
          groupedHistory.push({
            ...session,
            duration: totalDuration,
          });
          processedBatchIds.add(batchId);
        } else {
          // Legacy or single sessions without a batch id
          groupedHistory.push(session);
        }
      });

      setHistory(groupedHistory.slice(0, 5)); // Show top 5 grouped sessions
    } catch (error) {
      if (!isCurrent()) return;
      const message =
        error instanceof Error && error.message.includes('permission denied')
          ? 'Supabase RLS 정책에서 study_sessions 조회 권한을 확인해주세요. (예: user_id = auth.uid())'
          : '기록을 불러오지 못했습니다.';
      toast.error(message);
      console.error(error);
    } finally {
      if (isCurrent()) {
        setLoading(false);
      }
    }
  }, [userId]);

  const handleDelete = async (id: number) => {
    if (!userId || updatingTaskId !== null || deletingId !== null) return;
    if (!confirm('이 기록을 삭제하시겠습니까?')) return;
    const account = accountRef.current;
    setDeletingId(id);

    try {
      // 분할 저장된 세션은 배치 단위로 전 조각을 삭제한다. 배치 키가 어느
      // 컬럼에 있든(신형 session_batch_id / 구형 group_id) 매치되도록 or 필터 사용.
      const targetItem = history.find(h => h.id === id);
      const batchId = targetItem ? getBatchId(targetItem) : null;

      let error;
      if (batchId) {
        const { error: delError } = await supabase
          .from('study_sessions')
          .delete()
          .eq('user_id', userId)
          .or(`session_batch_id.eq.${batchId},group_id.eq.${batchId}`);
        error = delError;
      } else {
        const { error: delError } = await supabase
          .from('study_sessions')
          .delete()
          .eq('user_id', userId)
          .eq('id', id);
        error = delError;
      }

      if (account !== accountRef.current) return;
      if (error) throw error;

      setHistory((prev) => prev.filter((item) => item.id !== id));
      if (editingId === id) {
        setEditingId(null);
        setTaskDraft('');
      }
      toast.success('기록이 삭제되었습니다.');
      notifyStudySubjectsChanged();
    } catch (error) {
      if (account !== accountRef.current) return;
      toast.error('삭제 실패');
      console.error(error);
    } finally {
      if (account === accountRef.current) setDeletingId(null);
    }
  };

  const startEditing = (item: StudySession) => {
    setEditingId(item.id);
    setTaskDraft(item.task ?? '');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setTaskDraft('');
    setUpdatingTaskId(null);
  };

  const handleUpdateTask = async (id: number) => {
    if (!userId || updatingTaskId !== null || deletingId !== null) return;
    const account = accountRef.current;
    const task = taskDraft.trim() || null;
    setUpdatingTaskId(id);
    try {
      const targetItem = history.find(h => h.id === id);
      const batchId = targetItem ? getBatchId(targetItem) : null;

      // 분할 저장된 세션은 배치 단위로 전 조각의 task를 갱신한다 (컬럼 폴백은 삭제와 동일).
      let error;
      if (batchId) {
        const { error: upError } = await supabase
          .from('study_sessions')
          .update({ task })
          .eq('user_id', userId)
          .or(`session_batch_id.eq.${batchId},group_id.eq.${batchId}`);
        error = upError;
      } else {
        const { error: upError } = await supabase
          .from('study_sessions')
          .update({ task })
          .eq('user_id', userId)
          .eq('id', id);
        error = upError;
      }

      if (account !== accountRef.current) return;
      if (error) throw error;

      setHistory((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, task } : item
        )
      );
      toast.success('작업 메모를 업데이트했어요.');
      cancelEditing();
      notifyStudySubjectsChanged();
    } catch (error) {
      if (account !== accountRef.current) return;
      const missingColumnMessage =
        error instanceof Error && error.message.includes('column "task"')
          ? 'Supabase study_sessions 테이블에 task(TEXT) 컬럼이 필요해요.'
          : '업데이트 실패';
      toast.error(missingColumnMessage);
      console.error(error);
    } finally {
      if (account === accountRef.current) setUpdatingTaskId(null);
    }
  };

  // updateTrigger 또는 로그인 사용자가 변경될 때마다 다시 로드
  useEffect(() => {
    void fetchHistory();
    const refresh = () => { void fetchHistory(); };
    window.addEventListener(STUDY_SUBJECTS_CHANGED_EVENT, refresh);
    return () => {
      fetchGenerationRef.current += 1;
      window.removeEventListener(STUDY_SUBJECTS_CHANGED_EVENT, refresh);
    };
  }, [updateTrigger, fetchHistory]);

  useEffect(() => () => {
    accountRef.current = { ...accountRef.current, generation: accountRef.current.generation + 1 };
  }, []);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const remainingSeconds = seconds % 3600;
    const minutes = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}시간`);
    if (minutes > 0 || hours > 0) parts.push(`${minutes}분`);
    if (hours === 0) parts.push(`${secs}초`);

    return parts.join(' ');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${date
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;
  };

  return (
    <section aria-label="최근 활동" className="ui-panel-enter w-full max-w-md mt-4">
      <div className="flex justify-between items-center mb-3 px-2">
        <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          최근 활동
        </h3>
        <button
          onClick={fetchHistory}
          disabled={loading || updatingTaskId !== null || deletingId !== null}
          className="ui-press rounded-lg px-2 py-1 text-xs text-gray-500 hover:text-rose-600 disabled:opacity-50 dark:text-gray-400"
        >
          새로고침
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-rose-100/70 dark:border-slate-700 overflow-hidden">
        {loading ? (
          <div className="text-center text-gray-400 py-8 text-sm">
            로딩 중...
          </div>
        ) : !session ? (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm mb-3">로그인하고 학습 기록을 확인해보세요!</p>
            <button
              onClick={onOpenLogin}
              className="ui-button-primary ui-press px-4 py-2 text-sm"
            >
              로그인하기
            </button>
          </div>
        ) : history.length === 0 ? (
          <div className="text-center text-gray-400 py-8 text-sm">
            아직 기록이 없습니다.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {history.map((item) => (
              <li
                key={item.id}
                className="px-3 py-2.5 transition-colors hover:bg-rose-50/40 dark:hover:bg-slate-700/30"
              >
                <div className="flex items-center gap-2">
                  <div
                    aria-hidden="true"
                    className="w-6 h-6 shrink-0 rounded-lg flex items-center justify-center text-sm bg-rose-50 text-rose-500 dark:bg-rose-900/20"
                  >
                    {item.mode === 'pomo' ? '🍅' : '⏱️'}
                  </div>
                  <div className="flex flex-1 min-w-0 flex-wrap items-baseline gap-x-2">
                    <div className="whitespace-nowrap font-semibold text-gray-700 dark:text-gray-200 text-sm">
                      {item.mode === 'pomo' ? '뽀모도로' : '스톱워치'}
                    </div>
                    <time dateTime={item.created_at} className="whitespace-nowrap text-[11px] text-gray-400">
                      {formatDate(item.created_at)}
                    </time>
                  </div>
                  <div className="shrink-0 whitespace-nowrap font-mono text-sm font-semibold text-gray-700 dark:text-gray-100 text-right">
                    {formatDuration(item.duration)}
                  </div>
                  <button
                    onClick={() => handleDelete(item.id)}
                    disabled={updatingTaskId !== null || deletingId !== null}
                    className="ui-press shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 dark:hover:bg-rose-950/30"
                    aria-label="기록 삭제"
                    title="삭제"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="w-4 h-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456-3.71a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                      />
                    </svg>
                  </button>
                </div>
                <div className="mt-1 flex min-w-0 items-center gap-2">
                  <span className="max-w-[35%] shrink-0 truncate rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">
                    {item.subject_id ? subjects.find(subject => subject.id === item.subject_id)?.name ?? '지정된 과목' : '미분류'}
                  </span>
                  {editingId !== item.id && (
                    <>
                      <p
                        title={item.task?.trim() ? item.task : '작업 메모 없음'}
                        className="flex-1 min-w-0 truncate text-xs text-gray-600 dark:text-gray-300"
                      >
                        {item.task?.trim() ? item.task : '작업 메모 없음'}
                      </p>
                      <button
                        onClick={() => startEditing(item)}
                        disabled={updatingTaskId !== null || deletingId !== null}
                        aria-label="작업 메모 수정"
                        className="ui-press shrink-0 rounded-md px-1.5 py-1.5 text-xs text-gray-400 hover:text-rose-600 disabled:opacity-40"
                      >
                        수정
                      </button>
                    </>
                  )}
                </div>
                {editingId === item.id && (
                  <form
                    className="mt-3 space-y-2"
                    onSubmit={event => { event.preventDefault(); void handleUpdateTask(item.id); }}
                  >
                    <label htmlFor={`history-task-${item.id}`} className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                      작업 메모
                    </label>
                    <input
                      id={`history-task-${item.id}`}
                      type="text"
                      maxLength={200}
                      value={taskDraft}
                      onChange={event => setTaskDraft(event.target.value)}
                      disabled={updatingTaskId === item.id}
                      placeholder="예: 블록체인 9/12 복습"
                      className="ui-input w-full min-w-0 px-3 py-2 text-sm"
                    />
                    <div className="flex justify-end gap-2 text-xs">
                      <button type="button" onClick={cancelEditing} disabled={updatingTaskId === item.id} className="ui-button-secondary ui-press px-3 py-2">
                        취소
                      </button>
                      <button type="submit" disabled={updatingTaskId === item.id} className="ui-button-primary ui-press px-3 py-2">
                        {updatingTaskId === item.id ? '저장 중...' : '저장'}
                      </button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
