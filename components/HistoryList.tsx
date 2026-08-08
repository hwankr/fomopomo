'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { Session } from '@supabase/supabase-js';
import { loadTaskOptions as loadPersistedTaskOptions } from './timer/hooks/settingsStore';

type StudySession = {
  id: number;
  mode: string;
  duration: number;
  created_at: string;
  task?: string | null;
  // 저장 배치 ID: 새 행은 session_batch_id, 마이그레이션 이전 행은 group_id에 있다.
  session_batch_id?: string | null;
  group_id?: string | null;
};

// 한 번의 저장에서 분할된 행들을 묶는 배치 키 (구형 행은 group_id 폴백)
const getBatchId = (item: StudySession) =>
  item.session_batch_id ?? item.group_id ?? null;

// ✨ [추가] updateTrigger를 선택적 prop으로 정의
interface HistoryListProps {
  updateTrigger?: number;
  session?: Session | null;
  onOpenLogin?: () => void;
}

// ✨ props 구조 분해 할당 (기본값 0)
export default function HistoryList({ updateTrigger = 0, session, onOpenLogin }: HistoryListProps) {
  const [history, setHistory] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [taskDraft, setTaskDraft] = useState('');
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [taskOptions, setTaskOptions] = useState<string[]>([]);

  const userId = session?.user?.id ?? null;

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
    setLoading(userId !== null);
  }

  const loadTaskOptions = async () => {
    try {
      const tasks = await loadPersistedTaskOptions();

      setTaskOptions(tasks ?? ['국어', '수학', '영어']);
    } catch (error) {
      console.error('작업 목록 로드 실패:', error);
      setTaskOptions(['국어', '수학', '영어']);
    }
  };

  const fetchHistory = async () => {
    const generation = ++fetchGenerationRef.current;
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (generation !== fetchGenerationRef.current) return;

      if (!user) {
        // 로그아웃 상태라면 이전 계정의 기록을 남기지 않는다.
        setHistory([]);
        return;
      }

      const { data, error } = await supabase
        .from('study_sessions')
        .select('id, mode, duration, created_at, task, session_batch_id, group_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(20); // ✨ Increase limit to handle split sessions
      if (generation !== fetchGenerationRef.current) return;

      if (error) throw error;

      // ✨ [New] Grouping Logic
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
      const message =
        error instanceof Error && error.message.includes('permission denied')
          ? 'Supabase RLS 정책에서 study_sessions 조회 권한을 확인해주세요. (예: user_id = auth.uid())'
          : '기록을 불러오지 못했습니다.';
      toast.error(message);
      console.error(error);
    } finally {
      if (generation === fetchGenerationRef.current) {
        setLoading(false);
      }
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('이 기록을 삭제하시겠습니까?')) return;

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
          .or(`session_batch_id.eq.${batchId},group_id.eq.${batchId}`);
        error = delError;
      } else {
        const { error: delError } = await supabase
          .from('study_sessions')
          .delete()
          .eq('id', id);
        error = delError;
      }

      if (error) throw error;

      setHistory((prev) => prev.filter((item) => item.id !== id));
      if (editingId === id) {
        setEditingId(null);
        setTaskDraft('');
      }
      toast.success('기록이 삭제되었습니다.');
    } catch (error) {
      toast.error('삭제 실패');
      console.error(error);
    }
  };

  const startEditing = (item: StudySession) => {
    setEditingId(item.id);
    setTaskDraft(item.task ?? '');
    if (item.task && !taskOptions.includes(item.task)) {
      setTaskOptions((prev) => [...prev, item.task as string]);
    }
  };

  const cancelEditing = () => {
    setEditingId(null);
    setTaskDraft('');
    setUpdatingTaskId(null);
  };

  const handleUpdateTask = async (id: number) => {
    setUpdatingTaskId(id);
    try {
      const targetItem = history.find(h => h.id === id);
      const batchId = targetItem ? getBatchId(targetItem) : null;

      // 분할 저장된 세션은 배치 단위로 전 조각의 task를 갱신한다 (컬럼 폴백은 삭제와 동일).
      let error;
      if (batchId) {
        const { error: upError } = await supabase
          .from('study_sessions')
          .update({ task: taskDraft.trim() || null })
          .or(`session_batch_id.eq.${batchId},group_id.eq.${batchId}`);
        error = upError;
      } else {
        const { error: upError } = await supabase
          .from('study_sessions')
          .update({ task: taskDraft.trim() || null })
          .eq('id', id);
        error = upError;
      }

      if (error) throw error;

      setHistory((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, task: taskDraft.trim() || null } : item
        )
      );
      toast.success('작업 메모를 업데이트했어요.');
      cancelEditing();
    } catch (error) {
      const missingColumnMessage =
        error instanceof Error && error.message.includes('column "task"')
          ? 'Supabase study_sessions 테이블에 task(TEXT) 컬럼이 필요해요.'
          : '업데이트 실패';
      toast.error(missingColumnMessage);
      console.error(error);
    } finally {
      setUpdatingTaskId(null);
    }
  };

  // updateTrigger 또는 로그인 사용자가 변경될 때마다 다시 로드
  useEffect(() => {
    const load = async () => {
      await Promise.all([loadTaskOptions(), fetchHistory()]);
    };
    void load();
  }, [updateTrigger, userId]);

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
    <div className="w-full max-w-md mt-4">
      <div className="flex justify-between items-center mb-3 px-2">
        <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          최근 활동
        </h3>
        <button
          onClick={fetchHistory}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
        >
          새로고침
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        {loading ? (
          <div className="text-center text-gray-400 py-8 text-sm">
            로딩 중...
          </div>
        ) : !session ? (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm mb-3">로그인하고 학습 기록을 확인해보세요!</p>
            <button
              onClick={onOpenLogin}
              className="px-4 py-2 bg-rose-500 text-white rounded-lg text-sm font-medium hover:bg-rose-600 transition-colors"
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
                className="flex justify-between items-center p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors group"
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${item.mode === 'pomo'
                      ? 'bg-rose-100 text-rose-500 dark:bg-rose-900/30'
                      : 'bg-indigo-100 text-indigo-500 dark:bg-indigo-900/30'
                      }`}
                  >
                    {item.mode === 'pomo' ? '🍅' : '⏱️'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                      <div>
                        <div className="font-bold text-gray-700 dark:text-gray-200 text-sm">
                          {item.mode === 'pomo' ? '뽀모도로' : '스톱워치'}
                        </div>
                        <div className="text-xs text-gray-400">
                          {formatDate(item.created_at)}
                        </div>
                      </div>

                      {editingId === item.id ? (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 min-w-0 text-xs text-gray-500">
                          <select
                            value={taskDraft}
                            onChange={(e) => setTaskDraft(e.target.value)}
                            className="flex-1 min-w-0 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-rose-300 dark:focus:ring-rose-500"
                          >
                            <option value="">작업 없음</option>
                            {taskOptions.map((task) => (
                              <option key={task} value={task}>
                                {task}
                              </option>
                            ))}
                          </select>
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => handleUpdateTask(item.id)}
                              disabled={updatingTaskId === item.id}
                              className="px-3 py-2 rounded-lg bg-rose-500 text-white font-bold hover:bg-rose-600 disabled:opacity-60"
                            >
                              저장
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-slate-600"
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-1 min-w-0 text-xs text-gray-500">
                          <span className="truncate text-gray-600 dark:text-gray-300">
                            {item.task?.trim() ? item.task : '작업 메모 없음'}
                          </span>
                          <button
                            onClick={() => startEditing(item)}
                            className="text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 text-[11px] font-semibold"
                          >
                            수정
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 ml-3">
                  <div className="font-mono font-bold text-gray-800 dark:text-white text-right">
                    {formatDuration(item.duration)}
                  </div>

                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    title="삭제"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="w-5 h-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456-3.71a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                      />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
