'use client';

import { useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { format } from 'date-fns';
import Calendar from './Calendar';
import { cn } from '@/lib/utils';
import TaskList from './TaskList';
import Timeline from './Timeline';
import WeeklyPlan from './WeeklyPlan';
import MonthlyPlan from './MonthlyPlan';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { ArrowLeft, ChevronUp, ChevronDown } from 'lucide-react';
import TimerStatus from '../TimerStatus';

interface DashboardProps {
  session: Session | null;
}

export default function Dashboard({ session }: DashboardProps) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [focusTime, setFocusTime] = useState(0);
  const [isDailyTasksExpanded, setIsDailyTasksExpanded] = useState(true);

  useEffect(() => {
    if (!session) return;

    const fetchFocusTime = async () => {
      const start = new Date(selectedDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(selectedDate);
      end.setHours(23, 59, 59, 999);

      const { data } = await supabase
        .from('study_sessions')
        .select('duration')
        .eq('user_id', session.user.id)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());

      if (data) {
        const total = data.reduce((acc: number, curr: { duration: number }) => acc + curr.duration, 0);
        setFocusTime(total);
      } else {
        setFocusTime(0);
      }
    };

    fetchFocusTime();

    // Real-time subscription
    const channel = supabase
      .channel('dashboard-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'study_sessions',
        },
        () => {
          fetchFocusTime();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate, session]);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span className="hidden sm:inline">Back to Timer</span>
          </Link>
          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-2"></div>
          <h1 className="text-xl font-bold tracking-tight">Planfomo</h1>
          <div className="hidden sm:block">
            <TimerStatus />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
            {session?.user?.email || 'Guest'}
          </div>
          {session ? (
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
            >
              Log out
            </button>
          ) : (
            <button
              onClick={() => supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                  redirectTo: window.location.origin,
                },
              })}
              className="text-sm text-rose-500 hover:text-rose-600 font-medium transition-colors"
            >
              Log in
            </button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          {/* Left Column Wrapper */}
          <div className="contents lg:flex lg:flex-col lg:col-span-4 lg:space-y-6">
            {/* 1. Calendar */}
            <div className="order-1 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
              <Calendar
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
              />
            </div>

            {/* 2. Daily Focus */}
            <div className="order-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl p-6 border border-indigo-100 dark:border-indigo-800/50">
              <h3 className="text-indigo-900 dark:text-indigo-100 font-semibold mb-2">Daily Focus</h3>
              <p className="text-indigo-600 dark:text-indigo-300 text-sm">
                You focused for <span className="font-bold text-2xl block mt-2">{formatDuration(focusTime)}</span>
                <br />
                on {format(selectedDate, 'MMM d')}.
              </p>
            </div>

            {/* 4. Timeline */}
            <div className="order-4">
              <Timeline selectedDate={selectedDate} userId={session?.user?.id || ''} />
            </div>
          </div>

          {/* Right Column Wrapper */}
          <div className="contents lg:flex lg:flex-col lg:col-span-8 lg:space-y-6">
            {/* 3. Daily Task */}
            <div className={cn(
              "order-3 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col transition-all duration-300",
              isDailyTasksExpanded ? "min-h-[600px]" : "min-h-0"
            )}>
              <div 
                className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center cursor-pointer lg:cursor-default"
                onClick={() => setIsDailyTasksExpanded(!isDailyTasksExpanded)}
              >
                <div>
                  <h2 className="text-2xl font-bold">
                    {format(selectedDate, 'MMMM d, yyyy')}
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                    {format(selectedDate, 'EEEE')}
                  </p>
                </div>
                <div className="lg:hidden text-gray-400">
                  {isDailyTasksExpanded ? <ChevronUp className="w-6 h-6" /> : <ChevronDown className="w-6 h-6" />}
                </div>
              </div>

              <div className={cn("flex-1 p-6", !isDailyTasksExpanded && "hidden lg:block")}>
                <TaskList selectedDate={selectedDate} userId={session?.user?.id || ''} />
              </div>
            </div>

            {/* 5. Goals Section (Weekly & Monthly) */}
            <div className="order-5 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <WeeklyPlan userId={session?.user?.id || ''} />
              </div>
              <div>
                <MonthlyPlan userId={session?.user?.id || ''} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
