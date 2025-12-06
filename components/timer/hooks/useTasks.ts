import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';

export type TaskItem = {
  id: string;
  title: string;
};

export const useTasks = (isLoggedIn: boolean) => {
  const [dbTasks, setDbTasks] = useState<TaskItem[]>([]);
  const [weeklyPlans, setWeeklyPlans] = useState<TaskItem[]>([]);
  const [monthlyPlans, setMonthlyPlans] = useState<TaskItem[]>([]);
  const [selectedTask, setSelectedTask] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const fetchDbTasks = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = format(new Date(), 'yyyy-MM-dd');

      // Daily tasks
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('id, title')
        .eq('user_id', user.id)
        .eq('due_date', today)
        .neq('status', 'done');

      if (tasksData) setDbTasks(tasksData);

      // Weekly plans
      const { data: weeklyData } = await supabase
        .from('weekly_plans')
        .select('id, title')
        .eq('user_id', user.id)
        .neq('status', 'done');

      if (weeklyData) setWeeklyPlans(weeklyData);

      // Monthly plans
      const { data: monthlyData } = await supabase
        .from('monthly_plans')
        .select('id, title')
        .eq('user_id', user.id)
        .neq('status', 'done');

      if (monthlyData) setMonthlyPlans(monthlyData);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  }, [isLoggedIn]);

  // Initial fetch and focus/mount listeners
  useEffect(() => {
    fetchDbTasks();

    const onFocus = () => fetchDbTasks();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchDbTasks]);

  // Restore validation: Ensure selected task still exists or keep it anyway?
  // Original logic didn't strictly validate existence on restore, simplified here.

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
  };
};
