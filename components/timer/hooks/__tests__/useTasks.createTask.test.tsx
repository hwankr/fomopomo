import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ owner: 'user-a', getUser: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: mocks.getUser }, from: mocks.from } }));
vi.mock('@/lib/userScopedStorage', () => ({
  GUEST_OWNER: 'guest', getStorageOwner: () => mocks.owner,
  readOwnedJson: () => null, getScopedStorageKey: (key: string) => key,
}));
vi.mock('@/lib/longTermTasks', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/longTermTasks')>(),
  fetchLongTermTaskDurations: async () => new Map(),
}));

import { useTasks, type TaskKind } from '../useTasks';

type CreatedRow = { id: string; title: string; status: string; subject_id: string | null };
type InsertResponse = { data: CreatedRow | null; error: { message: string } | null };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('timer task creation', () => {
  let rows: Record<string, CreatedRow[]>;
  let writes: Array<{ table: string; input: Record<string, unknown> }>;
  let positionFilters: Array<[string, unknown]>;
  let insertResponse: Promise<InsertResponse> | null;
  let taskReadResponse: Promise<{ data: CreatedRow[]; error: null }> | null;
  let taskReadCount: number;
  let positionOrder: unknown;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 0, 1, 12));
    mocks.owner = 'user-a';
    mocks.getUser.mockReset().mockImplementation(async () => ({ data: { user: { id: mocks.owner } } }));
    rows = { tasks: [{ id: 'existing', title: '현재 작업', status: 'todo', subject_id: null }], weekly_plans: [], monthly_plans: [] };
    writes = [];
    positionFilters = [];
    insertResponse = null;
    taskReadResponse = null;
    taskReadCount = 0;
    positionOrder = null;
    mocks.from.mockReset().mockImplementation((table: string) => {
      let columns = '';
      const query = {
        select: vi.fn((value: string) => { columns = value; return query; }),
        eq: vi.fn((field: string, value: unknown) => { if (columns === 'position') positionFilters.push([field, value]); return query; }),
        gte: vi.fn(() => query), lte: vi.fn(() => query), is: vi.fn(() => query),
        in: vi.fn(() => query), order: vi.fn((field: string, options: unknown) => {
          if (columns === 'position') positionOrder = { field, options };
          return query;
        }), limit: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: { position: 8 }, error: null })),
        then: (resolve: (value: { data: CreatedRow[]; error: null }) => void) => {
          if (table === 'tasks') {
            taskReadCount += 1;
            const pendingRead = taskReadResponse;
            taskReadResponse = null;
            if (pendingRead) { void pendingRead.then(resolve); return; }
          }
          resolve({ data: rows[table] ?? [], error: null });
        },
        insert: vi.fn((input: Record<string, unknown>) => {
          writes.push({ table, input });
          return { select: () => ({ single: async () => {
            if (insertResponse) return insertResponse;
            const data = { id: `created-${table}`, title: String(input.title), status: 'todo', subject_id: input.subject_id as string | null };
            rows[table].push(data);
            return { data, error: null };
          } }) };
        }),
      };
      return query;
    });
  });

  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it.each([
    ['daily', 'tasks', 'dbTasks', { due_date: '2026-01-01', position: 9 }],
    ['weekly', 'weekly_plans', 'weeklyPlans', { start_date: '2025-12-29', end_date: '2026-01-04' }],
    ['monthly', 'monthly_plans', 'monthlyPlans', { month: 1, year: 2026 }],
  ] as const)('creates %s plans in the current local period without changing selection', async (kind, table, list, period) => {
    const { result } = renderHook(() => useTasks(true));
    await waitFor(() => expect(result.current.dbTasks).toHaveLength(1));
    act(() => { result.current.setSelectedTaskId('existing'); result.current.setSelectedTask('현재 작업'); });

    await act(async () => {
      const created = await result.current.createTask({ title: '  수학 복습  ', kind, subjectId: 'math' });
      expect(created).toMatchObject({ title: '수학 복습', kind, subjectId: 'math', durationSeconds: 0, status: 'todo' });
    });

    expect(writes).toEqual([{ table, input: { user_id: 'user-a', title: '수학 복습', subject_id: 'math', status: 'todo', ...period } }]);
    expect(result.current[list]).toContainEqual(expect.objectContaining({ id: `created-${table}`, kind }));
    expect(result.current.selectedTaskId).toBe('existing');
    expect(result.current.selectedTask).toBe('현재 작업');
    if (kind === 'daily') {
      expect(positionFilters).toEqual([['user_id', 'user-a'], ['due_date', '2026-01-01']]);
      expect(positionOrder).toEqual({ field: 'position', options: { ascending: false, nullsFirst: false } });
    }
  });

  it('rejects blank titles, signed-out writes and mismatched authenticated owners', async () => {
    const { result, rerender } = renderHook(({ loggedIn }) => useTasks(loggedIn), { initialProps: { loggedIn: false } });
    const input = { title: '작업', kind: 'weekly' as TaskKind, subjectId: null };
    await act(async () => { expect(await result.current.createTask(input)).toBeNull(); });
    rerender({ loggedIn: true });
    await act(async () => { expect(await result.current.createTask({ ...input, title: '   ' })).toBeNull(); });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-b' } } });
    await act(async () => { expect(await result.current.createTask(input)).toBeNull(); });
    expect(writes).toEqual([]);
  });

  it('refreshes an unfinished initial list after unclassified creation and ignores the stale response', async () => {
    const pendingRead = deferred<{ data: CreatedRow[]; error: null }>();
    taskReadResponse = pendingRead.promise;
    const { result } = renderHook(() => useTasks(true));
    await waitFor(() => expect(taskReadCount).toBe(1));
    await act(async () => {
      expect(await result.current.createTask({ title: '새 작업', kind: 'daily', subjectId: null })).not.toBeNull();
    });
    await waitFor(() => expect(result.current.dbTasks).toHaveLength(2));
    expect(result.current.dbTasks.map(task => task.id)).toEqual(['existing', 'created-tasks']);
    await act(async () => { pendingRead.resolve({ data: [], error: null }); });
    expect(result.current.dbTasks.map(task => task.id)).toEqual(['existing', 'created-tasks']);
  });

  it('blocks duplicate submissions, preserves the list on failure and allows retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useTasks(true));
    await waitFor(() => expect(result.current.dbTasks).toHaveLength(1));
    const pending = deferred<InsertResponse>();
    insertResponse = pending.promise;
    const input = { title: '작업', kind: 'weekly' as TaskKind, subjectId: null };
    let first!: Promise<unknown>;
    await act(async () => {
      first = result.current.createTask(input);
      expect(await result.current.createTask(input)).toBeNull();
    });
    expect(writes).toHaveLength(1);
    await act(async () => { pending.resolve({ data: null, error: { message: 'offline' } }); await first; });
    expect(result.current.weeklyPlans).toEqual([]);
    insertResponse = null;
    await act(async () => { expect(await result.current.createTask(input)).not.toBeNull(); });
    expect(result.current.weeklyPlans).toHaveLength(1);
  });

  it('discards a late insert after an owner changes away and back', async () => {
    const { result, rerender } = renderHook(() => useTasks(true));
    await waitFor(() => expect(result.current.dbTasks).toHaveLength(1));
    const pending = deferred<InsertResponse>();
    insertResponse = pending.promise;
    let first!: Promise<unknown>;
    await act(async () => { first = result.current.createTask({ title: 'old owner draft', kind: 'weekly', subjectId: null }); });
    mocks.owner = 'user-b'; rerender();
    mocks.owner = 'user-a'; rerender();
    await act(async () => {
      pending.resolve({ data: { id: 'late', title: 'old owner draft', status: 'todo', subject_id: null }, error: null });
      expect(await first).toBeNull();
    });
    expect(result.current.weeklyPlans).toEqual([]);
  });
});
