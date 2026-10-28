import { useEffect, useState } from 'react';
import { endOfMonth, format, parse } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { getStudyMonthRange } from '@/lib/dateUtils';
import {
  countPlannedRemaining,
  countPomodorosByStudyDay,
  countPomodorosByTask,
  type PomodoroSessionRow,
  type PomodoroTaskRow,
} from '@/lib/pomodoroCounts';

export type DayPomodoros = { done: number; planned: number };

export type MonthPomodoros = {
  /** 'yyyy-MM-dd'별 끝낸 뽀모도로와 남은 계획 */
  days: Map<string, DayPomodoros>;
  done: number;
  planned: number;
};

type MonthTaskRow = PomodoroTaskRow & { due_date: string };

// 실시간 변경이 몰려 와도(정렬 저장 등) 한 번만 다시 읽는다.
const REFRESH_DELAY_MS = 300;

/**
 * 달력 한 달의 구슬 데이터. 뽀모도로 세기는 lib/pomodoroCounts 규칙을 따른다.
 * 소유자·달이 바뀌면 이전 응답을 버리고, 읽는 동안에는 null이다.
 */
export function useMonthPomodoros(userId: string, month: Date): MonthPomodoros | null {
  const monthKey = format(month, 'yyyy-MM');
  const scopeKey = `${userId}:${monthKey}`;
  const [result, setResult] = useState<{ key: string; data: MonthPomodoros } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    let request = 0;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const first = parse(`${monthKey}-01`, 'yyyy-MM-dd', new Date());
    const firstKey = format(first, 'yyyy-MM-dd');
    const lastKey = format(endOfMonth(first), 'yyyy-MM-dd');
    const range = getStudyMonthRange(first);
    // 1일 05:00에 걸친 배치는 앞 조각의 공부일(전달)에 속하므로 하루 앞부터 읽어 함께 묶는다.
    const queryStart = new Date(range.start);
    queryStart.setDate(queryStart.getDate() - 1);

    const load = async () => {
      if (!active) return;
      const current = ++request;
      const [sessionResult, taskResult] = await Promise.all([
        supabase
          .from('study_sessions')
          .select('id, created_at, mode, task_id, session_batch_id, group_id')
          .eq('user_id', userId)
          .gte('created_at', queryStart.toISOString())
          .lte('created_at', range.end.toISOString()),
        supabase
          .from('tasks')
          .select('id, due_date, status, estimated_pomodoros')
          .eq('user_id', userId)
          .gte('due_date', firstKey)
          .lte('due_date', lastKey),
      ]);
      if (!active || current !== request) return;
      if (sessionResult.error || taskResult.error) {
        console.error('Error fetching month pomodoros:', sessionResult.error ?? taskResult.error);
        return;
      }

      const sessions = (sessionResult.data ?? []) as PomodoroSessionRow[];
      const tasks = (taskResult.data ?? []) as MonthTaskRow[];
      const doneByDay = countPomodorosByStudyDay(sessions);
      const doneByTask = countPomodorosByTask(sessions);
      const tasksByDay = new Map<string, MonthTaskRow[]>();
      for (const task of tasks) {
        tasksByDay.set(task.due_date, [...(tasksByDay.get(task.due_date) ?? []), task]);
      }

      const days = new Map<string, DayPomodoros>();
      let done = 0;
      let planned = 0;
      for (const key of new Set([...doneByDay.keys(), ...tasksByDay.keys()])) {
        if (key < firstKey || key > lastKey) continue;
        const day = {
          done: doneByDay.get(key) ?? 0,
          planned: countPlannedRemaining(tasksByDay.get(key) ?? [], doneByTask),
        };
        if (!day.done && !day.planned) continue;
        days.set(key, day);
        done += day.done;
        planned += day.planned;
      }
      setResult({ key: scopeKey, data: { days, done, planned } });
    };

    const scheduleRefresh = () => {
      if (!active) return;
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void load();
      }, REFRESH_DELAY_MS);
    };

    const initialFetch = setTimeout(() => { void load(); }, 0);
    const channel = supabase
      .channel('plan-month-updates')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'study_sessions', filter: `user_id=eq.${userId}`,
      }, scheduleRefresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${userId}`,
      }, scheduleRefresh)
      .subscribe();

    return () => {
      active = false;
      clearTimeout(initialFetch);
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [monthKey, scopeKey, userId]);

  return userId && result?.key === scopeKey ? result.data : null;
}
