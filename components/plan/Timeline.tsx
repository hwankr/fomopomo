'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { format, subSeconds, getHours, getMinutes } from 'date-fns';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimelineProps {
  selectedDate: Date;
  userId: string;
}

interface Session {
  id: string;
  created_at: string;
  duration: number;
  mode: string;
  task: string | null;
  task_id: string | null;
}

const formatDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

export default function Timeline({ selectedDate, userId }: TimelineProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);

  const fetchSessions = async () => {
    if (!userId) return;
    
    setLoading(true);
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('study_sessions')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching sessions:', error);
    } else {
      setSessions(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSessions();

    const channel = supabase
      .channel('timeline-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'study_sessions',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchSessions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate, userId]);

  if (loading) {
    return <div className="p-4 text-center text-gray-500">Loading timeline...</div>;
  }

  if (sessions.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
        <p>No activity recorded for this day.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
      <div 
        className="flex justify-between items-center mb-6 cursor-pointer lg:cursor-default"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Timeline</h3>
        <div className="lg:hidden text-gray-400">
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </div>
      
      {/* Day Bar Visualization */}
      <div className="mb-8">
        <div className="relative h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden w-full flex">
          {/* Hour Markers (Optional, simplified for now) */}
          {[0, 6, 12, 18, 24].map(hour => (
            <div 
              key={hour} 
              className="absolute top-0 bottom-0 border-l border-gray-300 dark:border-gray-600 z-10"
              style={{ left: `${(hour / 24) * 100}%` }}
            />
          ))}

          {/* Session Blocks */}
          {sessions.map((session) => {
            const endTime = new Date(session.created_at);
            const startTime = subSeconds(endTime, session.duration);
            
            // Calculate position in day (0-1440 minutes)
            const startMinutes = getHours(startTime) * 60 + getMinutes(startTime);
            const durationMinutes = session.duration / 60;
            
            const leftPercent = (startMinutes / 1440) * 100;
            const widthPercent = (durationMinutes / 1440) * 100;

            const isFocus = session.mode === 'focus' || session.mode === 'pomo';
            const colorClass = isFocus ? 'bg-rose-500' : 'bg-emerald-500';

            return (
              <div
                key={session.id}
                className={`absolute h-full ${colorClass} opacity-80 hover:opacity-100 transition-opacity cursor-help`}
                style={{ 
                  left: `${leftPercent}%`, 
                  width: `${Math.max(widthPercent, 0.5)}%` // Min width for visibility
                }}
                title={`${format(startTime, 'HH:mm')} - ${session.task || (isFocus ? 'Focus' : 'Break')}`}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1 px-1">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
      </div>

      {/* List Visualization */}
      <div className={cn("relative border-l-2 border-gray-200 dark:border-gray-700 ml-3 space-y-6 transition-all duration-300", !isExpanded && "hidden lg:block")}>
        {sessions.map((session) => {
          const endTime = new Date(session.created_at);
          const startTime = subSeconds(endTime, session.duration);
          
          const isFocus = session.mode === 'focus' || session.mode === 'pomo';
          const isBreak = session.mode === 'shortBreak' || session.mode === 'longBreak';
          
          let dotColor = 'bg-gray-300';
          let cardBg = 'bg-gray-50 dark:bg-gray-700/50';
          let textColor = 'text-gray-700 dark:text-gray-300';
          let borderColor = 'border-gray-200 dark:border-gray-600';

          if (isFocus) {
            dotColor = 'bg-rose-500';
            cardBg = 'bg-rose-50 dark:bg-rose-900/20';
            textColor = 'text-rose-900 dark:text-rose-100';
            borderColor = 'border-rose-100 dark:border-rose-800/50';
          } else if (isBreak) {
            dotColor = 'bg-emerald-500';
            cardBg = 'bg-emerald-50 dark:bg-emerald-900/20';
            textColor = 'text-emerald-900 dark:text-emerald-100';
            borderColor = 'border-emerald-100 dark:border-emerald-800/50';
          }

          return (
            <div key={session.id} className="relative pl-6">
              <div 
                className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white dark:border-gray-800 ${dotColor}`}
              />
              
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                {format(startTime, 'HH:mm')} - {format(endTime, 'HH:mm')}
                <span className="ml-2 text-gray-400">
                  ({formatDuration(session.duration)})
                </span>
              </div>

              <div className={`p-3 rounded-lg border ${borderColor} ${cardBg}`}>
                <div className={`font-medium ${textColor}`}>
                  {session.task || (isFocus ? 'Focus Session' : 'Break')}
                </div>
                {session.mode && (
                  <div className="text-xs opacity-75 mt-1 capitalize">
                    {session.mode.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
