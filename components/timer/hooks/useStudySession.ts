import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { splitIntervalAtStudyDayBoundary } from '@/lib/dateUtils';
import toast from 'react-hot-toast';

type ProfileStatusUpdate = {
  status: 'studying' | 'paused' | 'online' | 'offline';
  current_task: string | null;
  last_active_at: string;
  study_start_time: string | null;
  timer_type: 'timer' | 'stopwatch';
  timer_mode: 'focus' | 'shortBreak' | 'longBreak';
  timer_duration: number;
  total_stopwatch_time?: number;
};

// Helper to generate UUID
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// 'rejected': the server refused the batch permanently (payload conflict or
// validation failure). The draft is kept in the outbox in an explicit recovery
// state, in-memory session state is cleared, and callers must not auto-retry.
export type SaveRecordResult = 'saved' | 'failed' | 'skipped' | 'rejected';

// One ordered slice of a save batch, as the recording RPC consumes it.
// ended_at is the interval end (the row's created_at on the server); the
// server derives the start as ended_at - duration.
type SessionSegment = {
  index: number;
  duration: number;
  ended_at: string;
};

// v1 outbox rows (pre-RPC clients) carried full study_sessions rows; drafts
// written before the session_batch_id migration held the batch id in group_id.
type LegacyPendingSessionRow = {
  mode: string;
  duration: number;
  user_id: string;
  task: string | null;
  task_id: string | null;
  created_at: string;
  session_batch_id?: string;
  group_id?: string;
};

type LegacyPendingSessionDraft = {
  sessionId: string;
  rows: LegacyPendingSessionRow[];
  failedAt: number;
};

// v2 outbox draft: exactly the RPC payload plus local-only bookkeeping.
// ownerId only gates which signed-in account may flush the draft — it is
// NEVER sent to the server (the RPC derives the owner from auth.uid()).
type PendingSessionDraftV2 = {
  version: 2;
  sessionId: string;
  ownerId: string;
  mode: string;
  task: string | null;
  taskId: string | null;
  segments: SessionSegment[];
  failedAt: number;
  // 'conflict': the server already holds this batch id with a different
  // payload. 'invalid': the server rejected the payload permanently.
  // Flagged drafts are kept for inspection but never auto-resent.
  state?: 'conflict' | 'invalid';
};

type PendingSessionDraft = PendingSessionDraftV2 | LegacyPendingSessionDraft;

// Durable outbox for failed saves: drafts survive reloads so a failed save
// never silently discards study time. Keyed by the stable per-session id.
const PENDING_SESSIONS_KEY = 'fomopomo_pending_sessions';

const readPendingSessions = (): Record<string, PendingSessionDraft> => {
  try {
    const raw = window.localStorage.getItem(PENDING_SESSIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    console.error('Failed to read pending sessions outbox', e);
    return {};
  }
};

const writePendingSessions = (drafts: Record<string, PendingSessionDraft>) => {
  try {
    window.localStorage.setItem(PENDING_SESSIONS_KEY, JSON.stringify(drafts));
  } catch (e) {
    console.error('Failed to write pending sessions outbox', e);
  }
};

const upsertPendingSession = (draft: PendingSessionDraftV2) => {
  const drafts = readPendingSessions();
  drafts[draft.sessionId] = draft;
  writePendingSessions(drafts);
};

const removePendingSession = (sessionId: string) => {
  const drafts = readPendingSessions();
  if (!(sessionId in drafts)) return;
  delete drafts[sessionId];
  writePendingSessions(drafts);
};

const isV2Draft = (draft: PendingSessionDraft): draft is PendingSessionDraftV2 =>
  (draft as PendingSessionDraftV2).version === 2;

// Upgrades a draft to the v2 shape without losing information. Returns null
// when the stored value is unrecognizable — callers must then KEEP the draft
// untouched (a conversion failure must never silently discard study time).
const toDraftV2 = (
  sessionId: string,
  draft: PendingSessionDraft
): PendingSessionDraftV2 | null => {
  if (isV2Draft(draft)) {
    if (
      typeof draft.ownerId !== 'string' ||
      typeof draft.mode !== 'string' ||
      !Array.isArray(draft.segments) ||
      draft.segments.length === 0
    ) {
      return null;
    }
    return draft;
  }

  const rows = draft?.rows;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const first = rows[0];
  if (typeof first?.user_id !== 'string' || typeof first?.mode !== 'string') {
    return null;
  }
  // A v1 draft was one save, so every row shares owner/mode/task metadata.
  const uniform = rows.every(
    (row) =>
      row &&
      row.user_id === first.user_id &&
      row.mode === first.mode &&
      typeof row.duration === 'number' &&
      typeof row.created_at === 'string'
  );
  if (!uniform) return null;

  return {
    version: 2,
    sessionId,
    ownerId: first.user_id,
    mode: first.mode,
    task: first.task ?? null,
    taskId: first.task_id ?? null,
    segments: rows.map((row, index) => ({
      index,
      duration: row.duration,
      ended_at: row.created_at,
    })),
    failedAt: draft.failedAt ?? Date.now(),
  };
};

// Drops every draft that belongs to `userId`. Called after an account reset or
// deletion so mount-time recovery cannot re-send data the server just erased.
export const clearPendingSessionsForUser = (userId: string) => {
  const drafts = readPendingSessions();
  let changed = false;
  for (const [sessionId, draft] of Object.entries(drafts)) {
    const owned = isV2Draft(draft)
      ? draft.ownerId === userId
      : draft?.rows?.some((row) => row.user_id === userId);
    if (owned) {
      delete drafts[sessionId];
      changed = true;
    }
  }
  if (changed) writePendingSessions(drafts);
};

// Session ids currently being sent, shared across hook instances so a
// StrictMode double-mount cannot fire two RPC calls for the same draft.
// (The server-side idempotency contract still covers cross-tab races.)
const recoveringSessionIds = new Set<string>();

const callRecordBatchRpc = (draft: {
  sessionId: string;
  mode: string;
  task: string | null;
  taskId: string | null;
  segments: SessionSegment[];
}) =>
  supabase.rpc('record_study_session_batch', {
    p_batch_id: draft.sessionId,
    p_mode: draft.mode,
    p_task: draft.task,
    p_task_id: draft.taskId,
    p_segments: draft.segments,
  });

// SQLSTATEs the recording RPC raises for inputs that can never succeed.
// Anything else (missing code, PostgREST/network failures) is retryable.
const PERMANENT_RPC_SQLSTATES = new Set([
  '22007',
  '22008',
  '22023',
  '22P02',
  '23502',
  '23514',
  '42501',
]);

type RpcFailureKind = 'conflict' | 'permanent' | 'retryable';

const classifyRpcError = (error: { code?: string; message?: string } | null): RpcFailureKind => {
  const code = error?.code ?? '';
  const message = error?.message ?? '';
  if (code === '23505' || message.includes('study_session_batch_conflict')) {
    return 'conflict';
  }
  if (PERMANENT_RPC_SQLSTATES.has(code)) return 'permanent';
  return 'retryable';
};

const sumSegmentSeconds = (segments: SessionSegment[]) =>
  segments.reduce((sum, segment) => sum + segment.duration, 0);

// A retry may rebuild segments with slightly drifted end timestamps (the open
// interval is re-closed at "now"). When the semantic content — mode, task and
// the ordered duration list — matches the stored draft, resending the draft's
// exact payload keeps the idempotency key AND payload stable so the server
// answers already_processed instead of a payload conflict.
const draftMatchesBuiltPayload = (
  draft: PendingSessionDraftV2,
  built: { mode: string; task: string | null; taskId: string | null; segments: SessionSegment[] }
) =>
  draft.mode === built.mode &&
  draft.task === built.task &&
  draft.taskId === built.taskId &&
  draft.segments.length === built.segments.length &&
  draft.segments.every((segment, i) => segment.duration === built.segments[i].duration);

const formatKoreanDuration = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}초`;
  if (seconds === 0) return `${minutes}분`;
  return `${minutes}분 ${seconds}초`;
};

interface UseStudySessionProps {
  isLoggedIn: boolean;
  onRecordSaved: () => void;
  selectedTaskId: string | null;
  selectedTaskTitle: string;
}

export const useStudySession = ({
  isLoggedIn,
  onRecordSaved,
  selectedTaskId,
  selectedTaskTitle,
}: UseStudySessionProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const [intervals, setIntervals] = useState<{ start: number; end: number }[]>([]);
  // Ref-based lock to prevent duplicate saves (sync check, unlike useState)
  const isSavingRef = useRef(false);
  const currentIntervalStartRef = useRef<number | null>(null);
  // Stable id for the session being saved: kept across failed attempts so a
  // retry reuses the same outbox key and session_batch_id (the server-side
  // idempotency key), and only reset once the RPC has confirmed the batch.
  const pendingSessionIdRef = useRef<string | null>(null);

  const updateStatus = useCallback(async (status: 'studying' | 'paused' | 'online' | 'offline', task?: string, startTime?: string, elapsedTime?: number, timerType: 'timer' | 'stopwatch' = 'stopwatch', timerMode: 'focus' | 'shortBreak' | 'longBreak' = 'focus', timerDuration: number = 0) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const taskTitle = task !== undefined ? task : selectedTaskTitle;

      // Check privacy setting
      const { data } = await supabase.from('profiles').select('is_task_public').eq('id', user.id).single();
      const isPublic = data?.is_task_public ?? true;

      const updateData: ProfileStatusUpdate = {
        status,
        current_task: isPublic ? taskTitle : null,
        last_active_at: new Date().toISOString(),
        study_start_time: startTime || null,
        timer_type: timerType,
        timer_mode: timerMode,
        timer_duration: timerDuration,
      };

      if (elapsedTime !== undefined) {
        updateData.total_stopwatch_time = elapsedTime;
      }

      await supabase.from('profiles').update(updateData).eq('id', user.id);
    } catch (e) {
      console.error('Failed to update status', e);
    }
  }, [selectedTaskTitle]);

  // taskIdOverride: undefined attaches the ambient selectedTaskId; null (or an
  // explicit id) replaces it. Skip-style saves pass null so a task clicked but
  // then abandoned in the popup cannot claim the session.
  const saveRecord = useCallback(
    async (recordMode: string, duration: number, taskText = '', forcedEndTime?: number, taskIdOverride?: string | null): Promise<SaveRecordResult> => {
      // Prevent duplicate saves using ref (synchronous check)
      if (isSavingRef.current) {
        console.log('[saveRecord] Already saving, ignoring duplicate request');
        return 'skipped';
      }

      if (duration < 10) {
        toast.error('10초 미만은 저장되지 않습니다.');
        return 'skipped';
      }

      if (!isLoggedIn) {
        toast.error('로그인이 필요한 기능입니다.');
        return 'skipped';
      }

      // Set ref immediately (synchronous) to block rapid duplicate calls
      isSavingRef.current = true;

      // Reuse the pending session id on retries so the outbox draft and the
      // batch's session_batch_id stay stable until the save is confirmed.
      const sessionId = pendingSessionIdRef.current ?? generateUUID();
      pendingSessionIdRef.current = sessionId;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        isSavingRef.current = false;
        toast.error('로그인이 필요한 기능입니다.');
        return 'skipped';
      }

      setIsSaving(true);
      const toastId = toast.loading('기록 저장 중...', {
        style: {
          borderRadius: '10px',
          background: '#333',
          color: '#fff',
          fontSize: '14px',
        },
      });

      const now = Date.now();
      const endTimeToUse = forcedEndTime || now; // Use forced time if provided

      let currentSessionIntervals = [...intervals];

      if (currentIntervalStartRef.current) {
        currentSessionIntervals.push({ start: currentIntervalStartRef.current, end: endTimeToUse });
      }

      currentSessionIntervals = currentSessionIntervals.filter(i => i.start > 0 && i.end > 0);

      if (currentSessionIntervals.length === 0) {
        if (duration > 0 && duration < 24 * 60 * 60) {
          currentSessionIntervals.push({ start: endTimeToUse - duration * 1000, end: endTimeToUse });
        }
      }

      // Split each interval at study-day (05:00) boundaries so each segment's
      // ended_at (= the row's created_at) lands in the study day it belongs to.
      const splitSegments: SessionSegment[] = currentSessionIntervals
        .flatMap(interval => splitIntervalAtStudyDayBoundary(interval))
        .map(interval => ({
          duration: Math.round((interval.end - interval.start) / 1000),
          ended_at: new Date(interval.end).toISOString(),
        }))
        .filter(segment => segment.duration >= 10 && segment.duration < 24 * 60 * 60)
        .map((segment, index) => ({ index, ...segment }));

      const builtPayload = {
        mode: recordMode,
        task: taskText.trim() || null,
        taskId: taskIdOverride === undefined ? selectedTaskId : taskIdOverride,
        segments: splitSegments.length > 0
          ? splitSegments
          : [{ index: 0, duration, ended_at: new Date(endTimeToUse).toISOString() }],
      };

      // On a retry, prefer the stored draft payload when it carries the same
      // content — this guarantees byte-identical segments and turns a
      // "server committed but the response was lost" retry into a clean
      // already_processed instead of a payload conflict.
      const storedDraft = readPendingSessions()[sessionId];
      const storedV2 = storedDraft ? toDraftV2(sessionId, storedDraft) : null;
      const payload =
        storedV2 &&
        storedV2.ownerId === user.id &&
        draftMatchesBuiltPayload(storedV2, builtPayload)
          ? {
              mode: storedV2.mode,
              task: storedV2.task,
              taskId: storedV2.taskId,
              segments: storedV2.segments,
            }
          : builtPayload;

      try {
        const { data, error } = await callRecordBatchRpc({ sessionId, ...payload });

        if (!error) {
          // 'saved' and 'already_processed' are both durable success: the
          // batch exists on the server exactly once. Cleanup only now; a
          // failed save must keep the intervals and its outbox draft.
          removePendingSession(sessionId);
          pendingSessionIdRef.current = null;
          setIntervals([]);
          currentIntervalStartRef.current = null;

          const savedSeconds =
            typeof data?.total_seconds === 'number'
              ? data.total_seconds
              : sumSegmentSeconds(payload.segments);
          toast.success(`${formatKoreanDuration(savedSeconds)} 기록 저장 완료!`, { id: toastId });
          onRecordSaved();
          return 'saved';
        }

        const kind = classifyRpcError(error);

        if (kind === 'retryable') {
          upsertPendingSession({
            version: 2,
            sessionId,
            ownerId: user.id,
            ...payload,
            failedAt: Date.now(),
          });
          toast.error(
            `저장 실패: ${error.message}\n기록은 임시 보관 중이니 다시 시도해주세요.`,
            { id: toastId, duration: 5000 }
          );
          return 'failed';
        }

        // Terminal server verdicts. Keep the draft in an explicit recovery
        // state (never auto-resent), clear the in-memory session so the next
        // save cannot double-count time the server may already hold.
        upsertPendingSession({
          version: 2,
          sessionId,
          ownerId: user.id,
          ...payload,
          failedAt: Date.now(),
          state: kind === 'conflict' ? 'conflict' : 'invalid',
        });
        pendingSessionIdRef.current = null;
        setIntervals([]);
        currentIntervalStartRef.current = null;
        toast.error(
          kind === 'conflict'
            ? '이 세션은 이미 다른 내용으로 저장되어 있어요. 최근 활동에서 저장된 기록을 확인해주세요.'
            : `기록이 서버 검증에서 거부되었습니다: ${error.message}`,
          { id: toastId, duration: 6000 }
        );
        return 'rejected';
      } catch (error) {
        // Unexpected transport failure: same handling as a retryable error.
        console.error(error);
        upsertPendingSession({
          version: 2,
          sessionId,
          ownerId: user.id,
          ...payload,
          failedAt: Date.now(),
        });
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        toast.error(`저장 실패: ${errorMessage}\n기록은 임시 보관 중이니 다시 시도해주세요.`, { id: toastId, duration: 5000 });
        return 'failed';
      } finally {
        isSavingRef.current = false;
        setIsSaving(false);
      }
    },
    [onRecordSaved, intervals, selectedTaskId, isLoggedIn]
  );

  // Recover drafts orphaned by a reload: a save that failed and never got its
  // in-page retry would otherwise sit in the outbox forever. Recovery sends
  // the exact same RPC with the same batch id, so the server's idempotency
  // contract — not a client-side existence check — decides whether anything
  // is inserted. Concurrent tabs recovering the same draft therefore cannot
  // duplicate it.
  const onRecordSavedRef = useRef(onRecordSaved);
  onRecordSavedRef.current = onRecordSaved;

  useEffect(() => {
    if (!isLoggedIn || typeof window === 'undefined') return;
    let cancelled = false;

    const recoverOrphanedDrafts = async () => {
      const drafts = readPendingSessions();
      if (Object.keys(drafts).length === 0) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      let recoveredSeconds = 0;
      for (const [sessionId, rawDraft] of Object.entries(drafts)) {
        // Skip drafts owned by an in-progress retry or another recovery pass.
        if (sessionId === pendingSessionIdRef.current || recoveringSessionIds.has(sessionId)) {
          continue;
        }

        const draft = rawDraft ? toDraftV2(sessionId, rawDraft) : null;
        if (!draft) {
          // Never silently discard a draft we cannot convert — keep it so the
          // study time stays inspectable/recoverable.
          console.error('Unrecognized pending session draft; leaving it untouched', sessionId);
          continue;
        }
        // Drafts from another account stay put until that account signs in.
        if (draft.ownerId !== user.id) continue;
        // Flagged drafts are terminal: the server already gave its verdict.
        if (draft.state) continue;

        recoveringSessionIds.add(sessionId);
        try {
          const { data, error } = await callRecordBatchRpc(draft);
          if (!error) {
            // 'already_processed' proves the original attempt landed; only a
            // fresh 'saved' contributes to the recovered-time toast.
            removePendingSession(sessionId);
            if (data?.status === 'saved') {
              recoveredSeconds +=
                typeof data?.total_seconds === 'number'
                  ? data.total_seconds
                  : sumSegmentSeconds(draft.segments);
            }
          } else {
            const kind = classifyRpcError(error);
            if (kind === 'retryable') {
              // Keep the draft for the next mount (upgraded to v2 in place).
              upsertPendingSession(draft);
            } else {
              upsertPendingSession({
                ...draft,
                state: kind === 'conflict' ? 'conflict' : 'invalid',
              });
              console.error('Pending session draft rejected by the server', sessionId, error);
            }
          }
        } catch (e) {
          // Transport failure: keep the draft for the next mount.
          console.error('Failed to recover pending session draft', e);
        } finally {
          recoveringSessionIds.delete(sessionId);
        }
      }

      if (!cancelled && recoveredSeconds > 0) {
        toast.success(`보관 중이던 ${formatKoreanDuration(recoveredSeconds)} 기록을 저장했습니다!`);
        onRecordSavedRef.current();
      }
    };

    recoverOrphanedDrafts();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  // Set online on mount / offline on unmount
  useEffect(() => {
    const setOnline = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').update({
          status: 'online',
          last_active_at: new Date().toISOString(),
        }).eq('id', user.id);
      }
    };
    setOnline();

    const handleUnload = () => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const projectId = supabaseUrl.split('//')[1]?.split('.')[0];
      const currentSessionString = projectId
        ? localStorage.getItem(`sb-${projectId}-auth-token`)
        : null;

      if (currentSessionString) {
        try {
          const session = JSON.parse(currentSessionString);
          if (session?.access_token && session?.user?.id) {
            const blob = new Blob([JSON.stringify({
              status: 'offline',
              user_id: session.user.id,
              access_token: session.access_token
            })], { type: 'application/json' });

            navigator.sendBeacon('/api/status', blob);
          }
        } catch (e) {
          console.error('Error parsing session for beacon', e);
        }
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
    }
  }, []);


  return {
    isSaving,
    intervals,
    setIntervals,
    currentIntervalStartRef,
    updateStatus,
    saveRecord,
    // Detaches the current batch id so the NEXT save starts a fresh session.
    // Needed after a one-shot save of a displaced record: if that save failed,
    // its id stays in pendingSessionIdRef, and a later interactive save would
    // reuse it with different content — deleting the displaced record's outbox
    // draft on success without ever saving it.
    releasePendingSession: useCallback(() => {
      pendingSessionIdRef.current = null;
    }, []),
    checkActiveSession: useCallback(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data } = await supabase
          .from('profiles')
          .select('status, study_start_time, total_stopwatch_time, timer_type, timer_mode, timer_duration')
          .eq('id', user.id)
          .single();

        return data;
      } catch (e) {
        console.error('Failed to check active session', e);
        return null;
      }
    }, []),
  };
};
