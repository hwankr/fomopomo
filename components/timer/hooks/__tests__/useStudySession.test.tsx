import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { StrictMode } from 'react';

const { supabaseMock, toastMock } = vi.hoisted(() => {
  const toastFn = Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(() => 'toast-1'),
    dismiss: vi.fn(),
  });
  return {
    supabaseMock: {
      auth: {
        getUser: vi.fn(),
        getSession: vi.fn(),
      },
      from: vi.fn(),
      rpc: vi.fn(),
      rpcResult: vi.fn(),
      setHeader: vi.fn(),
    },
    toastMock: toastFn,
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

vi.mock('react-hot-toast', () => ({
  default: toastMock,
}));

import { useStudySession, type PendingStudyRecord, type SaveRecordResult } from '../useStudySession';

const PENDING_SESSIONS_KEY = 'fomopomo_pending_sessions';
// createPendingRecord resolves the record owner synchronously from the
// persisted Supabase session (lib/userScopedStorage.getCurrentUserId), so the
// tests must provide the env-derived token key and a stored session.
const AUTH_TOKEN_KEY = 'sb-testproj-auth-token';

type OutboxSegment = { index: number; duration: number; ended_at: string };

type OutboxDraftV2 = {
  version: 2;
  sessionId: string;
  ownerId: string;
  mode: string;
  task: string | null;
  taskId: string | null;
  subjectId?: string | null;
  labelsLocked?: boolean;
  segments: OutboxSegment[];
  failedAt: number;
  state?: 'conflict' | 'invalid';
};

type Outbox = Record<string, OutboxDraftV2 & { rows?: unknown[] }>;

type RpcParams = {
  p_batch_id: string;
  p_mode: string;
  p_task: string | null;
  p_task_id: string | null;
  p_subject_id?: string | null;
  p_segments: OutboxSegment[];
};

const readOutbox = (): Outbox =>
  JSON.parse(window.localStorage.getItem(PENDING_SESSIONS_KEY) ?? '{}');

const rpcOk = (status: 'saved' | 'already_processed', totalSeconds: number) => ({
  data: { status, total_seconds: totalSeconds, segment_count: 1 },
  error: null,
});

const rpcNetworkError = () => ({
  data: null,
  error: { message: 'TypeError: Failed to fetch' },
});

const rpcConflictError = () => ({
  data: null,
  error: {
    code: '23505',
    message:
      'study_session_batch_conflict: batch was already recorded with a different payload',
  },
});

const rpcValidationError = () => ({
  data: null,
  error: { code: '22023', message: 'segment duration must be between 10 and 86399 seconds' },
});

describe('useStudySession study records', () => {
  const onRecordSaved = vi.fn();

  const renderStudySession = () =>
    renderHook(() =>
      useStudySession({
        isLoggedIn: true,
        onRecordSaved,
        selectedTaskTitle: '',
      })
    );

  beforeEach(() => {
    // Fix the clock at noon so intervals never straddle the 05:00 boundary.
    vi.useFakeTimers({ now: new Date('2026-08-07T12:00:00') });
    window.localStorage.clear();
    vi.clearAllMocks();

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://testproj.supabase.co');
    window.localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify({ user: { id: 'user-1' } }));

    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    supabaseMock.auth.getSession.mockImplementation(async () => {
      const session = JSON.parse(window.localStorage.getItem(AUTH_TOKEN_KEY) ?? 'null');
      return { data: { session: session ? { ...session, access_token: `token-${session.user.id}` } : null }, error: null };
    });
    supabaseMock.rpc.mockImplementation((name: string, params: RpcParams) => ({
      setHeader: (header: string, value: string) => {
        supabaseMock.setHeader(header, value);
        return supabaseMock.rpcResult(name, params);
      },
    }));
    const profileUpdate = {
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      then: (resolve: (result: { error: null }) => void) => resolve({ error: null }),
    };
    supabaseMock.from.mockImplementation(() => ({
      // profiles: mount-time status update + privacy lookup
      update: vi.fn(() => profileUpdate),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: null }) })),
      })),
    }));
    supabaseMock.rpcResult.mockResolvedValue(rpcOk('saved', 60));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  const createRecord = (
    result: { current: ReturnType<typeof useStudySession> },
    mode: string,
    duration: number,
    forcedEndTime?: number
  ): PendingStudyRecord => {
    let record: PendingStudyRecord | null = null;
    act(() => {
      record = result.current.createPendingRecord(mode, duration, forcedEndTime);
    });
    expect(record).not.toBeNull();
    return record as unknown as PendingStudyRecord;
  };

  it('keeps a durable labeled draft when the RPC fails; the content already moved into the record', async () => {
    supabaseMock.rpcResult.mockResolvedValue(rpcNetworkError());
    const { result } = renderStudySession();

    const end = Date.now();
    const start = end - 60_000;
    act(() => {
      result.current.setIntervals([{ start, end }]);
    });

    const record = createRecord(result, 'stopwatch', 60, end);
    // Creation consumed the live state: the record is the single owner of
    // the content, so the next session cannot double-count it.
    expect(result.current.intervals).toEqual([]);
    expect(result.current.currentIntervalStartRef.current).toBeNull();

    let saveResult: SaveRecordResult | undefined;
    await act(async () => {
      saveResult = await result.current.savePendingRecord(record, '수학', null);
    });

    expect(saveResult).toBe('failed');
    expect(onRecordSaved).not.toHaveBeenCalled();

    // The study time survives as a durable draft keyed by the record's batch
    // id, carrying the label so recovery saves it fully.
    const outbox = readOutbox();
    const drafts = Object.values(outbox);
    expect(drafts).toHaveLength(1);
    const draft = drafts[0];
    expect(draft.sessionId).toBe(record.sessionId);
    expect(draft.version).toBe(2);
    expect(draft.ownerId).toBe('user-1');
    expect(draft.task).toBe('수학');
    expect(draft.segments.reduce((sum, s) => sum + s.duration, 0)).toBe(60);

    // The RPC received the record's batch id and segments, and never a
    // client-supplied user id.
    const params = supabaseMock.rpc.mock.calls[0][1] as RpcParams;
    expect(supabaseMock.rpc.mock.calls[0][0]).toBe('record_study_session_batch');
    expect(params.p_batch_id).toBe(record.sessionId);
    expect(params.p_segments).toEqual(record.segments);
    expect(params).not.toHaveProperty('p_user_id');
  });

  it('clears the outbox after a confirmed successful save', async () => {
    const { result } = renderStudySession();

    const end = Date.now();
    act(() => {
      result.current.setIntervals([{ start: end - 60_000, end }]);
    });

    const record = createRecord(result, 'stopwatch', 60, end);
    // The parked draft exists from creation, before any network activity.
    expect(Object.keys(readOutbox())).toEqual([record.sessionId]);

    let saveResult: SaveRecordResult | undefined;
    await act(async () => {
      saveResult = await result.current.savePendingRecord(record, '', null);
    });

    expect(saveResult).toBe('saved');
    expect(onRecordSaved).toHaveBeenCalledTimes(1);
    expect(readOutbox()).toEqual({});
  });

  it('queues distinct task records with durable labels and deduplicates concurrent saves of one record', async () => {
    const { result } = renderStudySession();
    let resolveFirst!: (value: ReturnType<typeof rpcOk>) => void;
    let resolveSecond!: (value: ReturnType<typeof rpcOk>) => void;
    supabaseMock.rpcResult
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve; }));
    const first = createRecord(result, 'pomo', 1200);
    const second = createRecord(result, 'pomo', 300);
    let firstSave!: Promise<SaveRecordResult>;
    let duplicateSave!: Promise<SaveRecordResult>;
    let secondSave!: Promise<SaveRecordResult>;
    act(() => {
      firstSave = result.current.savePendingRecord(first, '작업 A', 'task-a', 'subject-a');
      duplicateSave = result.current.savePendingRecord(first, '변경된 A', 'wrong-task');
      secondSave = result.current.savePendingRecord(second, '작업 B', 'task-b', 'subject-b');
    });
    expect(duplicateSave).toBe(firstSave);
    expect(readOutbox()[second.sessionId]).toMatchObject({ task: '작업 B', taskId: 'task-b', subjectId: 'subject-b' });
    expect(result.current.isSaving).toBe(true);
    await act(async () => {});
    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);

    await act(async () => { resolveFirst(rpcOk('saved', 1200)); await firstSave; });
    expect(result.current.isSaving).toBe(true);
    expect(supabaseMock.rpc).toHaveBeenCalledTimes(2);
    expect(supabaseMock.rpc.mock.calls[1][1]).toMatchObject({ p_task: '작업 B', p_task_id: 'task-b', p_subject_id: 'subject-b' });
    await act(async () => { resolveSecond(rpcOk('saved', 300)); await secondSave; });
    expect(result.current.isSaving).toBe(false);
    expect(readOutbox()).toEqual({});
    expect(onRecordSaved).toHaveBeenCalledTimes(2);
  });

  it('continues queued saves after a network failure and keeps the first task immutable on retry', async () => {
    const { result } = renderStudySession();
    supabaseMock.rpcResult.mockResolvedValueOnce(rpcNetworkError());
    const first = createRecord(result, 'pomo', 1200);
    const second = createRecord(result, 'pomo', 300);
    await act(async () => {
      expect(await Promise.all([
        result.current.savePendingRecord(first, '작업 A', 'task-a', 'subject-a'),
        result.current.savePendingRecord(second, '작업 B', 'task-b', 'subject-b'),
      ])).toEqual(['failed', 'saved']);
    });
    const firstParams = supabaseMock.rpc.mock.calls[0][1];
    expect(readOutbox()[first.sessionId]).toMatchObject({ task: '작업 A', taskId: 'task-a', subjectId: 'subject-a' });
    await act(async () => { await result.current.savePendingRecord(first, '작업 B', 'task-b', 'subject-b'); });
    expect(supabaseMock.rpc.mock.calls[2][1]).toEqual(firstParams);
    expect(readOutbox()).toEqual({});
  });

  it('leaves a queued record with its original labels when the account changes before sending', async () => {
    const view = renderStudySession();
    let resolveFirst!: (value: ReturnType<typeof rpcOk>) => void;
    supabaseMock.rpcResult.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
    const first = createRecord(view.result, 'pomo', 1200);
    const second = createRecord(view.result, 'pomo', 300);
    let firstSave!: Promise<SaveRecordResult>;
    let secondSave!: Promise<SaveRecordResult>;
    act(() => {
      firstSave = view.result.current.savePendingRecord(first, '작업 A', 'task-a');
      secondSave = view.result.current.savePendingRecord(second, '작업 B', 'task-b');
    });
    await act(async () => {});
    window.localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify({ user: { id: 'user-2' } }));
    view.rerender();
    await act(async () => {
      resolveFirst(rpcOk('saved', 1200));
      expect(await firstSave).toBe('saved');
      expect(await secondSave).toBe('skipped');
    });
    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    expect(onRecordSaved).not.toHaveBeenCalled();
    expect(view.result.current.isSaving).toBe(false);
    expect(readOutbox()[second.sessionId]).toMatchObject({ ownerId: 'user-1', task: '작업 B', taskId: 'task-b' });

    window.localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify({ user: { id: 'user-1' } }));
    view.rerender();
    await act(async () => {});
    expect(supabaseMock.rpc).toHaveBeenCalledTimes(2);
    expect(supabaseMock.rpc.mock.calls[1][1]).toMatchObject({ p_task: '작업 B', p_task_id: 'task-b' });
    expect(readOutbox()).toEqual({});
  });

  it('keeps the captured subject after a task is renamed, reclassified, or deleted before saving', async () => {
    const { result, rerender } = renderHook(
      ({ title, subjectId }) => useStudySession({
        isLoggedIn: true, onRecordSaved, selectedTaskTitle: title, selectedSubjectId: subjectId,
      }),
      { initialProps: { title: '블록체인 9/12 복습', subjectId: 'subject-blockchain' as string | null } }
    );
    const record = createRecord(result, 'pomo', 60, Date.now());
    expect(readOutbox()[record.sessionId].subjectId).toBe('subject-blockchain');

    rerender({ title: '다른 이름', subjectId: 'subject-coding' });
    rerender({ title: '', subjectId: null });
    await act(async () => {
      await result.current.savePendingRecord(record, '블록체인 9/12 복습', 'deleted-task');
    });

    expect(supabaseMock.rpc).toHaveBeenCalledWith('record_study_session_batch', expect.objectContaining({
      p_task: '블록체인 9/12 복습', p_task_id: 'deleted-task', p_subject_id: 'subject-blockchain',
    }));
  });

  it('freezes a modal subject before the RPC and preserves it across offline retry and the next session', async () => {
    supabaseMock.rpcResult.mockResolvedValueOnce(rpcNetworkError());
    const { result, rerender } = renderHook(
      ({ subjectId }) => useStudySession({
        isLoggedIn: true, onRecordSaved, selectedTaskTitle: '', selectedSubjectId: subjectId,
      }),
      { initialProps: { subjectId: null as string | null } }
    );
    const record = createRecord(result, 'pomo', 60, Date.now());
    rerender({ subjectId: 'subject-next-session' });
    result.current.currentIntervalStartRef.current = Date.now() + 1000;
    await act(async () => {
      await result.current.savePendingRecord(record, '코딩테스트 XX문제', 'task-coding', 'subject-coding');
    });
    const firstParams = supabaseMock.rpc.mock.calls[0][1];
    expect(firstParams.p_subject_id).toBe('subject-coding');
    expect(readOutbox()[record.sessionId].subjectId).toBe('subject-coding');

    await act(async () => {
      await result.current.savePendingRecord(record, '변경된 입력', 'different-task', 'different-subject');
    });
    expect(supabaseMock.rpc.mock.calls[1][1]).toEqual(firstParams);
    expect(result.current.currentIntervalStartRef.current).toBe(Date.now() + 1000);
  });

  it('captures the restored snapshot subject instead of the current selection', () => {
    const { result } = renderHook(() => useStudySession({
      isLoggedIn: true, onRecordSaved, selectedTaskTitle: '', selectedSubjectId: 'live-subject',
    }));
    let record: PendingStudyRecord | null = null;
    act(() => {
      record = result.current.createPendingRecord('pomo', 60, Date.now(), {
        intervals: [], currentStart: Date.now() - 60_000, subjectId: 'restored-subject',
      });
    });
    expect(record).toMatchObject({ subjectId: 'restored-subject' });
    expect(Object.values(readOutbox())[0].subjectId).toBe('restored-subject');
  });

  it.each([null, 'subject-before-clear'])('preserves an unclassified choice instead of taking a later live subject (%s)', async (initialSubject) => {
    const { result, rerender } = renderHook(
      ({ subjectId }) => useStudySession({
        isLoggedIn: true, onRecordSaved, selectedTaskTitle: '', selectedSubjectId: subjectId,
      }),
      { initialProps: { subjectId: initialSubject as string | null } }
    );
    const record = createRecord(result, 'pomo', 60, Date.now());
    rerender({ subjectId: 'next-session-subject' });
    await act(async () => {
      if (initialSubject) await result.current.savePendingRecord(record, '미분류 복습', 'task-1', null);
      else await result.current.savePendingRecord(record, '미분류 복습', 'task-1');
    });
    expect(supabaseMock.rpc.mock.calls[0][1]).not.toHaveProperty('p_subject_id');
  });

  it('retries the same record with a byte-identical payload, and treats already_processed as saved', async () => {
    // First attempt: the server committed the batch but the response was lost.
    supabaseMock.rpcResult
      .mockResolvedValueOnce(rpcNetworkError())
      .mockResolvedValueOnce(rpcOk('already_processed', 60));
    const { result } = renderStudySession();

    const end = Date.now();
    act(() => {
      result.current.setIntervals([{ start: end - 60_000, end }]);
    });

    const record = createRecord(result, 'stopwatch', 60, end);
    await act(async () => {
      await result.current.savePendingRecord(record, '', null);
    });
    expect(Object.keys(readOutbox())).toEqual([record.sessionId]);

    let retryResult: SaveRecordResult | undefined;
    await act(async () => {
      retryResult = await result.current.savePendingRecord(record, '', null);
    });

    // already_processed is durable success: no duplicate row exists and the
    // outbox draft is released.
    expect(retryResult).toBe('saved');
    expect(onRecordSaved).toHaveBeenCalledTimes(1);
    expect(readOutbox()).toEqual({});

    const firstParams = supabaseMock.rpc.mock.calls[0][1] as RpcParams;
    const retryParams = supabaseMock.rpc.mock.calls[1][1] as RpcParams;
    // The idempotency key AND the canonical payload are byte-identical, so
    // the server can prove the retry duplicates the committed batch.
    expect(retryParams.p_batch_id).toBe(record.sessionId);
    expect(retryParams).toEqual(firstParams);
  });

  it('parks an unlabeled-save conflict in an explicit conflict state', async () => {
    supabaseMock.rpcResult.mockResolvedValueOnce(rpcConflictError());
    const { result } = renderStudySession();

    const end = Date.now();
    act(() => {
      result.current.setIntervals([{ start: end - 60_000, end }]);
    });

    const record = createRecord(result, 'stopwatch', 60, end);
    let saveResult: SaveRecordResult | undefined;
    await act(async () => {
      saveResult = await result.current.savePendingRecord(record, '', null);
    });

    expect(saveResult).toBe('rejected');
    // The draft is preserved in an explicit recovery state instead of being
    // retried forever or silently dropped.
    const drafts = Object.values(readOutbox());
    expect(drafts).toHaveLength(1);
    expect(drafts[0].state).toBe('conflict');
    expect(toastMock.error).toHaveBeenCalled();
    expect(onRecordSaved).not.toHaveBeenCalled();
  });

  it('treats a labeled-save conflict as content-already-saved and releases the draft', async () => {
    // Another tab's mount recovery committed the parked unlabeled twin; the
    // answered save then collides on the same batch id. The time is on the
    // server exactly once — only the label could not be attached.
    supabaseMock.rpcResult.mockResolvedValueOnce(rpcConflictError());
    const { result } = renderStudySession();

    const end = Date.now();
    act(() => {
      result.current.setIntervals([{ start: end - 60_000, end }]);
    });

    const record = createRecord(result, 'stopwatch', 60, end);
    let saveResult: SaveRecordResult | undefined;
    await act(async () => {
      saveResult = await result.current.savePendingRecord(record, '독서', null);
    });

    expect(saveResult).toBe('saved');
    expect(readOutbox()).toEqual({});
    expect(onRecordSaved).toHaveBeenCalledTimes(1);
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('parks the draft as invalid on a permanent validation error', async () => {
    supabaseMock.rpcResult.mockResolvedValueOnce(rpcValidationError());
    const { result } = renderStudySession();

    const end = Date.now();
    act(() => {
      result.current.setIntervals([{ start: end - 60_000, end }]);
    });

    const record = createRecord(result, 'stopwatch', 60, end);
    let saveResult: SaveRecordResult | undefined;
    await act(async () => {
      saveResult = await result.current.savePendingRecord(record, '', null);
    });

    expect(saveResult).toBe('rejected');
    const drafts = Object.values(readOutbox());
    expect(drafts).toHaveLength(1);
    expect(drafts[0].state).toBe('invalid');
  });

  describe('outbox recovery on mount', () => {
    const seedDraftV2 = (
      sessionId: string,
      ownerId: string,
      duration = 120,
      state?: 'conflict' | 'invalid',
      task: string | null = null
    ) => {
      const draft: OutboxDraftV2 = {
        version: 2,
        sessionId,
        ownerId,
        mode: 'stopwatch',
        task,
        taskId: null,
        segments: [
          { index: 0, duration, ended_at: new Date(Date.now() - 60_000).toISOString() },
        ],
        failedAt: Date.now() - 60_000,
        ...(state ? { state } : {}),
      };
      window.localStorage.setItem(
        PENDING_SESSIONS_KEY,
        JSON.stringify({ [sessionId]: draft })
      );
      return draft;
    };

    it('recovers the original subject after reload and leaves another account subject untouched', async () => {
      const own = seedDraftV2('subject-recovery', 'user-1');
      const foreign = { ...own, sessionId: 'foreign-subject', ownerId: 'user-2', subjectId: 'private-subject' };
      window.localStorage.setItem(PENDING_SESSIONS_KEY, JSON.stringify({
        [own.sessionId]: { ...own, subjectId: 'saved-subject' },
        [foreign.sessionId]: foreign,
      }));

      renderStudySession();
      await act(async () => {});

      expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
      expect(supabaseMock.rpc).toHaveBeenCalledWith('record_study_session_batch', expect.objectContaining({
        p_batch_id: own.sessionId, p_subject_id: 'saved-subject',
      }));
      expect(readOutbox()).toEqual({ [foreign.sessionId]: foreign });
    });

    // v1 drafts predate the RPC migration and carry full study_sessions rows;
    // drafts from before the session_batch_id migration only carry group_id.
    const seedLegacyDraft = (
      sessionId: string,
      userId: string,
      duration = 120,
      shape: 'current' | 'legacy' = 'current'
    ) => {
      const createdAt = new Date(Date.now() - 60_000).toISOString();
      window.localStorage.setItem(
        PENDING_SESSIONS_KEY,
        JSON.stringify({
          [sessionId]: {
            sessionId,
            rows: [
              {
                mode: 'stopwatch',
                duration,
                user_id: userId,
                task: '수학',
                task_id: null,
                created_at: createdAt,
                ...(shape === 'legacy'
                  ? { group_id: sessionId }
                  : { session_batch_id: sessionId }),
              },
            ],
            failedAt: Date.now() - 60_000,
          },
        })
      );
      return { createdAt };
    };

    it('flushes an orphaned draft through the recording RPC and clears it on saved', async () => {
      supabaseMock.rpcResult.mockResolvedValue(rpcOk('saved', 120));
      seedDraftV2('draft-recover-1', 'user-1');

      renderStudySession();
      await act(async () => {});

      expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
      const params = supabaseMock.rpc.mock.calls[0][1] as RpcParams;
      expect(params.p_batch_id).toBe('draft-recover-1');
      expect(readOutbox()).toEqual({});
      expect(onRecordSaved).toHaveBeenCalledTimes(1);
      expect(toastMock.success).toHaveBeenCalledWith('보관 중이던 2분 기록을 저장했습니다!');
    });

    it('drops a draft without a duplicate toast when the server says already_processed', async () => {
      // The original save landed but the response was lost before the draft
      // was cleared: the server, not a client-side SELECT, proves it.
      supabaseMock.rpcResult.mockResolvedValue(rpcOk('already_processed', 120));
      seedDraftV2('draft-already-saved', 'user-1');

      renderStudySession();
      await act(async () => {});

      expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
      expect(readOutbox()).toEqual({});
      expect(onRecordSaved).not.toHaveBeenCalled();
      expect(toastMock.success).not.toHaveBeenCalled();
    });

    it('converts a legacy v1 draft into the v2 RPC payload without sending user_id', async () => {
      supabaseMock.rpcResult.mockResolvedValue(rpcOk('saved', 120));
      const { createdAt } = seedLegacyDraft('draft-v1', 'user-1');

      renderStudySession();
      await act(async () => {});

      expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
      const params = supabaseMock.rpc.mock.calls[0][1] as RpcParams;
      expect(params.p_batch_id).toBe('draft-v1');
      expect(params.p_mode).toBe('stopwatch');
      expect(params.p_task).toBe('수학');
      expect(params.p_segments).toEqual([{ index: 0, duration: 120, ended_at: createdAt }]);
      expect(params).not.toHaveProperty('p_user_id');
      expect(readOutbox()).toEqual({});
    });

    it('converts a pre-migration draft whose batch id only lives in group_id', async () => {
      supabaseMock.rpcResult.mockResolvedValue(rpcOk('saved', 120));
      seedLegacyDraft('draft-legacy-1', 'user-1', 120, 'legacy');

      renderStudySession();
      await act(async () => {});

      expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
      const params = supabaseMock.rpc.mock.calls[0][1] as RpcParams;
      expect(params.p_batch_id).toBe('draft-legacy-1');
      expect(readOutbox()).toEqual({});
    });

    it("leaves another account's draft untouched and unsent", async () => {
      seedDraftV2('draft-foreign', 'user-2');

      renderStudySession();
      await act(async () => {});

      expect(supabaseMock.rpc).not.toHaveBeenCalled();
      expect(Object.keys(readOutbox())).toEqual(['draft-foreign']);
    });

    it('stops between drafts on an account switch and recovers them when their owner returns', async () => {
      const first = seedDraftV2('draft-first', 'user-1');
      const second = seedDraftV2('draft-second', 'user-1');
      window.localStorage.setItem(PENDING_SESSIONS_KEY, JSON.stringify({ [first.sessionId]: first, [second.sessionId]: second }));
      let resolveFirst!: (value: ReturnType<typeof rpcOk>) => void;
      supabaseMock.rpcResult.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
      const view = renderStudySession();
      await act(async () => {});
      expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);

      window.localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify({ user: { id: 'user-2' } }));
      view.rerender(); // Login remains true: the account identity is the dependency.
      await act(async () => { resolveFirst(rpcOk('saved', 120)); });
      expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
      expect(Object.keys(readOutbox())).toEqual(['draft-second']);
      expect(onRecordSaved).not.toHaveBeenCalled();

      window.localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify({ user: { id: 'user-1' } }));
      view.rerender();
      await act(async () => {});
      expect(supabaseMock.rpc).toHaveBeenCalledTimes(2);
      expect(readOutbox()).toEqual({});
      expect(supabaseMock.setHeader).toHaveBeenNthCalledWith(2, 'Authorization', 'Bearer token-user-1');
    });

    it('does not send a draft after cancellation while its session lookup is pending', async () => {
      seedDraftV2('draft-session-wait', 'user-1');
      let resolveSession!: (value: unknown) => void;
      supabaseMock.auth.getSession.mockImplementationOnce(() => new Promise(resolve => { resolveSession = resolve; }));
      const view = renderStudySession();
      await act(async () => {});
      view.unmount();
      await act(async () => {
        resolveSession({ data: { session: { user: { id: 'user-1' }, access_token: 'token-user-1' } }, error: null });
      });
      expect(supabaseMock.rpc).not.toHaveBeenCalled();
      expect(Object.keys(readOutbox())).toEqual(['draft-session-wait']);
    });

    it('keeps the owner Authorization when the real SDK reads a different account at fetch time', async () => {
      seedDraftV2('draft-bound-token', 'user-1');
      const sentHeaders: Headers[] = [];
      let sendingRecord = false;
      const client = createClient('https://record-test.supabase.co', 'anon-test-key', {
        accessToken: async () => {
          if (sendingRecord) window.localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify({ user: { id: 'user-2' } }));
          return 'token-user-2';
        },
        global: {
          fetch: async (_input, init) => {
            sentHeaders.push(new Headers(init?.headers));
            return new Response(JSON.stringify({ status: 'saved', total_seconds: 120 }), {
              status: 200, headers: { 'Content-Type': 'application/json' },
            });
          },
        },
      });
      supabaseMock.rpc.mockImplementation((name: string, params: RpcParams) => {
        sendingRecord = true;
        return client.rpc(name, params);
      });
      renderStudySession();
      await act(async () => {});
      expect(sentHeaders).toHaveLength(1);
      expect(sentHeaders[0].get('Authorization')).toBe('Bearer token-user-1');
      expect(readOutbox()).toEqual({});
      expect(onRecordSaved).not.toHaveBeenCalled();
    });

    it('keeps an unconvertible draft instead of silently discarding it', async () => {
      window.localStorage.setItem(
        PENDING_SESSIONS_KEY,
        JSON.stringify({ 'draft-garbled': { sessionId: 'draft-garbled', rows: 'not-rows' } })
      );

      renderStudySession();
      await act(async () => {});

      expect(supabaseMock.rpc).not.toHaveBeenCalled();
      expect(Object.keys(readOutbox())).toEqual(['draft-garbled']);
    });

    it('keeps the draft for the next mount when recovery hits a network error', async () => {
      supabaseMock.rpcResult.mockResolvedValue(rpcNetworkError());
      seedDraftV2('draft-retry-later', 'user-1');

      renderStudySession();
      await act(async () => {});

      expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
      const outbox = readOutbox();
      expect(Object.keys(outbox)).toEqual(['draft-retry-later']);
      expect(outbox['draft-retry-later'].state).toBeUndefined();
    });

    it('flags a conflicted labeled draft during recovery and never auto-resends it', async () => {
      supabaseMock.rpcResult.mockResolvedValue(rpcConflictError());
      seedDraftV2('draft-conflict', 'user-1', 120, undefined, '수학');

      const first = renderStudySession();
      await act(async () => {});
      first.unmount();

      expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
      expect(readOutbox()['draft-conflict'].state).toBe('conflict');

      // A later mount must not retry a draft the server already refused.
      renderStudySession();
      await act(async () => {});
      expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    });

    it('drops an unlabeled draft whose batch already exists — the labeled twin won the race', async () => {
      // The answered (labeled) save committed the batch, but the page unloaded
      // before the parked unlabeled twin was cleaned up. The conflict proves
      // the content is on the server; keeping the twin flagged forever would
      // just accumulate zombie drafts.
      supabaseMock.rpcResult.mockResolvedValue(rpcConflictError());
      seedDraftV2('draft-labeled-twin', 'user-1');

      renderStudySession();
      await act(async () => {});

      expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
      expect(readOutbox()).toEqual({});
    });

    it('sends a shared draft exactly once when two hook instances recover concurrently', async () => {
      // StrictMode double-mount / two components: the in-flight guard plus the
      // server idempotency contract mean the draft is recorded exactly once.
      supabaseMock.rpcResult.mockResolvedValue(rpcOk('saved', 120));
      seedDraftV2('draft-strict-mode', 'user-1');

      renderStudySession();
      renderStudySession();
      await act(async () => {});

      expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
      const params = supabaseMock.rpc.mock.calls[0][1] as RpcParams;
      expect(params.p_batch_id).toBe('draft-strict-mode');
      expect(readOutbox()).toEqual({});
    });

    it('recovers a draft after StrictMode cancels the first effect setup', async () => {
      seedDraftV2('draft-strict-remount', 'user-1');
      renderHook(() => useStudySession({ isLoggedIn: true, onRecordSaved, selectedTaskTitle: '' }), {
        wrapper: StrictMode,
      });
      await act(async () => {});
      expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
      expect(readOutbox()).toEqual({});
    });
  });

  describe('createPendingRecord (atomic record creation)', () => {
    it('retains short pause-separated fragments in the authoritative elapsed total', () => {
      const { result } = renderStudySession();
      const end = Date.now();
      act(() => {
        result.current.setIntervals([
          { start: end - 120_000, end: end - 115_000 },
          { start: end - 90_000, end: end - 30_000 },
          { start: end - 4_000, end },
        ]);
      });
      const record = createRecord(result, 'pomo', 69, end);
      expect(record.segments).toEqual([{ index: 0, duration: 69, ended_at: new Date(end).toISOString() }]);
    });

    it('conserves elapsed seconds across fractional intervals instead of independently rounding each one', () => {
      const { result } = renderStudySession();
      const end = Date.now();
      act(() => {
        result.current.setIntervals([
          { start: end - 90_400, end: end - 80_000 },
          { start: end - 50_400, end: end - 40_000 },
          { start: end - 10_400, end },
        ]);
      });
      const record = createRecord(result, 'pomo', 31, end);
      expect(record.segments.map(segment => segment.duration)).toEqual([10, 11, 10]);
      expect(record.segments.reduce((sum, segment) => sum + segment.duration, 0)).toBe(31);
      record.segments.slice(1).forEach((segment, index) => {
        expect(Date.parse(segment.ended_at) - segment.duration * 1000).toBeGreaterThanOrEqual(Date.parse(record.segments[index].ended_at));
      });
    });

    it('retains repeated subsecond resumes once their total is savable', () => {
      const { result } = renderStudySession();
      const end = Date.now();
      act(() => {
        result.current.setIntervals(Array.from({ length: 20 }, (_, index) => ({
          start: end - (19 - index) * 2000 - 600,
          end: end - (19 - index) * 2000,
        })));
      });
      const record = createRecord(result, 'pomo', 12, end);
      expect(record.segments).toEqual([{ index: 0, duration: 12, ended_at: new Date(end).toISOString() }]);
    });

    it('rechecks the preceding neighbor when rounding merges an overlapping slice', () => {
      const { result } = renderStudySession();
      const base = Date.now() - 64_000;
      act(() => {
        result.current.setIntervals([
          [1007, 11399], [11701, 23517], [23528, 38276], [39452, 51205], [51739, 63132],
        ].map(([start, end]) => ({ start: base + start, end: base + end })));
      });
      const record = createRecord(result, 'pomo', 60, base + 63132);
      expect(record.segments.map(segment => segment.duration)).toEqual([37, 12, 11]);
      record.segments.slice(1).forEach((segment, index) => {
        expect(Date.parse(segment.ended_at) - segment.duration * 1000).toBeGreaterThanOrEqual(Date.parse(record.segments[index].ended_at));
      });
    });

    it('preserves normal study-day splits and their exact total', () => {
      const { result } = renderStudySession();
      const start = new Date('2026-08-07T04:50:00').getTime();
      const boundary = new Date('2026-08-07T05:00:00').getTime();
      const end = new Date('2026-08-07T05:10:00').getTime();
      act(() => { result.current.setIntervals([{ start, end }]); });
      const record = createRecord(result, 'pomo', 1200, end);
      expect(record.segments).toEqual([
        { index: 0, duration: 600, ended_at: new Date(boundary - 1).toISOString() },
        { index: 1, duration: 600, ended_at: new Date(end).toISOString() },
      ]);
    });

    it('coalesces a short boundary fragment inside its own study day when possible', () => {
      const { result } = renderStudySession();
      const boundary = new Date('2026-08-07T05:00:00').getTime();
      const end = boundary + 30_000;
      act(() => {
        result.current.setIntervals([
          { start: boundary - 25_000, end: boundary - 5_000 },
          { start: boundary - 4_000, end },
        ]);
      });
      const record = createRecord(result, 'pomo', 54, end);
      expect(record.segments).toEqual([
        { index: 0, duration: 24, ended_at: new Date(boundary - 1).toISOString() },
        { index: 1, duration: 30, ended_at: new Date(end).toISOString() },
      ]);
    });

    it('keeps a subminimum study-day contribution by attaching it to the adjacent day', () => {
      const { result } = renderStudySession();
      const boundary = new Date('2026-08-07T05:00:00').getTime();
      const end = boundary + 55_000;
      act(() => { result.current.setIntervals([{ start: boundary - 5_000, end }]); });
      const record = createRecord(result, 'pomo', 60, end);
      expect(record.segments).toEqual([{ index: 0, duration: 60, ended_at: new Date(end).toISOString() }]);
    });

    it('keeps a full study day within RPC duration and ordering limits', () => {
      const { result } = renderStudySession();
      const start = new Date('2026-08-06T05:00:00').getTime();
      const end = new Date('2026-08-07T05:00:00').getTime();
      act(() => { result.current.setIntervals([{ start, end }]); });
      const record = createRecord(result, 'stopwatch', 86400, end);
      expect(record.segments.reduce((sum, segment) => sum + segment.duration, 0)).toBe(86400);
      expect(record.segments).toHaveLength(2);
      expect(record.segments.every(segment => segment.duration >= 10 && segment.duration < 86400)).toBe(true);
      expect(Date.parse(record.segments[1].ended_at) - record.segments[1].duration * 1000).toBe(Date.parse(record.segments[0].ended_at));
    });

    it('freezes handoff labels in the first outbox draft and ignores later task changes on save', async () => {
      const { result, rerender } = renderHook(
        ({ subjectId }) => useStudySession({ isLoggedIn: true, onRecordSaved, selectedTaskTitle: '작업 A', selectedSubjectId: subjectId }),
        { initialProps: { subjectId: 'subject-a' } }
      );
      const end = Date.now();
      act(() => { result.current.setIntervals([{ start: end - 1200_000, end }]); });
      let record!: PendingStudyRecord;
      act(() => {
        record = result.current.createPendingRecord('pomo', 1200, end, { task: '작업 A', taskId: 'task-a' })!;
      });
      expect(readOutbox()[record.sessionId]).toMatchObject({
        task: '작업 A', taskId: 'task-a', subjectId: 'subject-a', labelsLocked: true,
      });
      expect(result.current.intervals).toEqual([]);
      expect(supabaseMock.rpc).not.toHaveBeenCalled();
      rerender({ subjectId: 'subject-b' });
      await act(async () => { await result.current.savePendingRecord(record, '작업 B', 'task-b', 'subject-b'); });
      expect(supabaseMock.rpc.mock.calls[0][1]).toMatchObject({
        p_task: '작업 A', p_task_id: 'task-a', p_subject_id: 'subject-a',
      });
    });

    it('leaves live intervals untouched when freezing a labeled restored snapshot', () => {
      const { result } = renderStudySession();
      const end = Date.now();
      act(() => { result.current.setIntervals([{ start: end, end: end + 60_000 }]); });
      act(() => {
        result.current.createPendingRecord('pomo', 1200, end, {
          intervals: [], currentStart: end - 1200_000, task: '작업 A', taskId: 'task-a', subjectId: 'subject-a',
        });
      });
      expect(result.current.intervals).toEqual([{ start: end, end: end + 60_000 }]);
      expect(Object.values(readOutbox())[0]).toMatchObject({ task: '작업 A', taskId: 'task-a', subjectId: 'subject-a' });
    });

    it('preserves a creation-labeled payload conflict for inspection instead of treating it as an unlabeled twin', async () => {
      const { result } = renderStudySession();
      supabaseMock.rpcResult.mockResolvedValueOnce(rpcConflictError());
      let record!: PendingStudyRecord;
      act(() => { record = result.current.createPendingRecord('pomo', 1200, Date.now(), { task: '작업 A', taskId: 'task-a' })!; });
      await act(async () => { expect(await result.current.savePendingRecord(record)).toBe('rejected'); });
      expect(readOutbox()[record.sessionId]).toMatchObject({ task: '작업 A', taskId: 'task-a', state: 'conflict', labelsLocked: true });
      expect(onRecordSaved).not.toHaveBeenCalled();
    });

    it('freezes the session\'s real segments and parks an unlabeled draft without calling the RPC', () => {
      const { result } = renderStudySession();

      const end = Date.now();
      act(() => {
        // One closed pause-separated interval plus a still-open one.
        result.current.setIntervals([{ start: end - 300_000, end: end - 240_000 }]);
      });
      result.current.currentIntervalStartRef.current = end - 60_000;

      const record = createRecord(result, 'pomo', 120, end);

      // The live state was consumed atomically at creation.
      expect(result.current.intervals).toEqual([]);
      expect(result.current.currentIntervalStartRef.current).toBeNull();

      const outbox = readOutbox();
      const drafts = Object.values(outbox);
      expect(drafts).toHaveLength(1);
      const draft = drafts[0];
      expect(draft.sessionId).toBe(record.sessionId);
      expect(draft.ownerId).toBe('user-1');
      expect(draft.mode).toBe('pomo');
      expect(draft.task).toBeNull();
      expect(draft.taskId).toBeNull();
      // Both intervals survive as separate segments (pauses stay pauses).
      expect(draft.segments).toHaveLength(2);
      expect(draft.segments.reduce((sum, s) => sum + s.duration, 0)).toBe(120);
      expect(draft.segments).toEqual(record.segments);
      // Creation is storage-only; nothing was sent yet.
      expect(supabaseMock.rpc).not.toHaveBeenCalled();
    });

    it('the answered save sends the record\'s frozen segments under its batch id, attaching only the label', async () => {
      const { result } = renderStudySession();

      const end = Date.now();
      act(() => {
        result.current.setIntervals([{ start: end - 300_000, end: end - 240_000 }]);
      });
      result.current.currentIntervalStartRef.current = end - 60_000;

      const record = createRecord(result, 'pomo', 120, end);

      // Whatever happens to the live state before the popup is answered (the
      // next session may already be running) cannot affect this record.
      act(() => {
        result.current.setIntervals([{ start: end + 1_000, end: end + 30_000 }]);
      });

      let saveResult: SaveRecordResult | undefined;
      await act(async () => {
        saveResult = await result.current.savePendingRecord(record, '독서', 't1');
      });

      expect(saveResult).toBe('saved');
      const params = supabaseMock.rpc.mock.calls[0][1] as RpcParams;
      expect(params.p_batch_id).toBe(record.sessionId);
      expect(params.p_task).toBe('독서');
      expect(params.p_task_id).toBe('t1');
      expect(params.p_segments).toEqual(record.segments);
      expect(readOutbox()).toEqual({});
      // The next session's live intervals were left untouched by the save.
      expect(result.current.intervals).toEqual([{ start: end + 1_000, end: end + 30_000 }]);
    });

    it('returns null without parking when no authenticated owner can be resolved', () => {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
      const { result } = renderHook(() =>
        useStudySession({
          isLoggedIn: false,
          onRecordSaved,
          selectedTaskTitle: '',
        })
      );

      let record: PendingStudyRecord | null = null;
      act(() => {
        record = result.current.createPendingRecord('pomo', 120, Date.now());
      });

      expect(record).toBeNull();
      expect(readOutbox()).toEqual({});
    });
  });
});
