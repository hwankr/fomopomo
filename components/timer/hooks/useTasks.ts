import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import {
  GUEST_OWNER,
  getScopedStorageKey,
  getStorageOwner,
  readOwnedJson,
} from '@/lib/userScopedStorage';

export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskKind = 'daily' | 'weekly' | 'monthly';

export type TaskItem = {
  id: string;
  title: string;
  status: TaskStatus;
  durationSeconds: number;
  kind: TaskKind;
};

type TaskRow = {
  id: string;
  title: string;
  status: TaskStatus;
};

type SessionDurationRow = {
  task_id: string | null;
  duration: number | null;
};

const TABLE_BY_KIND: Record<TaskKind, string> = {
  daily: 'tasks',
  weekly: 'weekly_plans',
  monthly: 'monthly_plans',
};

const TASK_STATE_KEY = 'fomopomo_task_state';

type SavedTaskState = {
  taskId?: string | null;
  taskTitle?: string;
};

export const useTasks = (isLoggedIn: boolean) => {
  const [dbTasks, setDbTasks] = useState<TaskItem[]>([]);
  const [weeklyPlans, setWeeklyPlans] = useState<TaskItem[]>([]);
  const [monthlyPlans, setMonthlyPlans] = useState<TaskItem[]>([]);
  const [selectedTask, setSelectedTask] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isTasksLoaded, setIsTasksLoaded] = useState(false);

  // Auth changed (login/logout/account switch): drop the previous account's
  // task lists and selection synchronously so they can neither render for nor
  // be persisted into the next account's namespace.
  const [prevLoggedIn, setPrevLoggedIn] = useState(isLoggedIn);
  if (prevLoggedIn !== isLoggedIn) {
    setPrevLoggedIn(isLoggedIn);
    setDbTasks([]);
    setWeeklyPlans([]);
    setMonthlyPlans([]);
    setSelectedTask('');
    setSelectedTaskId(null);
    setIsTasksLoaded(false);
  }

  const applyRestoredTaskState = useCallback(
    (taskId: string | null, taskTitle: string) => {
      setSelectedTaskId(taskId);
      setSelectedTask(taskTitle);
    },
    []
  );

  const fetchDbTasks = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const now = new Date();
      const today = format(now, 'yyyy-MM-dd');
      const currentMonth = now.getMonth() + 1; // 1-12
      const currentYear = now.getFullYear();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday start
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

      // Daily tasks (완료 항목도 표시하므로 status 필터 없음)
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('id, title, status')
        .eq('user_id', user.id)
        .eq('due_date', today);

      // Weekly plans - filter by current week
      const { data: weeklyData } = await supabase
        .from('weekly_plans')
        .select('id, title, status')
        .eq('user_id', user.id)
        .gte('start_date', format(weekStart, 'yyyy-MM-dd'))
        .lte('end_date', format(weekEnd, 'yyyy-MM-dd'));

      // Monthly plans - filter by current month and year
      const { data: monthlyData } = await supabase
        .from('monthly_plans')
        .select('id, title, status')
        .eq('user_id', user.id)
        .eq('month', currentMonth)
        .eq('year', currentYear);

      const taskRows = (tasksData ?? []) as TaskRow[];
      const weeklyRows = (weeklyData ?? []) as TaskRow[];
      const monthlyRows = (monthlyData ?? []) as TaskRow[];

      // 작업별 누적 공부 시간. RLS로 보이는 타인 세션(그룹/친구 조회 허용분)이
      // 합산되지 않도록 본인 세션으로 한정한다. 실패해도 목록은 0으로 표시한다.
      const allIds = [...taskRows, ...weeklyRows, ...monthlyRows].map(
        (row) => row.id
      );
      const durationByTaskId = new Map<string, number>();
      if (allIds.length > 0) {
        const { data: sessions, error: sessionsError } = await supabase
          .from('study_sessions')
          .select('task_id, duration')
          .eq('user_id', user.id)
          .in('task_id', allIds);

        if (sessionsError) {
          console.error('Error fetching task durations:', sessionsError);
        } else {
          for (const row of (sessions ?? []) as SessionDurationRow[]) {
            if (!row.task_id) continue;
            durationByTaskId.set(
              row.task_id,
              (durationByTaskId.get(row.task_id) ?? 0) + (row.duration ?? 0)
            );
          }
        }
      }

      const toItem = (kind: TaskKind) => (row: TaskRow): TaskItem => ({
        id: row.id,
        title: row.title,
        status: row.status,
        durationSeconds: durationByTaskId.get(row.id) ?? 0,
        kind,
      });

      setDbTasks(taskRows.map(toItem('daily')));
      setWeeklyPlans(weeklyRows.map(toItem('weekly')));
      setMonthlyPlans(monthlyRows.map(toItem('monthly')));

      setIsTasksLoaded(true);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  }, [isLoggedIn]);

  // Restore task state from localStorage after tasks are loaded
  // to validate that the saved task still exists in current period
  useEffect(() => {
    if (!isTasksLoaded) return;

    try {
      // Tasks only load while authenticated, so hydrate strictly from the
      // current owner's namespaced key (never another account's or a guest's).
      const owner = getStorageOwner();
      if (owner === GUEST_OWNER) return;

      const savedTaskState = readOwnedJson<SavedTaskState>(
        TASK_STATE_KEY,
        owner
      );
      if (savedTaskState) {
        const { taskId, taskTitle } = savedTaskState;
        if (taskId) {
          // Validate that the saved task exists in current data
          const taskExists =
            dbTasks.some(t => t.id === taskId) ||
            weeklyPlans.some(t => t.id === taskId) ||
            monthlyPlans.some(t => t.id === taskId);

          if (taskExists) {
            queueMicrotask(() => {
              applyRestoredTaskState(taskId, taskTitle || '');
            });
          } else {
            // Clear invalid task from localStorage
            localStorage.removeItem(getScopedStorageKey(TASK_STATE_KEY, owner));
            queueMicrotask(() => {
              applyRestoredTaskState(null, '');
            });
          }
        }
      }
    } catch (error) {
      console.error('Error restoring task state:', error);
    }
  }, [applyRestoredTaskState, isTasksLoaded, dbTasks, weeklyPlans, monthlyPlans]);

  // Initial fetch and focus/mount listeners
  useEffect(() => {
    const initialFetch = setTimeout(() => {
      void fetchDbTasks();
    }, 0);

    const onFocus = () => {
      void fetchDbTasks();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      clearTimeout(initialFetch);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchDbTasks]);

  // Restore validation: Ensure selected task still exists or keep it anyway?
  // Original logic didn't strictly validate existence on restore, simplified here.

  const toggleTaskStatus = useCallback(
    async (item: TaskItem) => {
      const nextStatus: TaskStatus = item.status === 'done' ? 'todo' : 'done';
      const applyStatus = (list: TaskItem[]) =>
        list.map((task) =>
          task.id === item.id ? { ...task, status: nextStatus } : task
        );
      if (item.kind === 'daily') setDbTasks(applyStatus);
      else if (item.kind === 'weekly') setWeeklyPlans(applyStatus);
      else setMonthlyPlans(applyStatus);

      const { error } = await supabase
        .from(TABLE_BY_KIND[item.kind])
        .update({ status: nextStatus })
        .eq('id', item.id);

      if (error) {
        console.error('Error updating task status:', error);
        void fetchDbTasks();
      }
    },
    [fetchDbTasks]
  );

  const getSelectedTaskTitle = useCallback(() => {
    const task =
      dbTasks.find((t) => t.id === selectedTaskId) ||
      weeklyPlans.find((t) => t.id === selectedTaskId) ||
      monthlyPlans.find((t) => t.id === selectedTaskId);
    return task?.title || '';
  }, [dbTasks, weeklyPlans, monthlyPlans, selectedTaskId]);

  return {
    dbTasks,
    weeklyPlans,
    monthlyPlans,
    selectedTask,
    selectedTaskId,
    setSelectedTask,
    setSelectedTaskId,
    getSelectedTaskTitle,
    fetchDbTasks,
    toggleTaskStatus,
  };
};
