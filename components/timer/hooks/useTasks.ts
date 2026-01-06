import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { format, startOfWeek, endOfWeek } from 'date-fns';

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
  const [isTasksLoaded, setIsTasksLoaded] = useState(false);

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

      // Daily tasks
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('id, title')
        .eq('user_id', user.id)
        .eq('due_date', today)
        .neq('status', 'done');

      if (tasksData) setDbTasks(tasksData);

      // Weekly plans - filter by current week
      const { data: weeklyData } = await supabase
        .from('weekly_plans')
        .select('id, title')
        .eq('user_id', user.id)
        .gte('start_date', format(weekStart, 'yyyy-MM-dd'))
        .lte('end_date', format(weekEnd, 'yyyy-MM-dd'))
        .neq('status', 'done');

      if (weeklyData) setWeeklyPlans(weeklyData);

      // Monthly plans - filter by current month and year
      const { data: monthlyData } = await supabase
        .from('monthly_plans')
        .select('id, title')
        .eq('user_id', user.id)
        .eq('month', currentMonth)
        .eq('year', currentYear)
        .neq('status', 'done');

      if (monthlyData) setMonthlyPlans(monthlyData);

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
      const savedTaskState = localStorage.getItem('fomopomo_task_state');
      if (savedTaskState) {
        const { taskId, taskTitle } = JSON.parse(savedTaskState);
        if (taskId) {
          // Validate that the saved task exists in current data
          const taskExists =
            dbTasks.some(t => t.id === taskId) ||
            weeklyPlans.some(t => t.id === taskId) ||
            monthlyPlans.some(t => t.id === taskId);

          if (taskExists) {
            setSelectedTaskId(taskId);
            setSelectedTask(taskTitle || '');
          } else {
            // Clear invalid task from localStorage
            localStorage.removeItem('fomopomo_task_state');
            setSelectedTaskId(null);
            setSelectedTask('');
          }
        }
      }
    } catch (error) {
      console.error('Error restoring task state:', error);
    }
  }, [isTasksLoaded, dbTasks, weeklyPlans, monthlyPlans]);

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
