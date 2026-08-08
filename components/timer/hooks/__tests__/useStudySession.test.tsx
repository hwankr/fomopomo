import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
      },
      from: vi.fn(),
      rpc: vi.fn(),
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

import { useStudySession, type SaveRecordResult } from '../useStudySession';

const PENDING_SESSIONS_KEY = 'fomopomo_pending_sessions';

type OutboxSegment = { index: number; duration: number; ended_at: string };

type OutboxDraftV2 = {
  version: 2;
  sessionId: string;
  ownerId: string;
  mode: string;
  task: string | null;
  taskId: string | null;
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

describe('useStudySession saveRecord', () => {
  const onRecordSaved = vi.fn();

  const renderStudySession = () =>
    renderHook(() =>
      useStudySession({
        isLoggedIn: true,
        onRecordSaved,
        selectedTaskId: null,
        selectedTaskTitle: '',
      })
    );

  beforeEach(() => {
    // Fix the clock at noon so intervals never straddle the 05:00 boundary.
    vi.useFakeTimers({ now: new Date('2026-08-07T12:00:00') });
    window.localStorage.clear();
    vi.clearAllMocks();

    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    supabaseMock.from.mockImplementation(() => ({
      // profiles: mount-time status update + privacy lookup
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: null }) })),
      })),
    }));
    supabaseMock.rpc.mockResolvedValue(rpcOk('saved', 60));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps intervals and stores a durable v2 outbox draft when the RPC fails', async () => {
    supabaseMock.rpc.mockResolvedValue(rpcNetworkError());
    const { result } = renderStudySession();

    const end = Date.now();
    const start = end - 60_000;
    act(() => {
      result.current.setIntervals([{ start, end }]);
    });

    let saveResult: SaveRecordResult | undefined;
    await act(async () => {
      saveResult = await result.current.saveRecord('stopwatch', 60, '', end);
    });

    expect(saveResult).toBe('failed');
    // A failed save must not clear the in-memory session state.
    expect(result.current.intervals).toEqual([{ start, end }]);
    expect(onRecordSaved).not.toHaveBeenCalled();

    // The study time survives as a durable draft keyed by the batch id.
    const outbox = readOutbox();
    const drafts = Object.values(outbox);
    expect(drafts).toHaveLength(1);
    const draft = drafts[0];
    expect(Object.keys(outbox)[0]).toBe(draft.sessionId);
    expect(draft.version).toBe(2);
    expect(draft.ownerId).toBe('user-1');
    expect(draft.segments.reduce((sum, s) => sum + s.duration, 0)).toBe(60);

    // The RPC received the same batch id and payload the draft preserves,
    // and never received a client-supplied user id.
    const params = supabaseMock.rpc.mock.calls[0][1] as RpcParams;
    expect(supabaseMock.rpc.mock.calls[0][0]).toBe('record_study_session_batch');
    expect(params.p_batch_id).toBe(draft.sessionId);
    expect(params.p_segments).toEqual(draft.segments);
    expect(params).not.toHaveProperty('p_user_id');
  });

  it('clears intervals and the outbox only after a confirmed successful save', async () => {
    const { result } = renderStudySession();

    const end = Date.now();
    act(() => {
      result.current.setIntervals([{ start: end - 60_000, end }]);
    });

    let saveResult: SaveRecordResult | undefined;
    await act(async () => {
      saveResult = await result.current.saveRecord('stopwatch', 60, '', end);
    });

    expect(saveResult).toBe('saved');
    expect(result.current.intervals).toEqual([]);
    expect(result.current.currentIntervalStartRef.current).toBeNull();
    expect(onRecordSaved).toHaveBeenCalledTimes(1);
    expect(readOutbox()).toEqual({});
  });

  it('retries with the same batch id and canonical payload, and treats already_processed as saved', async () => {
    // First attempt: the server committed the batch but the response was lost.
    supabaseMock.rpc
      .mockResolvedValueOnce(rpcNetworkError())
      .mockResolvedValueOnce(rpcOk('already_processed', 60));
    const { result } = renderStudySession();

    const end = Date.now();
    act(() => {
      result.current.setIntervals([{ start: end - 60_000, end }]);
    });

    await act(async () => {
      await result.current.saveRecord('stopwatch', 60, '', end);
    });
    const draftIds = Object.keys(readOutbox());
    expect(draftIds).toHaveLength(1);

    let retryResult: SaveRecordResult | undefined;
    await act(async () => {
      retryResult = await result.current.saveRecord('stopwatch', 60, '', end);
    });

    // already_processed is durable success: no duplicate row exists and the
    // outbox draft is released.
    expect(retryResult).toBe('saved');
    expect(onRecordSaved).toHaveBeenCalledTimes(1);
    expect(readOutbox()).toEqual({});
    expect(result.current.intervals).toEqual([]);

    const firstParams = supabaseMock.rpc.mock.calls[0][1] as RpcParams;
    const retryParams = supabaseMock.rpc.mock.calls[1][1] as RpcParams;
    // The idempotency key AND the canonical payload are byte-identical, so
    // the server can prove the retry duplicates the committed batch.
    expect(retryParams.p_batch_id).toBe(firstParams.p_batch_id);
    expect(retryParams.p_batch_id).toBe(draftIds[0]);
    expect(retryParams).toEqual(firstParams);
  });

  it('parks the draft in an explicit conflict state when the server reports a payload conflict', async () => {
    supabaseMock.rpc.mockResolvedValueOnce(rpcConflictError());
    const { result } = renderStudySession();

    const end = Date.now();
    act(() => {
      result.current.setIntervals([{ start: end - 60_000, end }]);
    });

    let saveResult: SaveRecordResult | undefined;
    await act(async () => {
      saveResult = await result.current.saveRecord('stopwatch', 60, '', end);
    });

    expect(saveResult).toBe('rejected');
    // The draft is preserved in an explicit recovery state instead of being
    // retried forever or silently dropped.
    const drafts = Object.values(readOutbox());
    expect(drafts).toHaveLength(1);
    expect(drafts[0].state).toBe('conflict');
    expect(toastMock.error).toHaveBeenCalled();
    expect(onRecordSaved).not.toHaveBeenCalled();

    // The next save starts a fresh batch id so it cannot re-collide, and the
    // conflicted draft stays parked.
    supabaseMock.rpc.mockResolvedValueOnce(rpcOk('saved', 60));
    await act(async () => {
      await result.current.saveRecord('stopwatch', 60, '', Date.now());
    });
    const firstBatchId = (supabaseMock.rpc.mock.calls[0][1] as RpcParams).p_batch_id;
    const secondBatchId = (supabaseMock.rpc.mock.calls[1][1] as RpcParams).p_batch_id;
    expect(secondBatchId).not.toBe(firstBatchId);
    expect(Object.values(readOutbox()).map((d) => d.state)).toEqual(['conflict']);
  });

  it('parks the draft as invalid on a permanent validation error', async () => {
    supabaseMock.rpc.mockResolvedValueOnce(rpcValidationError());
    const { result } = renderStudySession();

    const end = Date.now();
    act(() => {
      result.current.setIntervals([{ start: end - 60_000, end }]);
    });

    let saveResult: SaveRecordResult | undefined;
    await act(async () => {
      saveResult = await result.current.saveRecord('stopwatch', 60, '', end);
    });

    expect(saveResult).toBe('rejected');
    const drafts = Object.values(readOutbox());
    expect(drafts).toHaveLength(1);
    expect(drafts[0].state).toBe('invalid');
  });

  it('returns skipped and leaves state untouched for sub-10-second durations', async () => {
    const { result } = renderStudySession();

    const end = Date.now();
    act(() => {
      result.current.setIntervals([{ start: end - 5_000, end }]);
    });

    let saveResult: SaveRecordResult | undefined;
    await act(async () => {
      saveResult = await result.current.saveRecord('stopwatch', 5, '', end);
    });

    expect(saveResult).toBe('skipped');
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
    expect(result.current.intervals).toEqual([{ start: end - 5_000, end }]);
  });

  describe('outbox recovery on mount', () => {
    const seedDraftV2 = (
      sessionId: string,
      ownerId: string,
      duration = 120,
      state?: 'conflict' | 'invalid'
    ) => {
      const draft: OutboxDraftV2 = {
        version: 2,
        sessionId,
        ownerId,
        mode: 'stopwatch',
        task: null,
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
      supabaseMock.rpc.mockResolvedValue(rpcOk('saved', 120));
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
      supabaseMock.rpc.mockResolvedValue(rpcOk('already_processed', 120));
      seedDraftV2('draft-already-saved', 'user-1');

      renderStudySession();
      await act(async () => {});

      expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
      expect(readOutbox()).toEqual({});
      expect(onRecordSaved).not.toHaveBeenCalled();
      expect(toastMock.success).not.toHaveBeenCalled();
    });

    it('converts a legacy v1 draft into the v2 RPC payload without sending user_id', async () => {
      supabaseMock.rpc.mockResolvedValue(rpcOk('saved', 120));
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
      supabaseMock.rpc.mockResolvedValue(rpcOk('saved', 120));
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
      supabaseMock.rpc.mockResolvedValue(rpcNetworkError());
      seedDraftV2('draft-retry-later', 'user-1');

      renderStudySession();
      await act(async () => {});

      expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
      const outbox = readOutbox();
      expect(Object.keys(outbox)).toEqual(['draft-retry-later']);
      expect(outbox['draft-retry-later'].state).toBeUndefined();
    });

    it('flags a conflicted draft during recovery and never auto-resends it', async () => {
      supabaseMock.rpc.mockResolvedValue(rpcConflictError());
      seedDraftV2('draft-conflict', 'user-1');

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

    it('sends a shared draft exactly once when two hook instances recover concurrently', async () => {
      // StrictMode double-mount / two components: the in-flight guard plus the
      // server idempotency contract mean the draft is recorded exactly once.
      supabaseMock.rpc.mockResolvedValue(rpcOk('saved', 120));
      seedDraftV2('draft-strict-mode', 'user-1');

      renderStudySession();
      renderStudySession();
      await act(async () => {});

      expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
      const params = supabaseMock.rpc.mock.calls[0][1] as RpcParams;
      expect(params.p_batch_id).toBe('draft-strict-mode');
      expect(readOutbox()).toEqual({});
    });
  });
});
