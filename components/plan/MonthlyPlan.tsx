'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { CheckCircle2, Circle, Plus, Trash2, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MonthlyPlan {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  month: number;
  year: number;
}

interface MonthlyPlanProps {
  userId: string;
}

export default function MonthlyPlan({ userId }: MonthlyPlanProps) {
  const [plans, setPlans] = useState<MonthlyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPlanTitle, setNewPlanTitle] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Calculate current month and year
  const today = new Date();
  const currentMonth = today.getMonth() + 1; // 1-12
  const currentYear = today.getFullYear();

  const fetchPlans = useCallback(async () => {
    if (!userId) {
      setPlans([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    
    const { data, error } = await supabase
      .from('monthly_plans')
      .select('*')
      .eq('user_id', userId)
      .eq('month', currentMonth)
      .eq('year', currentYear)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching monthly plans:', error);
    } else {
      setPlans(data || []);
    }
    setLoading(false);
  }, [userId, currentMonth, currentYear]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const addPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlanTitle.trim()) return;
    if (!userId) {
      alert('Please log in to add plans.');
      return;
    }

    const { data, error } = await supabase
      .from('monthly_plans')
      .insert({
        user_id: userId,
        title: newPlanTitle,
        month: currentMonth,
        year: currentYear,
        status: 'todo',
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding plan:', error);
    } else if (data) {
      setPlans([...plans, data]);
      setNewPlanTitle('');
      setIsAdding(false);
    }
  };

  const togglePlanStatus = async (plan: MonthlyPlan) => {
    const newStatus = plan.status === 'done' ? 'todo' : 'done';
    
    const { error } = await supabase
      .from('monthly_plans')
      .update({ status: newStatus })
      .eq('id', plan.id);

    if (error) {
      console.error('Error updating plan:', error);
    } else {
      setPlans(plans.map(p => p.id === plan.id ? { ...p, status: newStatus } : p));
    }
  };

  const deletePlan = async (id: string) => {
    if (!confirm('Are you sure you want to delete this plan?')) return;

    const { error } = await supabase
      .from('monthly_plans')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting plan:', error);
    } else {
      setPlans(plans.filter(p => p.id !== id));
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 flex flex-col transition-all duration-300">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-purple-500" />
            Monthly Goals
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {format(today, 'MMMM yyyy')}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 max-h-[300px] min-h-[100px] custom-scrollbar">
        {loading ? (
          <div className="text-center text-gray-400 py-6">Loading...</div>
        ) : plans.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 py-6">
            <p className="text-sm">No goals for this month.</p>
            {!isAdding && (
              <button 
                onClick={() => setIsAdding(true)}
                className="mt-2 text-purple-500 hover:text-purple-600 font-medium text-sm"
              >
                + Set a goal
              </button>
            )}
          </div>
        ) : (
          plans.map((plan) => (
            <div
              key={plan.id}
              className="group flex items-center gap-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-transparent hover:border-purple-200 dark:hover:border-purple-800 transition-all"
            >
              <button
                onClick={() => togglePlanStatus(plan)}
                className={cn(
                  "flex-shrink-0 transition-colors",
                  plan.status === 'done' ? "text-purple-500" : "text-gray-400 hover:text-purple-400"
                )}
              >
                {plan.status === 'done' ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <Circle className="w-5 h-5" />
                )}
              </button>
              
              <span className={cn(
                "flex-1 text-sm font-medium transition-all",
                plan.status === 'done' ? "text-gray-400 line-through" : "text-gray-700 dark:text-gray-200"
              )}>
                {plan.title}
              </span>

              <button
                onClick={() => deletePlan(plan.id)}
                className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
        {isAdding ? (
          <form onSubmit={addPlan} className="flex flex-col gap-3">
            <input
              type="text"
              value={newPlanTitle}
              onChange={(e) => setNewPlanTitle(e.target.value)}
              placeholder="This month's goal..."
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 dark:text-white"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-3 py-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newPlanTitle.trim()}
                className="px-4 py-2 bg-purple-500 text-white font-bold rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                Add
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="w-full py-3 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-gray-400 hover:text-purple-500 hover:border-purple-200 dark:hover:text-purple-400 dark:hover:border-purple-800 transition-all flex items-center justify-center gap-2 font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Monthly Goal
          </button>
        )}
      </div>
    </div>
  );
}
