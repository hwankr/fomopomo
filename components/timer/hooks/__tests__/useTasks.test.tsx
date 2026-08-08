import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

import { useTasks, type TaskItem } from '../useTasks';

type Row = { id: string; title: string; status: string };
type SessionRow = { task_id: string | null; duration: number | null };

let taskRows: Row[];
let weeklyRows: Row[];
let monthlyRows: Row[];
let sessionRows: SessionRow[];
let updateError: { message: string } | null;
let updateCalls: Array<{ table: string; patch: Record<string, unknown>; id: string }>;

function updateMockFor(table: string) {
  return vi.fn((patch: Record<string, unknown>) => ({
    eq: vi.fn(async (_field: string, id: string) => {
      updateCalls.push({ table, patch, id });
      return { error: updateError };
    }),
  }));
}

describe('useTasks', () => {
  beforeEach(() => {
    window.localStorage.clear();

    taskRows = [
      { id: 't1', title: '남은 작업', status: 'todo' },
      { id: 't2', title: '끝난 작업', status: 'done' },
    ];
    weeklyRows = [{ id: 'w1', title: '주간 작업', status: 'todo' }];
    monthlyRows = [{ id: 'm1', title: '월간 작업', status: 'todo' }];
    sessionRows = [
      { task_id: 't1', duration: 600 },
      { task_id: 't1', duration: 300 },
      { task_id: 'w1', duration: 1200 },
    ];
    updateError = null;
    updateCalls = [];

    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'tasks') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: taskRows, error: null })),
            })),
          })),
          update: updateMockFor('tasks'),
        };
      }

      if (table === 'weekly_plans') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => ({
                lte: vi.fn(async () => ({ data: weeklyRows, error: null })),
              })),
            })),
          })),
          update: updateMockFor('weekly_plans'),
        };
      }

      if (table === 'monthly_plans') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ data: monthlyRows, error: null })),
              })),
            })),
          })),
          update: updateMockFor('monthly_plans'),
        };
      }

      if (table === 'study_sessions') {
        return {
          select: vi.fn(() => ({
            // duration 합산은 본인 세션으로 한정된다: .eq('user_id', …).in('task_id', …)
            eq: vi.fn(() => ({
              in: vi.fn(async (_inField: string, ids: string[]) => ({
                data: sessionRows.filter(
                  (row) => row.task_id !== null && ids.includes(row.task_id)
                ),
                error: null,
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads all three lists with summed durations, including done items', async () => {
    const { result } = renderHook(() => useTasks(true));

    await waitFor(() => {
      expect(result.current.dbTasks).toHaveLength(2);
    });

    const [todoTask, doneTask] = result.current.dbTasks;
    expect(todoTask).toMatchObject({
      id: 't1',
      status: 'todo',
      durationSeconds: 900,
      kind: 'daily',
    });
    expect(doneTask).toMatchObject({ id: 't2', status: 'done' });

    expect(result.current.weeklyPlans[0]).toMatchObject({
      id: 'w1',
      durationSeconds: 1200,
      kind: 'weekly',
    });
    expect(result.current.monthlyPlans[0]).toMatchObject({
      id: 'm1',
      durationSeconds: 0,
      kind: 'monthly',
    });
  });

  it('toggles status optimistically against the table matching the kind', async () => {
    const { result } = renderHook(() => useTasks(true));

    await waitFor(() => {
      expect(result.current.weeklyPlans).toHaveLength(1);
    });

    const weekly: TaskItem = result.current.weeklyPlans[0];
    await act(async () => {
      await result.current.toggleTaskStatus(weekly);
    });

    expect(result.current.weeklyPlans[0].status).toBe('done');
    expect(updateCalls).toEqual([
      { table: 'weekly_plans', patch: { status: 'done' }, id: 'w1' },
    ]);
  });

  it('rolls back by refetching when the status update fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    updateError = { message: 'boom' };

    const { result } = renderHook(() => useTasks(true));

    await waitFor(() => {
      expect(result.current.dbTasks).toHaveLength(2);
    });

    await act(async () => {
      await result.current.toggleTaskStatus(result.current.dbTasks[0]);
    });

    // 낙관적 업데이트가 refetch로 되돌아간다(mock 데이터는 여전히 todo).
    await waitFor(() => {
      expect(
        result.current.dbTasks.find((task) => task.id === 't1')?.status
      ).toBe('todo');
    });
  });
});
