'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { format, subSeconds, getHours, getMinutes } from 'date-fns';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePersistedState } from '@/hooks/usePersistedState';

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

// Extended session interface with display-adjusted times for cross-midnight sessions
interface ProcessedSession extends Session {
  _displayStart: Date;
  _displayEnd: Date;
  _displayDuration: number;
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
  const [sessions, setSessions] = useState<ProcessedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = usePersistedState('timeline_expanded', true);

  const fetchSessions = async () => {
    if (!userId) return;

    setLoading(true);

    // Define the selected day's boundaries
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(23, 59, 59, 999);

    // Query from one day before to catch cross-midnight sessions
    const queryStart = new Date(selectedDate);
    queryStart.setDate(queryStart.getDate() - 1);
    queryStart.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('study_sessions')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', queryStart.toISOString())
      .lte('created_at', dayEnd.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching sessions:', error);
      setSessions([]);
    } else {
      // Process sessions to handle cross-midnight cases
      const processedSessions: ProcessedSession[] = (data || [])
        .map((session: Session) => {
          const endTime = new Date(session.created_at);
          const startTime = subSeconds(endTime, session.duration);

          // Exclude break sessions from timeline
          if (session.mode === 'shortBreak' || session.mode === 'longBreak') {
            return null;
          }

          // Check if session overlaps with the selected day
          if (endTime < dayStart || startTime > dayEnd) {
            return null;
          }

          // Adjust display times to fit within the selected day
          const displayStart = startTime < dayStart ? dayStart : startTime;
          const displayEnd = endTime > dayEnd ? dayEnd : endTime;
          const displayDuration = Math.floor((displayEnd.getTime() - displayStart.getTime()) / 1000);

          // Only include if there's meaningful duration to display
          if (displayDuration < 1) {
            return null;
          }

          return {
            ...session,
            _displayStart: displayStart,
            _displayEnd: displayEnd,
            _displayDuration: displayDuration,
          };
        })
        .filter((s): s is ProcessedSession => s !== null);

      setSessions(processedSessions);
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
    return <div className="p-4 text-center text-gray-500">타임라인 불러오는 중...</div>;
  }

  if (sessions.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
        <p>오늘의 활동 기록이 없습니다.</p>
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
            // Use processed display times for cross-midnight support
            const startTime = session._displayStart;
            const durationSeconds = session._displayDuration;

            // Calculate position in day (0-1440 minutes)
            const startMinutes = getHours(startTime) * 60 + getMinutes(startTime);
            const durationMinutes = durationSeconds / 60;

            const leftPercent = (startMinutes / 1440) * 100;
            const widthPercent = (durationMinutes / 1440) * 100;

            const isFocus = session.mode === 'focus' || session.mode === 'pomo';
            const isBreak = session.mode === 'shortBreak' || session.mode === 'longBreak';
            // Pomo: rose, Break: emerald, Stopwatch: sky
            const colorClass = isFocus ? 'bg-rose-500' : isBreak ? 'bg-emerald-500' : 'bg-sky-500';

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
          // Use processed display times for cross-midnight support
          const startTime = session._displayStart;
          const endTime = session._displayEnd;
          const displayDuration = session._displayDuration;

          const isFocus = session.mode === 'focus' || session.mode === 'pomo';
          const isBreak = session.mode === 'shortBreak' || session.mode === 'longBreak';

          // Default: Stopwatch sessions (sky blue)
          let dotColor = 'bg-sky-500';
          let cardBg = 'bg-sky-50 dark:bg-sky-900/20';
          let textColor = 'text-sky-900 dark:text-sky-100';
          let borderColor = 'border-sky-100 dark:border-sky-800/50';

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
                  ({formatDuration(displayDuration)})
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
