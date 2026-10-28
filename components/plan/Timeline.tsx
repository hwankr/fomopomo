'use client';

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { format, subSeconds } from 'date-fns';
import Beads, { Bead } from '@/components/ui/Beads';
import { stopActivationKeys, stopAllKeys } from '@/components/ui/keyBoundary';
import { supabase } from '@/lib/supabase';
import { getCalendarStudyDayRange } from '@/lib/dateUtils';
import { getSessionBatchKey, isPomodoroMode } from '@/lib/pomodoroCounts';
import { cn } from '@/lib/utils';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { formatClock, formatStudyTime } from './planUi';
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
  session_batch_id?: string | null;
  group_id?: string | null;
}

interface ProcessedSession extends SessionRow {
  _displayStart: Date;
  _displayEnd: Date;
  _displayDuration: number;
}

// 같은 작업을 이어서 한 세션(사이 쉬는 시간 포함)은 블록 하나로 묶는다.
interface TimelineBlock {
  id: string;
  tone: 'pomo' | 'watch';
  title: string;
  taskId: string | null;
  start: Date;
  end: Date;
  seconds: number;
  pomodoros: number;
  sessions: ProcessedSession[];
  /** 이 블록의 작업을 끝냈는지(완료한 작업의 블록은 채운 색으로 그린다) */
  done: boolean;
}

const HOUR_HEIGHT = 60; // 1분 = 1px
const DEFAULT_FIRST_HOUR = 8;
const DEFAULT_LAST_HOUR = 21;
const MERGE_GAP_MS = 10 * 60 * 1000;
const BLOCK_MIN_HEIGHT = 28; // 제목 한 줄이 들어가는 높이
const BLOCK_GAP = 2;

const minutesFrom = (origin: Date, date: Date) => (date.getTime() - origin.getTime()) / 60000;

type PlacedBlock = { block: TimelineBlock; top: number; height: number; lane: number; lanes: number };

// 블록은 실제 시각 위치에 두고, 그려지는 높이(최소 높이 포함)가 겹치는 블록끼리 묶어
// 묶음 안에서 비어 있는 칸(lane)에 나란히 놓는다. 그래서 짧은 기록도 서로 가리지 않는다.
function placeTimelineBlocks(blocks: TimelineBlock[], origin: Date, firstHour: number): PlacedBlock[] {
  const placed = blocks
    .map((block) => {
      const start = minutesFrom(origin, block.start);
      const end = minutesFrom(origin, block.end);
      return {
        block,
        top: start - firstHour * 60 + BLOCK_GAP,
        height: Math.max(BLOCK_MIN_HEIGHT, end - start - BLOCK_GAP),
        lane: 0,
        lanes: 1,
      };
    })
    .sort((a, b) => a.top - b.top);

  let cluster: PlacedBlock[] = [];
  let clusterBottom = -Infinity;
  const laneBottoms: number[] = [];
  const closeCluster = () => {
    for (const item of cluster) item.lanes = laneBottoms.length;
    cluster = [];
    clusterBottom = -Infinity;
    laneBottoms.length = 0;
  };
  for (const item of placed) {
    if (cluster.length > 0 && item.top >= clusterBottom + BLOCK_GAP) closeCluster();
    let lane = laneBottoms.findIndex((bottom) => item.top >= bottom + BLOCK_GAP);
    if (lane === -1) lane = laneBottoms.length;
    laneBottoms[lane] = item.top + item.height;
    item.lane = lane;
    cluster.push(item);
    clusterBottom = Math.max(clusterBottom, item.top + item.height);
  }
  closeCluster();
  return placed;
}

// 칸 위치는 정적 클래스가 --lane / --lanes로 계산한다(시각 눈금 칸 56px 오른쪽을 칸 수만큼 나눈다).
const laneStyle = ({ top, height, lane, lanes }: PlacedBlock) =>
  ({ top, height, '--lane': lane, '--lanes': lanes }) as CSSProperties;
const LANE_CLASSES = 'left-[calc(56px_+_(100%_-_56px)_*_var(--lane)_/_var(--lanes))] w-[calc((100%_-_56px)_/_var(--lanes)_-_4px)]';

function buildBlocks(sessions: ProcessedSession[], doneTaskIds: ReadonlySet<string>): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];
  for (const session of [...sessions].sort((a, b) => a._displayStart.getTime() - b._displayStart.getTime())) {
    const tone = isPomodoroMode(session.mode) ? 'pomo' : 'watch';
    const title = session.task?.trim() || (tone === 'pomo' ? '뽀모도로' : '스톱워치');
    const previous = blocks.at(-1);
    const sameTask = previous && previous.tone === tone && (session.task_id
      ? previous.taskId === session.task_id
      : !previous.taskId && previous.title === title);
    if (previous && sameTask && session._displayStart.getTime() - previous.end.getTime() <= MERGE_GAP_MS) {
      previous.sessions.push(session);
      if (session._displayEnd > previous.end) previous.end = session._displayEnd;
      previous.seconds += session._displayDuration;
      continue;
    }
    blocks.push({
      id: session.id,
      tone,
      title,
      taskId: session.task_id,
      start: session._displayStart,
      end: session._displayEnd,
      seconds: session._displayDuration,
      pomodoros: 0,
      sessions: [session],
      done: Boolean(session.task_id && doneTaskIds.has(session.task_id)),
    });
  }
  for (const block of blocks) {
    block.pomodoros = block.tone === 'pomo'
      ? new Set(block.sessions.map((session) => getSessionBatchKey(session))).size
      : 0;
  }
  return blocks;
}

// 블록(데스크톱)과 목록 행(모바일)이 같이 쓰는 상세 트리거: 마우스 올림·포커스·탭으로 열고 Escape·밖 누르기로 닫는다.
function TimelineBlockTrigger({ block, origin, open, onOpenChange, className, style, children, ...dataAttributes }: {
  block: TimelineBlock;
  origin: Date;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className: string;
  style?: CSSProperties;
  children: ReactNode;
  [dataAttribute: `data-${string}`]: string | number;
}) {
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPomo = block.tone === 'pomo';
  const range = `${formatClock(minutesFrom(origin, block.start))}–${formatClock(minutesFrom(origin, block.end))}`;
  const duration = formatStudyTime(block.seconds);

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
          aria-label={`${block.title} 기록 정보, ${range}, ${isPomo ? `뽀모도로 ${block.pomodoros}개` : `스톱워치 ${duration}`}`}
          onPointerEnter={event => { if (event.pointerType !== 'touch') show(); }}
          onPointerLeave={event => { if (event.pointerType !== 'touch') scheduleHide(); }}
          onFocus={show}
          onBlur={event => { if (!contentRef.current?.contains(event.relatedTarget)) hide(); }}
          onClick={event => { event.preventDefault(); show(); }}
          onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hide(); }
            stopActivationKeys(event);
          }}
          className={className}
          style={style}
          {...dataAttributes}
        >
          {children}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          ref={contentRef}
          side="top"
          sideOffset={10}
          collisionPadding={12}
          aria-labelledby={titleId}
          onOpenAutoFocus={event => event.preventDefault()}
          // 트리거가 포커스로 열리므로 닫힐 때 포커스를 트리거로 돌려주지 않는다(guardClosingPopovers도 안의 포커스만 놓는다).
          onCloseAutoFocus={event => event.preventDefault()}
          data-close-autofocus="off"
          onPointerEnter={clearCloseTimer}
          onPointerLeave={scheduleHide}
          onEscapeKeyDown={event => event.stopPropagation()}
          onKeyDown={stopAllKeys}
          className="ui-popover ui-popover-surface z-80 max-h-(--radix-popover-content-available-height) w-70 max-w-[calc(100vw-24px)] origin-(--radix-popover-content-transform-origin) overflow-y-auto p-4 outline-none"
        >
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
            <Bead state="done" tone={block.tone} size={6} />
            {isPomo ? '뽀모도로' : '스톱워치'}
          </span>
          <h4 id={titleId} className="mt-1.5 text-[15px] font-semibold leading-6 [overflow-wrap:anywhere]">{block.title}</h4>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
            <div>
              <dt className="text-ink-subtle">시간</dt>
              <dd className="mt-0.5 font-semibold whitespace-nowrap">{range}</dd>
            </div>
            <div>
              <dt className="text-ink-subtle">집중 시간</dt>
              <dd className={cn('mt-0.5 font-semibold', isPomo ? 'text-pomo-deep' : 'text-watch-deep')}>{duration}</dd>
            </div>
            {isPomo ? (
              <div>
                <dt className="text-ink-subtle">끝낸 뽀모도로</dt>
                <dd className="mt-0.5 font-semibold">{block.pomodoros}개</dd>
              </div>
            ) : null}
          </dl>
          {block.sessions.length > 1 ? (
            <ul className="mt-3 flex flex-col gap-0.5 text-[13px] text-ink-muted">
              {block.sessions.map((session) => (
                <li key={session.id}>
                  {formatClock(minutesFrom(origin, session._displayStart))}–{formatClock(minutesFrom(origin, session._displayEnd))}
                  {' · '}{formatStudyTime(session._displayDuration)}
                </li>
              ))}
            </ul>
          ) : null}
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
  const [doneTaskIds, setDoneTaskIds] = useState<ReadonlySet<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const isDesktop = useIsDesktop();

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
      .select('id, created_at, duration, mode, task, task_id, session_batch_id, group_id')
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

    // 끝낸 작업의 블록은 채운 색으로 그리므로 연결된 작업의 상태를 읽는다.
    const taskIds = [...new Set(processedSessions.flatMap((session) => session.task_id ? [session.task_id] : []))];
    const nextDoneTaskIds = new Set<string>();
    if (taskIds.length > 0) {
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .select('id, status')
        .eq('user_id', userId)
        .in('id', taskIds);
      if (!isCurrent()) return;
      if (taskError) {
        console.error('Error fetching timeline task status:', taskError);
      } else {
        for (const task of (taskData ?? []) as Array<{ id: string; status: string }>) {
          if (task.status === 'done') nextDoneTaskIds.add(task.id);
        }
      }
    }

    setSessions(processedSessions);
    setDoneTaskIds(nextDoneTaskIds);
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
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
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
    return <p className="m-0 py-4 text-sm text-ink-muted">타임라인을 불러오는 중...</p>;
  }

  // 축은 선택한 날짜 0시 기준 분. 공부일이 다음날 04:59까지라 24시를 넘을 수 있다.
  const origin = new Date(selectedDate);
  origin.setHours(0, 0, 0, 0);
  const blocks = buildBlocks(sessions, doneTaskIds);
  const firstHour = Math.min(DEFAULT_FIRST_HOUR, ...blocks.map((block) => Math.floor(minutesFrom(origin, block.start) / 60)));
  const lastHour = Math.max(DEFAULT_LAST_HOUR, ...blocks.map((block) => Math.ceil(minutesFrom(origin, block.end) / 60) - 1));
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index);
  const toggleBlock = (blockId: string) => (next: boolean) =>
    setActiveBlockId(current => next ? blockId : current === blockId ? null : current);
  const emptyText = '이날 기록된 활동이 없어요.';

  // 모바일 보드의 목록 행: min-height 58px + 위아래 6px(content-box) = 바깥 70px.
  // 행 전체가 상세 트리거라 끝 시각, 긴 제목 전체, 묶인 기록마다의 시간을 볼 수 있다.
  if (!isDesktop) {
    if (blocks.length === 0) return <p className="m-0 text-sm text-ink-muted">{emptyText}</p>;
    return (
      <ul className="m-0 flex list-none flex-col p-0">
        {blocks.map((block) => (
          <li key={block.id} className="-mx-3">
            <TimelineBlockTrigger
              block={block}
              origin={origin}
              open={activeBlockId === block.id}
              onOpenChange={toggleBlock(block.id)}
              className="flex min-h-[70px] w-full items-center gap-3 rounded-tile px-3 py-1.5 text-left transition-colors hover:bg-hover"
            >
              <span className="w-[46px] shrink-0 text-[13px] font-semibold text-ink-muted">
                {formatClock(minutesFrom(origin, block.start))}
              </span>
              <span
                aria-hidden="true"
                className={cn('h-9 w-1 shrink-0 rounded-[2px]', block.tone === 'pomo' ? 'bg-pomo' : 'bg-watch')}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-[5px]">
                <span className={cn('truncate text-[15px] font-semibold', block.done ? 'text-ink-muted' : 'text-ink')}>
                  {block.title}
                </span>
                <span className="flex min-w-0 items-center gap-2 text-xs text-ink-subtle">
                  {block.tone === 'pomo' ? (
                    <Beads label={`뽀모도로 ${block.pomodoros}개`} done={block.pomodoros} />
                  ) : (
                    <span>스톱워치</span>
                  )}
                  <span className="whitespace-nowrap">
                    {formatClock(minutesFrom(origin, block.start))}–{formatClock(minutesFrom(origin, block.end))}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-[13px] text-ink-muted">{formatStudyTime(block.seconds)}</span>
            </TimelineBlockTrigger>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="relative" style={{ height: hours.length * HOUR_HEIGHT }}>
      {hours.map((hour, index) => (
        <div
          key={hour}
          className="absolute right-0 left-0 h-[60px] border-t border-line-faint"
          style={{ top: index * HOUR_HEIGHT }}
        >
          <span className="block w-12 pt-1.5 text-xs font-medium text-ink-faint">{formatClock(hour * 60)}</span>
        </div>
      ))}
      {placeTimelineBlocks(blocks, origin, firstHour).map((item) => {
        const { block, height, lanes } = item;
        const isPomo = block.tone === 'pomo';
        const compact = height < 32;
        return (
          <TimelineBlockTrigger
            key={block.id}
            block={block}
            origin={origin}
            open={activeBlockId === block.id}
            onOpenChange={toggleBlock(block.id)}
            data-lane={item.lane}
            data-lanes={lanes}
            className={cn(
              'absolute flex items-start justify-between gap-2 overflow-hidden rounded-control text-left text-sm leading-[1.3] transition-[filter] hover:brightness-97',
              lanes > 1 ? cn(LANE_CLASSES, 'px-2.5') : 'right-0 left-14 px-3.5',
              compact ? 'py-1' : 'py-1.5',
              isPomo
                ? block.done ? 'ui-focus-ink bg-pomo text-white [--bead-on:var(--color-white)]' : 'bg-pomo-tint text-pomo-deep'
                : block.done ? 'ui-focus-ink bg-watch text-white' : 'bg-watch-tint text-watch-deep',
            )}
            style={laneStyle(item)}
          >
            <span className="min-w-0 truncate font-semibold">{block.title}</span>
            {isPomo ? (
              <Beads label={`뽀모도로 ${block.pomodoros}개`} done={block.pomodoros} className={compact ? 'pt-1' : 'pt-[5px]'} />
            ) : (
              <span className="shrink-0 text-[13px] font-semibold">{formatStudyTime(block.seconds)}</span>
            )}
          </TimelineBlockTrigger>
        );
      })}
      {blocks.length === 0 ? (
        <p className="absolute top-[18px] left-14 m-0 text-ink-muted">{emptyText}</p>
      ) : null}
    </div>
  );
}
