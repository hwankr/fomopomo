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

type OutboxRow = {
  duration: number;
  user_id: string;
  group_id: string;
};

type Outbox = Record<string, { sessionId: string; rows: OutboxRow[]; failedAt: number }>;

const readOutbox = (): Outbox =>
  JSON.parse(window.localStorage.getItem(PENDING_SESSIONS_KEY) ?? '{}');

describe('useStudySession saveRecord', () => {
  const insertMock = vi.fn();
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
    // Fix the clock at noon so intervals never straddle midnight in tests.
    vi.useFakeTimers({ now: new Date('2026-08-07T12:00:00') });
    window.localStorage.clear();
    vi.clearAllMocks();

    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'study_sessions') {
        return { insert: insertMock };
      }
      // profiles: mount-time status update + privacy lookup
      return {
        update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: null }) })),
        })),
      };
    });
    insertMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps intervals and stores a durable outbox draft when the insert fails', async () => {
    insertMock.mockResolvedValue({ error: { message: 'network down' } });
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

    // The study time survives as a durable draft keyed by the session id.
    const outbox = readOutbox();
    const drafts = Object.values(outbox);
    expect(drafts).toHaveLength(1);
    const draft = drafts[0];
    expect(Object.keys(outbox)[0]).toBe(draft.sessionId);
    expect(draft.rows.reduce((sum, row) => sum + row.duration, 0)).toBe(60);
    expect(draft.rows[0].user_id).toBe('user-1');
    expect(draft.rows[0].group_id).toBe(draft.sessionId);
  });

  it('clears intervals and the outbox only after a confirmed successful insert', async () => {
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

  it('reuses the same session id on retry and clears the draft once saved', async () => {
    insertMock.mockResolvedValueOnce({ error: { message: 'network down' } });
    const { result } = renderStudySession();

    const end = Date.now();
    act(() => {
      result.current.setIntervals([{ start: end - 60_000, end }]);
    });

    await act(async () => {
      await result.current.saveRecord('stopwatch', 60, '', end);
    });

    const firstAttemptRows = insertMock.mock.calls[0][0] as OutboxRow[];
    const draftIds = Object.keys(readOutbox());
    expect(draftIds).toHaveLength(1);

    let retryResult: SaveRecordResult | undefined;
    await act(async () => {
      retryResult = await result.current.saveRecord('stopwatch', 60, '', end);
    });

    expect(retryResult).toBe('saved');
    const secondAttemptRows = insertMock.mock.calls[1][0] as OutboxRow[];
    // The stable session id keeps group_id identical across retries, so a
    // retry can never create a second copy under a new group.
    expect(secondAttemptRows[0].group_id).toBe(firstAttemptRows[0].group_id);
    expect(secondAttemptRows[0].group_id).toBe(draftIds[0]);
    expect(readOutbox()).toEqual({});
    expect(result.current.intervals).toEqual([]);
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
    expect(insertMock).not.toHaveBeenCalled();
    expect(result.current.intervals).toEqual([{ start: end - 5_000, end }]);
  });

  describe('outbox recovery on mount', () => {
    const selectLimitMock = vi.fn();

    const mockStudySessionsWithSelect = () => {
      supabaseMock.from.mockImplementation((table: string) => {
        if (table === 'study_sessions') {
          return {
            insert: insertMock,
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ limit: selectLimitMock })),
            })),
          };
        }
        return {
          update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: null }) })),
          })),
        };
      });
    };

    const seedDraft = (sessionId: string, userId: string, duration = 120) => {
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
                task: null,
                task_id: null,
                created_at: new Date().toISOString(),
                group_id: sessionId,
              },
            ],
            failedAt: Date.now() - 60_000,
          },
        })
      );
    };

    it('re-inserts an orphaned draft for the current user and clears it', async () => {
      mockStudySessionsWithSelect();
      selectLimitMock.mockResolvedValue({ data: [], error: null });
      seedDraft('draft-recover-1', 'user-1');

      renderStudySession();
      await act(async () => {});

      expect(insertMock).toHaveBeenCalledTimes(1);
      const insertedRows = insertMock.mock.calls[0][0] as OutboxRow[];
      expect(insertedRows[0].group_id).toBe('draft-recover-1');
      expect(readOutbox()).toEqual({});
      expect(onRecordSaved).toHaveBeenCalledTimes(1);
      expect(toastMock.success).toHaveBeenCalledWith('보관 중이던 2분 기록을 저장했습니다!');
    });

    it('drops a draft without re-inserting when its rows already exist on the server', async () => {
      mockStudySessionsWithSelect();
      selectLimitMock.mockResolvedValue({ data: [{ id: 1 }], error: null });
      seedDraft('draft-already-saved', 'user-1');

      renderStudySession();
      await act(async () => {});

      expect(insertMock).not.toHaveBeenCalled();
      expect(readOutbox()).toEqual({});
      expect(onRecordSaved).not.toHaveBeenCalled();
    });

    it('leaves another account\'s draft untouched', async () => {
      mockStudySessionsWithSelect();
      selectLimitMock.mockResolvedValue({ data: [], error: null });
      seedDraft('draft-foreign', 'user-2');

      renderStudySession();
      await act(async () => {});

      expect(insertMock).not.toHaveBeenCalled();
      expect(Object.keys(readOutbox())).toEqual(['draft-foreign']);
    });
  });
});
