'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import {
  format,
  getHours,
  getMinutes,
  subSeconds,
} from 'date-fns';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { usePersistedState } from '@/hooks/usePersistedState';
import { supabase } from '@/lib/supabase';
import { getCalendarStudyDayRange } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';
import { usePlanRequestScope } from './usePlanRequestScope';

interface TimelineProps {
  selectedDate: Date;
  userId: string;
}

interface SessionRow {
  id: string;
  created_at: string;
  duration: number;
  mode: string;
  task: string | null;
  task_id: string | null;
}

interface ProcessedSession extends SessionRow {
  _displayStart: Date;
  _displayEnd: Date;
  _displayDuration: number;
}

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
};

function TimelineSessionBar({ session, leftPercent, widthPercent, open, onOpenChange }: {
  session: ProcessedSession;
  leftPercent: number;
  widthPercent: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFocus = session.mode === 'focus' || session.mode === 'pomo';
  const task = session.task?.trim() || '작업 메모 없음';
  const hours = Math.floor(session._displayDuration / 3600);
  const minutes = Math.floor((session._displayDuration % 3600) / 60);
  const seconds = session._displayDuration % 60;
  const duration = [hours > 0 && `${hours}시간`, minutes > 0 && `${minutes}분`, (seconds > 0 || (!hours && !minutes)) && `${seconds}초`].filter(Boolean).join(' ');

  const clearCloseTimer = () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const show = () => { clearCloseTimer(); onOpenChange(true); };
  const hide = () => { clearCloseTimer(); onOpenChange(false); };
  const scheduleHide = () => {
    clearCloseTimer();
    if (document.activeElement !== triggerRef.current) {
      closeTimer.current = setTimeout(() => onOpenChange(false), 150);
    }
  };

  useEffect(() => () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
  }, []);

  return (
    <Popover.Root open={open} onOpenChange={next => { if (next) show(); else hide(); }}>
      <Popover.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={`${task} 세션 정보`}
          onPointerEnter={event => { if (event.pointerType !== 'touch') show(); }}
          onPointerLeave={event => { if (event.pointerType !== 'touch') scheduleHide(); }}
          onFocus={show}
          onBlur={event => { if (!contentRef.current?.contains(event.relatedTarget)) hide(); }}
          onClick={event => { event.preventDefault(); show(); }}
          onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hide(); }
            if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
          }}
          className={cn(
            'absolute h-full cursor-pointer opacity-80 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/60 dark:focus-visible:ring-white/80',
            isFocus ? 'bg-rose-500' : 'bg-sky-500',
          )}
          style={{ left: `${leftPercent}%`, width: `${Math.max(widthPercent, 0.5)}%` }}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          ref={contentRef}
          side="top"
          sideOffset={10}
          collisionPadding={12}
          aria-labelledby={titleId}
          onOpenAutoFocus={event => event.preventDefault()}
          onCloseAutoFocus={event => event.preventDefault()}
          onPointerEnter={clearCloseTimer}
          onPointerLeave={scheduleHide}
          onEscapeKeyDown={event => event.stopPropagation()}
          className="ui-popover z-80 max-h-(--radix-popover-content-available-height) w-70 max-w-[calc(100vw-24px)] origin-(--radix-popover-content-transform-origin) overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xl shadow-slate-900/10 outline-none dark:border-slate-700 dark:bg-slate-800 dark:shadow-black/30"
        >
          <span className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium',
            isFocus ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
          )}>
            <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', isFocus ? 'bg-rose-500' : 'bg-sky-500')} />
            {isFocus ? '뽀모도로' : '스톱워치'}
          </span>
          <h4 id={titleId} className="mt-2 text-sm font-semibold leading-6 text-slate-800 [overflow-wrap:anywhere] dark:text-slate-100">{task}</h4>
          <dl className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-700">
            <div>
              <dt className="text-[11px] text-slate-400">시간</dt>
              <dd className="mt-1 whitespace-nowrap font-medium tabular-nums text-slate-600 dark:text-slate-300">
                {format(session._displayStart, 'HH:mm')}–{format(session._displayEnd, 'HH:mm')}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-400">집중시간</dt>
              <dd className={cn('mt-1 font-semibold tabular-nums', isFocus ? 'text-rose-600 dark:text-rose-300' : 'text-sky-600 dark:text-sky-300')}>{duration}</dd>
            </div>
          </dl>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export default function Timeline({ selectedDate, userId }: TimelineProps) {
  return (
    <ScopedTimeline
      key={`${userId}:${format(selectedDate, 'yyyy-MM-dd')}`}
      selectedDate={selectedDate}
      userId={userId}
    />
  );
}

function ScopedTimeline({ selectedDate, userId }: TimelineProps) {
  const scopeRef = usePlanRequestScope();
  const [sessions, setSessions] = useState<ProcessedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeBarId, setActiveBarId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = usePersistedState(
    'timeline_expanded',
    true
  );

  const fetchSessions = useCallback(async () => {
    const scope = scopeRef.current;
    if (!scope?.active) return;
    const request = ++scope.request;
    const isCurrent = () => scope.active && request === scope.request;
    if (!userId) {
      setSessions([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // 선택한 달력 날짜의 "공부일"(05:00 ~ 다음날 04:59:59.999) 범위를 보여준다.
    const { start: dayStart, end: dayEnd } = getCalendarStudyDayRange(selectedDate);

    // 행의 created_at은 종료 시각이므로, 전날에 시작해 이 공부일로 이어지는
    // 세션을 놓치지 않도록 하루 전 공부일 시작부터 조회한 뒤 아래에서 자른다.
    const queryStart = new Date(dayStart);
    queryStart.setDate(queryStart.getDate() - 1);

    const { data, error } = await supabase
      .from('study_sessions')
      .select('id, created_at, duration, mode, task, task_id')
      .eq('user_id', userId)
      .gte('created_at', queryStart.toISOString())
      .lte('created_at', dayEnd.toISOString())
      .order('created_at', { ascending: true });

    if (!isCurrent()) return;
    if (error) {
      console.error('Error fetching sessions:', error);
      setSessions([]);
      setLoading(false);
      return;
    }

    const processedSessions = ((data ?? []) as SessionRow[])
      .map((session) => {
        const endTime = new Date(session.created_at);
        const startTime = subSeconds(endTime, session.duration);

        if (
          session.mode === 'shortBreak' ||
          session.mode === 'longBreak' ||
          endTime < dayStart ||
          startTime > dayEnd
        ) {
          return null;
        }

        const displayStart = startTime < dayStart ? dayStart : startTime;
        const displayEnd = endTime > dayEnd ? dayEnd : endTime;
        const displayDuration = Math.floor(
          (displayEnd.getTime() - displayStart.getTime()) / 1000
        );

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
      .filter((session): session is ProcessedSession => session !== null);

    setSessions(processedSessions);
    setLoading(false);
  }, [scopeRef, selectedDate, userId]);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope?.active) return;
    const refresh = () => {
      if (scope.active) void fetchSessions();
    };
    const initialFetch = setTimeout(() => {
      refresh();
    }, 0);

    if (!userId) return () => clearTimeout(initialFetch);

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
          refresh();
        }
      )
      .subscribe();

    return () => {
      clearTimeout(initialFetch);
      supabase.removeChannel(channel);
    };
  }, [fetchSessions, scopeRef, userId]);

  if (loading) {
    return <div className="p-4 text-center text-gray-500">타임라인을 불러오는 중...</div>;
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800">
        <p>이날 기록된 활동이 없어요.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div
        className="mb-6 flex cursor-pointer items-center justify-between lg:cursor-default"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
          타임라인
        </h3>
        <div className="text-gray-400 lg:hidden">
          {isExpanded ? (
            <ChevronUp className="h-5 w-5" />
          ) : (
            <ChevronDown className="h-5 w-5" />
          )}
        </div>
      </div>

      <div className="mb-8">
        <div className="relative flex h-4 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
          {[0, 6, 12, 18, 24].map((hour) => (
            <div
              key={hour}
              className="pointer-events-none absolute top-0 bottom-0 z-10 border-l border-gray-300 dark:border-gray-600"
              style={{ left: `${(hour / 24) * 100}%` }}
            />
          ))}

          {sessions.flatMap((session) => {
            // 05:00 분할 도입 후 행이 자정을 가로지를 수 있어, 00:00~24:00
            // 시계 축 막대는 자정에서 조각내 각각 제 위치에 그린다.
            const segments: { start: Date; end: Date }[] = [];
            let segmentStart = session._displayStart;
            while (segmentStart < session._displayEnd) {
              const nextMidnight = new Date(segmentStart);
              nextMidnight.setDate(nextMidnight.getDate() + 1);
              nextMidnight.setHours(0, 0, 0, 0);
              const segmentEnd =
                nextMidnight < session._displayEnd ? nextMidnight : session._displayEnd;
              segments.push({ start: segmentStart, end: segmentEnd });
              segmentStart = segmentEnd;
            }

            return segments.map((segment, segmentIndex) => {
              const startMinutes =
                getHours(segment.start) * 60 + getMinutes(segment.start);
              const durationMinutes =
                (segment.end.getTime() - segment.start.getTime()) / 60000;
              const leftPercent = (startMinutes / 1440) * 100;
              const widthPercent = (durationMinutes / 1440) * 100;
              const barId = `${session.id}-${segmentIndex}`;

              return (
                <TimelineSessionBar
                  key={barId}
                  session={session}
                  leftPercent={leftPercent}
                  widthPercent={widthPercent}
                  open={activeBarId === barId}
                  onOpenChange={next => setActiveBarId(current => next ? barId : current === barId ? null : current)}
                />
              );
            });
          })}
        </div>
        <div className="mt-1 flex justify-between px-1 text-xs text-gray-400">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
      </div>

      <div
        className={cn(
          'relative ml-3 space-y-6 border-l-2 border-gray-200 transition-all duration-300 dark:border-gray-700',
          !isExpanded && 'hidden lg:block'
        )}
      >
        {sessions.map((session) => {
          const startTime = session._displayStart;
          const endTime = session._displayEnd;
          const displayDuration = session._displayDuration;
          const isFocus = session.mode === 'focus' || session.mode === 'pomo';
          const isBreak =
            session.mode === 'shortBreak' || session.mode === 'longBreak';

          let dotColor = 'bg-sky-500';
          let cardBackground = 'bg-sky-50 dark:bg-sky-900/20';
          let textColor = 'text-sky-900 dark:text-sky-100';
          let borderColor = 'border-sky-100 dark:border-sky-800/50';

          if (isFocus) {
            dotColor = 'bg-rose-500';
            cardBackground = 'bg-rose-50 dark:bg-rose-900/20';
            textColor = 'text-rose-900 dark:text-rose-100';
            borderColor = 'border-rose-100 dark:border-rose-800/50';
          } else if (isBreak) {
            dotColor = 'bg-emerald-500';
            cardBackground = 'bg-emerald-50 dark:bg-emerald-900/20';
            textColor = 'text-emerald-900 dark:text-emerald-100';
            borderColor = 'border-emerald-100 dark:border-emerald-800/50';
          }

          return (
            <div key={session.id} className="relative pl-6">
              <div
                className={`absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-white dark:border-gray-800 ${dotColor}`}
              />

              <div className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                {format(startTime, 'HH:mm')} - {format(endTime, 'HH:mm')}
                <span className="ml-2 text-gray-400">
                  ({formatDuration(displayDuration)})
                </span>
              </div>

              <div className={`rounded-lg border p-3 ${borderColor} ${cardBackground}`}>
                <div className={`font-medium [overflow-wrap:anywhere] ${textColor}`}>
                  {session.task || (isFocus ? 'Focus Session' : 'Session')}
                </div>
                {session.mode && (
                  <div className="mt-1 text-xs capitalize opacity-75">
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
