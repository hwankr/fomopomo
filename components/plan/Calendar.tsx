'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { eachDayOfInterval, endOfMonth, format, isSameDay, isToday, startOfMonth } from 'date-fns';
import { Bead, type BeadState } from '@/components/ui/Beads';
import { playMotion } from '@/components/ui/motion';
import { cn } from '@/lib/utils';
import { getKoreanHolidays } from '@/actions/holidays';
import { formatDayLabel, WEEKDAY_LABELS } from './planUi';
import type { DayPomodoros } from './useMonthPomodoros';

interface CalendarProps {
  /** 보여 줄 달(아무 날짜나 그 달로 본다) */
  month: Date;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  /** 날짜 키('yyyy-MM-dd')별 끝낸·남은 뽀모도로. 없으면 구슬을 그리지 않는다. */
  days?: ReadonlyMap<string, DayPomodoros> | null;
}

// 날짜 칸의 구슬은 끝낸 것 먼저, 남은 계획을 이어서 최대 6알(모바일은 앞의 4알만 보인다).
const MAX_MARKS = 6;
// 달을 넘길 때 새 달의 칸이 넘긴 쪽에서 밀려 오는 거리(px)
const MONTH_SHIFT = 6;

function buildMarks(day: DayPomodoros | undefined): BeadState[] {
  if (!day) return [];
  const done = Math.min(MAX_MARKS, day.done);
  const planned = Math.min(MAX_MARKS - done, day.planned);
  return [...Array<BeadState>(done).fill('done'), ...Array<BeadState>(planned).fill('planned')];
}

export default function Calendar({ month, selectedDate, onSelectDate, days }: CalendarProps) {
  const year = month.getFullYear();
  const monthKey = format(month, 'yyyy-MM');
  const [holidays, setHolidays] = useState<{ year: number; dates: number[] } | null>(null);
  const daysRef = useRef<HTMLDivElement>(null);
  const shownMonthRef = useRef(monthKey);

  // 달을 넘기면 새 달의 날짜 칸이 넘긴 방향에서 나타난다(다음 달은 오른쪽에서, 이전 달은 왼쪽에서).
  // 처음 그릴 때와 같은 달을 다시 그릴 때는 움직이지 않는다.
  useLayoutEffect(() => {
    const previous = shownMonthRef.current;
    shownMonthRef.current = monthKey;
    if (previous === monthKey) return;
    const shift = monthKey > previous ? MONTH_SHIFT : -MONTH_SHIFT;
    playMotion(daysRef.current, [{ opacity: 0, transform: `translateX(${shift}px)`, offset: 0 }]);
  }, [monthKey]);

  useEffect(() => {
    let active = true;
    void getKoreanHolidays(String(year)).then((dates) => {
      if (active) setHolidays({ year, dates });
    });
    return () => { active = false; };
  }, [year]);

  const holidayDates = holidays?.year === year ? holidays.dates : [];
  const monthStart = startOfMonth(month);
  const monthDays = eachDayOfInterval({ start: monthStart, end: endOfMonth(monthStart) });
  const leadingBlanks = monthStart.getDay();
  const trailingBlanks = (7 - ((leadingBlanks + monthDays.length) % 7)) % 7;

  return (
    <div className="flex flex-col gap-3.5">
      {/* 요일 줄과 날짜 칸을 나눠 달을 넘길 때 날짜 칸만 움직인다(간격은 한 격자일 때와 같다). */}
      <div className="flex flex-col gap-1 md:gap-1.5">
        <div className="grid grid-cols-7 gap-1 md:gap-1.5">
          {WEEKDAY_LABELS.map((label, index) => (
            <span
              key={label}
              aria-hidden="true"
              className={cn(
                'pb-0.5 text-center text-xs font-semibold md:pb-0 md:text-[13px]',
                index === 0 ? 'text-pomo' : 'text-ink-muted'
              )}
            >
              {label}
            </span>
          ))}
        </div>

        <div ref={daysRef} className="grid grid-cols-7 gap-1 md:gap-1.5">
          {Array.from({ length: leadingBlanks }, (_, index) => (
            <span key={`lead-${index}`} aria-hidden="true" />
          ))}

          {monthDays.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const isSelected = isSameDay(day, selectedDate);
            const isDayToday = isToday(day);
            const isHoliday = holidayDates.includes(Number(format(day, 'yyyyMMdd')));
            const summary = days?.get(key);
            const marks = buildMarks(summary);
            const label = [
              formatDayLabel(day),
              summary?.done ? `끝낸 뽀모도로 ${summary.done}개` : '',
              summary?.planned ? `남은 계획 ${summary.planned}개` : '',
              isHoliday ? '공휴일' : '',
              isDayToday ? '오늘' : '',
            ].filter(Boolean).join(', ');

            return (
              <button
                key={key}
                type="button"
                aria-label={label}
                aria-pressed={isSelected}
                aria-current={isDayToday ? 'date' : undefined}
                onClick={() => onSelectDate(day)}
                className={cn(
                  'flex h-[50px] min-w-0 flex-col items-center justify-start gap-[3px] rounded-control pt-1 text-ink transition-colors hover:bg-hover',
                  'md:h-[84px] md:gap-2 md:rounded-2xl md:px-1.5 md:pt-3 md:pb-2',
                  isSelected && 'bg-surface hover:bg-surface'
                )}
              >
                <span
                  className={cn(
                    'flex size-7 items-center justify-center rounded-full text-sm leading-none md:size-8 md:text-[15px]',
                    isDayToday
                      ? 'bg-pomo font-bold text-white'
                      : cn(
                          day.getDay() === 0 || isHoliday ? 'text-pomo' : 'text-ink',
                          isSelected ? 'font-bold' : 'font-medium'
                        )
                  )}
                >
                  {day.getDate()}
                </span>
                <span
                  aria-hidden="true"
                  data-bead-tone="pomo"
                  className="flex h-1 gap-0.5 [--bead-size:4px] max-md:[&>:nth-child(n+5)]:hidden md:h-1.5 md:gap-[3px] md:[--bead-size:6px]"
                >
                  {marks.map((state, index) => (
                    <span key={index} data-state={state} className="ui-bead" />
                  ))}
                </span>
              </button>
            );
          })}

          {Array.from({ length: trailingBlanks }, (_, index) => (
            <span key={`trail-${index}`} aria-hidden="true" />
          ))}
        </div>
      </div>

      <div className="hidden gap-5 px-2 pt-1 text-[13px] text-ink-muted md:flex">
        <span className="flex items-center gap-1.5"><Bead state="done" size={8} />끝낸 뽀모도로</span>
        <span className="flex items-center gap-1.5"><Bead state="planned" size={8} />계획한 뽀모도로</span>
      </div>
    </div>
  );
}
