'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, RotateCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { Session } from '@supabase/supabase-js';
import { useStudySubjects } from '@/hooks/useStudySubjects';
import { notifyStudySubjectsChanged, STUDY_SUBJECTS_CHANGED_EVENT } from '@/lib/studySubjects';
import { isPomodoroMode } from '@/lib/pomodoroCounts';
import { cn } from '@/lib/utils';
import ConfirmModal from '@/components/ConfirmModal';
import ModalDialog from '@/components/ui/ModalDialog';
import HistoryRecordEditor from '@/components/history/HistoryRecordEditor';
import RecentWeek from '@/components/history/RecentWeek';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import {
  formatRecordDuration,
  formatRecordTime,
  formatTodaySummary,
  getRecentQueryStart,
  summarizeRecentActivity,
  type RecentSessionRow,
} from '@/components/history/recentActivity';

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

// 화면에 보이는 기록 하나. 분할 저장된 조각들은 합쳐서 하나로 보여 준다.
type HistoryItem = StudySession & { segmentIds: number[] };

// 한 번의 저장에서 분할된 행들을 묶는 배치 키 (구형 행은 group_id 폴백)
const getBatchId = (item: Pick<StudySession, 'session_batch_id' | 'group_id'>) =>
  item.session_batch_id ?? item.group_id ?? null;

const HISTORY_FETCH_LIMIT = 20;
// 디자인 보드의 최근 활동 목록 길이
const HISTORY_DISPLAY_COUNT = 8;
const RECENT_PAGE_SIZE = 1000;

// 최근 7일 집계용 행. PostgREST의 max-rows에 잘리지 않도록 빈 페이지가 나올 때까지 읽는다.
async function fetchRecentSessionRows(userId: string, since: Date): Promise<RecentSessionRow[]> {
  const rows: RecentSessionRow[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await supabase
      .from('study_sessions')
      .select('id, mode, duration, created_at, session_batch_id, group_id')
      .eq('user_id', userId)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + RECENT_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as RecentSessionRow[];
    if (!page.length) return rows;
    rows.push(...page);
    from += page.length;
  }
}

interface HistoryListProps {
  updateTrigger?: number;
  session?: Session | null;
  onOpenLogin?: () => void;
  /** 접힌 상태(타이머 시트가 관리한다). onToggleCollapsed가 있을 때만 쓴다. */
  collapsed?: boolean;
  /** 주면 머리 줄(최근 활동 + 오늘 요약 + 접기/펼치기)을 그린다. */
  onToggleCollapsed?: () => void;
}

export default function HistoryList({
  updateTrigger = 0,
  session,
  onOpenLogin,
  collapsed = false,
  onToggleCollapsed,
}: HistoryListProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [recentRows, setRecentRows] = useState<RecentSessionRow[]>([]);
  // 마지막으로 불러온 시각. 시각 표기(오늘·어제)와 7일 집계의 기준이다.
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [taskDraft, setTaskDraft] = useState('');
  const [subjectDraft, setSubjectDraft] = useState<string | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const bodyId = useId();
  const editorId = useId();
  const sheetTitleId = useId();
  const isDesktop = useIsDesktop();
  const rowRefs = useRef(new Map<number, HTMLButtonElement>());
  const memoRef = useRef<HTMLInputElement>(null);

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
    setRecentRows([]);
    setLoadedAt(null);
    setEditingId(null);
    setTaskDraft('');
    setSubjectDraft(null);
    setUpdatingTaskId(null);
    setDeletingId(null);
    setConfirmDeleteId(null);
    setLoading(userId !== null);
  }

  const fetchHistory = useCallback(async () => {
    const generation = ++fetchGenerationRef.current;
    const account = accountRef.current;
    const isCurrent = () => account === accountRef.current && generation === fetchGenerationRef.current;
    if (!userId) {
      setHistory([]);
      setRecentRows([]);
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
        setRecentRows([]);
        return;
      }

      const now = new Date();
      const [{ data, error }, recent] = await Promise.all([
        supabase
          .from('study_sessions')
          .select('id, mode, duration, created_at, task, subject_id, session_batch_id, group_id')
          .eq('user_id', userId)
          .order('created_at', { ascending: false, nullsFirst: false })
          .limit(HISTORY_FETCH_LIMIT),
        fetchRecentSessionRows(userId, getRecentQueryStart(now)),
      ]);
      if (!isCurrent()) return;

      if (error) throw error;

      const groupedHistory: HistoryItem[] = [];
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
            segmentIds: segments.map(s => s.id),
          });
          processedBatchIds.add(batchId);
        } else {
          // Legacy or single sessions without a batch id
          groupedHistory.push({ ...session, segmentIds: [session.id] });
        }
      });

      setHistory(groupedHistory.slice(0, HISTORY_DISPLAY_COUNT));
      setRecentRows(recent);
      setLoadedAt(now);
    } catch (error) {
      if (!isCurrent()) return;
      const message =
        error instanceof Error && error.message.includes('permission denied')
          ? 'Supabase RLS 정책에서 study_sessions 조회 권한을 확인해주세요. (예: user_id = auth.uid())'
          : '기록을 불러오지 못했어요.';
      toast.error(message);
      console.error(error);
    } finally {
      if (isCurrent()) {
        setLoading(false);
      }
    }
  }, [userId]);

  const busy = updatingTaskId !== null || deletingId !== null;

  const closeEditor = (restoreFocusId: number | null = null) => {
    // 데스크톱 펼침 편집은 닫을 때 그 행으로 포커스를 돌린다(모바일 대화상자는 ModalDialog가 돌려준다).
    if (restoreFocusId !== null && isDesktop) rowRefs.current.get(restoreFocusId)?.focus();
    setEditingId(null);
    setTaskDraft('');
    setSubjectDraft(null);
  };

  const cancelEditing = () => {
    if (updatingTaskId !== null) return;
    closeEditor(editingId);
  };

  const toggleEditing = (item: HistoryItem) => {
    if (busy) return;
    if (editingId === item.id) {
      closeEditor();
      return;
    }
    setEditingId(item.id);
    setTaskDraft(item.task ?? '');
    setSubjectDraft(item.subject_id ?? null);
  };

  const handleDelete = async (id: number) => {
    if (!userId || busy) return;
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

      // 지운 행 대신 이웃 행으로 포커스를 옮길 수 있게 미리 고른다.
      const index = history.findIndex(item => item.id === id);
      const neighborId = (history[index + 1] ?? history[index - 1])?.id ?? null;
      setHistory((prev) => prev.filter((item) => item.id !== id));
      setRecentRows((prev) => prev.filter((row) => (batchId ? getBatchId(row) !== batchId : row.id !== id)));
      if (editingId === id) closeEditor();
      if (neighborId !== null) {
        requestAnimationFrame(() => {
          if (!document.activeElement || document.activeElement === document.body) rowRefs.current.get(neighborId)?.focus();
        });
      }
      toast.success('기록을 삭제했어요.');
      notifyStudySubjectsChanged();
    } catch (error) {
      if (account !== accountRef.current) return;
      toast.error('기록을 삭제하지 못했어요.');
      console.error(error);
    } finally {
      if (account === accountRef.current) setDeletingId(null);
    }
  };

  // 작업 메모는 task만, 과목은 분류 RPC로 바꾼다. 메모 수정은 과목·시간을 바꾸지 않고,
  // 둘 다 분할 저장된 기록의 모든 조각에 함께 적용된다(docs/study-subjects.md).
  const handleSave = async (item: HistoryItem) => {
    if (!userId || busy) return;
    const memoChanged = taskDraft !== (item.task ?? '');
    const subjectChanged = subjectDraft !== (item.subject_id ?? null);
    if (!memoChanged && !subjectChanged) {
      closeEditor(item.id);
      return;
    }
    const account = accountRef.current;
    const task = taskDraft.trim() || null;
    const subjectId = subjectDraft;
    let step: 'memo' | 'subject' = 'memo';
    let memoSaved = false;
    setUpdatingTaskId(item.id);
    try {
      if (memoChanged) {
        const batchId = getBatchId(item);

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
            .eq('id', item.id);
          error = upError;
        }

        if (account !== accountRef.current) return;
        if (error) throw error;
        memoSaved = true;
        setHistory((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, task } : entry)));
      }

      if (subjectChanged) {
        step = 'subject';
        // 서버 RPC는 고른 행의 배치 전체를 함께 분류한다. 불러온 조각을 모두 넘겨 빠짐이 없게 한다.
        const { data, error } = await supabase.rpc('classify_study_sessions', {
          p_session_ids: item.segmentIds,
          p_subject_id: subjectId,
        });
        if (account !== accountRef.current) return;
        if (error || !data) throw error ?? new Error('No records updated');
        setHistory((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, subject_id: subjectId } : entry)));
      }

      toast.success(memoChanged && subjectChanged ? '기록을 수정했어요.' : memoChanged ? '작업 메모를 업데이트했어요.' : '과목을 바꿨어요.');
      closeEditor(item.id);
      notifyStudySubjectsChanged();
    } catch (error) {
      if (account !== accountRef.current) return;
      if (step === 'subject') {
        toast.error('과목을 바꾸지 못했어요. 다시 시도해 주세요.');
        // 메모는 이미 저장됐으니 다른 화면도 새로 읽게 한다.
        if (memoSaved) notifyStudySubjectsChanged();
      } else {
        toast.error(
          error instanceof Error && error.message.includes('column "task"')
            ? 'Supabase study_sessions 테이블에 task(TEXT) 컬럼이 필요해요.'
            : '작업 메모를 저장하지 못했어요.',
        );
      }
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

  // 데스크톱에서 행을 펼치면 메모 입력으로 바로 들어간다(모바일 대화상자는 initialFocusRef로 같은 곳에 둔다).
  useEffect(() => {
    if (editingId !== null && isDesktop) memoRef.current?.focus();
  }, [editingId, isDesktop]);

  const summary = session && loadedAt ? summarizeRecentActivity(recentRows, loadedAt) : null;
  const hasHeader = Boolean(onToggleCollapsed);
  const hidden = hasHeader && collapsed;
  const editingItem = history.find(item => item.id === editingId) ?? null;
  const subjectName = (item: HistoryItem) =>
    item.subject_id ? subjects.find(subject => subject.id === item.subject_id)?.name ?? '지정된 과목' : '미분류';
  const modeLabel = (item: HistoryItem) => (isPomodoroMode(item.mode) ? '뽀모도로' : '스톱워치');

  const editorProps = {
    memo: taskDraft,
    onMemoChange: setTaskDraft,
    subjectId: subjectDraft,
    onSubjectChange: setSubjectDraft,
    subjects,
    saving: updatingTaskId !== null,
    busy,
    onCancel: cancelEditing,
  };

  return (
    <section aria-label="최근 활동" className="flex min-h-0 w-full flex-1 flex-col text-ink">
      {hasHeader ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          // Space가 타이머 전역 단축키로 새지 않게 한다.
          onKeyDown={(event) => event.stopPropagation()}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          className="mx-auto flex min-h-11 w-full max-w-[720px] shrink-0 items-center justify-between gap-3 rounded-2xl px-5 pb-1.5 pt-1 text-left text-ink hover:bg-hover md:min-h-14 md:gap-4 md:px-8 md:py-2"
        >
          <span className="flex min-w-0 items-baseline gap-2.5 md:gap-3">
            <span className="flex-none text-base font-bold md:text-lg md:tracking-[-0.01em]">최근 활동</span>
            {summary ? (
              <span className="min-w-0 truncate text-xs text-ink-muted md:text-sm">{formatTodaySummary(summary)}</span>
            ) : null}
          </span>
          <span className="flex flex-none items-center gap-1 text-[13px] font-semibold text-ink-muted md:gap-1.5 md:text-sm">
            {collapsed ? '펼치기' : '접기'}
            <ChevronDown
              aria-hidden="true"
              strokeWidth={2.2}
              className={cn(
                'size-4 transition-transform duration-300 motion-reduce:transition-none md:size-[18px]',
                collapsed && 'rotate-180',
              )}
            />
          </span>
        </button>
      ) : null}

      {/* 접기: 내용 높이까지 grid 행 높이를 움직인다(디자인 보드의 max-height 전환과 같은 효과). */}
      <div
        id={bodyId}
        inert={hidden}
        className={cn(
          'grid min-h-0 flex-1 transition-[grid-template-rows,visibility] duration-[600ms] ease-[ease] motion-reduce:transition-none',
          hidden ? 'invisible grid-rows-[0fr]' : 'grid-rows-[1fr]',
        )}
      >
        <div className="min-h-0 overflow-y-auto md:overflow-hidden">
          <div className="mx-auto w-full max-w-[720px] px-5 pb-3 md:px-8 md:pb-16">
            <section aria-label="최근 활동 목록" className="flex flex-col gap-0.5 md:gap-1 md:pb-2 md:pt-1">
              {!session ? (
                <div className="flex flex-col items-start gap-3 py-3 md:flex-row md:items-center md:justify-between">
                  <p className="m-0 text-[13px] text-ink-muted md:text-sm">로그인하고 공부 기록을 확인해 보세요.</p>
                  <button type="button" onClick={onOpenLogin} className="ui-button-secondary ui-press min-h-10 px-4 text-sm">
                    로그인하기
                  </button>
                </div>
              ) : loading && history.length === 0 ? (
                <p role="status" className="m-0 py-2.5 text-[13px] text-ink-muted md:py-3 md:text-sm">기록을 불러오는 중…</p>
              ) : history.length === 0 ? (
                <p className="m-0 py-2.5 text-[13px] text-ink-muted md:py-3 md:text-sm">
                  아직 기록이 없어요. 첫 뽀모도로를 시작하면 여기에 쌓여요.
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                  {history.map((item) => {
                    const editing = editingId === item.id;
                    const hasTask = Boolean(item.task?.trim());
                    const time = loadedAt ? formatRecordTime(new Date(item.created_at), loadedAt) : '';
                    const pomodoro = isPomodoroMode(item.mode);
                    return (
                      <li key={item.id} className="flex flex-col">
                        <button
                          type="button"
                          ref={(element) => {
                            if (element) rowRefs.current.set(item.id, element);
                            else rowRefs.current.delete(item.id);
                          }}
                          onClick={(event) => {
                            // Safari는 클릭한 버튼에 포커스를 주지 않는다. 모바일 대화상자가 닫힐 때 이 행으로 돌아오게 한다.
                            event.currentTarget.focus();
                            toggleEditing(item);
                          }}
                          onKeyDown={(event) => event.stopPropagation()}
                          aria-expanded={isDesktop ? editing : undefined}
                          aria-controls={isDesktop && editing ? editorId : undefined}
                          aria-haspopup={isDesktop ? undefined : 'dialog'}
                          className="-mx-2.5 flex min-h-[60px] items-center gap-2.5 rounded-control px-2.5 py-[5px] text-left text-ink hover:bg-hover md:-mx-3 md:min-h-[52px] md:gap-3.5 md:rounded-tile md:px-3 md:py-1"
                        >
                          <time dateTime={item.created_at} className="hidden shrink-0 basis-[84px] text-[13px] text-ink-muted md:block">
                            {time}
                          </time>
                          <span className="flex min-w-0 flex-1 flex-col gap-px md:flex-row md:items-center md:gap-3.5">
                            <span className="flex min-w-0 items-baseline gap-1.5 md:flex-1 md:gap-2">
                              <span
                                title={hasTask ? item.task ?? undefined : '작업 메모 없음'}
                                className={cn(
                                  'min-w-0 truncate text-sm md:text-[15px]',
                                  hasTask ? 'font-semibold text-ink' : 'font-medium text-ink-muted',
                                )}
                              >
                                {hasTask ? item.task : '작업 메모 없음'}
                              </span>
                              {/* 과목 이름은 80자까지 가능하다. 메모 자리를 지키도록 이 영역의 40%까지만 쓰고 줄인다. */}
                              <span
                                title={subjectName(item)}
                                className="min-w-0 max-w-[40%] shrink-0 truncate text-xs font-medium text-ink-subtle"
                              >
                                {subjectName(item)}
                              </span>
                            </span>
                            <span className="flex flex-none items-center gap-1.5 text-xs text-ink-muted md:text-[13px]">
                              <time dateTime={item.created_at} className="md:hidden">{time}</time>
                              <span
                                aria-hidden="true"
                                className={cn('size-1.5 rounded-full md:size-[7px]', pomodoro ? 'bg-pomo' : 'bg-watch')}
                              />
                              {modeLabel(item)}
                            </span>
                          </span>
                          <span className="shrink-0 text-right text-sm font-bold md:basis-20 md:text-[15px]">
                            {formatRecordDuration(item.duration)}
                          </span>
                          <span className="sr-only">기록 수정</span>
                        </button>
                        {editing && isDesktop ? (
                          <HistoryRecordEditor
                            {...editorProps}
                            variant="inline"
                            id={editorId}
                            memoRef={memoRef}
                            onSave={() => void handleSave(item)}
                            onDelete={() => setConfirmDeleteId(item.id)}
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              {session ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void fetchHistory()}
                    disabled={loading || busy}
                    className="ui-button-ghost -mr-2.5 min-h-9 gap-1.5 rounded-chip px-2.5 text-[13px] font-medium text-ink-muted"
                  >
                    <RotateCw aria-hidden="true" size={14} strokeWidth={2} />
                    새로고침
                  </button>
                </div>
              ) : null}
            </section>

            {summary ? <RecentWeek summary={summary} /> : null}
          </div>
        </div>
      </div>

      <ModalDialog
        open={!isDesktop && editingItem !== null}
        onClose={cancelEditing}
        aria-labelledby={sheetTitleId}
        initialFocusRef={memoRef}
        overlayClassName="animate-fade-in"
        className="animate-scale-in gap-3"
      >
        <span aria-hidden="true" className="ui-sheet-grabber md:hidden" />
        {editingItem ? (
          <>
            <div className="flex flex-col gap-0.5">
              <h2 id={sheetTitleId} className="ui-dialog-title">기록 수정</h2>
              <p className="m-0 text-[13px] text-ink-muted">
                {loadedAt ? formatRecordTime(new Date(editingItem.created_at), loadedAt) : ''} {modeLabel(editingItem)}{' '}
                {formatRecordDuration(editingItem.duration)}
              </p>
            </div>
            <HistoryRecordEditor
              {...editorProps}
              variant="sheet"
              memoRef={memoRef}
              onSave={() => void handleSave(editingItem)}
              onDelete={() => setConfirmDeleteId(editingItem.id)}
            />
          </>
        ) : null}
      </ModalDialog>

      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          if (confirmDeleteId !== null) void handleDelete(confirmDeleteId);
        }}
        title="기록을 삭제할까요?"
        message="삭제한 기록은 되돌릴 수 없어요. 나뉘어 저장된 기록은 모든 조각이 함께 삭제돼요."
        confirmText="삭제"
        confirmTone="danger"
      />
    </section>
  );
}
