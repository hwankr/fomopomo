'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  addDays, addMonths, addYears, endOfMonth, endOfWeek, format,
  isSameDay, isSameMonth, isValid, parse, startOfDay, startOfMonth, startOfWeek,
} from 'date-fns';
import { ko } from 'date-fns/locale';

type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  id?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const dateKey = (date: Date) => format(date, 'yyyy-MM-dd');

// Date-only values must stay local. Parsing through Date(string) would treat
// them as UTC and can display the preceding day in western time zones.
function parseDate(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = parse(value, 'yyyy-MM-dd', new Date());
  return isValid(date) && dateKey(date) === value ? date : null;
}

function clampDate(date: Date, min: Date | null, max: Date | null) {
  if (min && date < min) return min;
  if (max && date > max) return max;
  return date;
}

export default function DatePicker({
  value, onChange, label, id, min, max, disabled = false,
  placeholder = '날짜 선택', className = '',
}: DatePickerProps) {
  const generatedId = useId();
  const triggerId = id ?? `date-${generatedId}`;
  const labelId = `${triggerId}-label`;
  const valueId = `${triggerId}-value`;
  const titleId = `${triggerId}-month`;
  const helpId = `${triggerId}-help`;
  const selectedDate = parseDate(value);
  const minimum = parseDate(min);
  const maximum = parseDate(max);
  const today = startOfDay(new Date());
  const invalidRange = Boolean(minimum && maximum && minimum > maximum);
  const [open, setOpen] = useState(false);
  const [activeDate, setActiveDate] = useState(() =>
    clampDate(parseDate(value) ?? startOfDay(new Date()), parseDate(min), parseDate(max))
  );
  const focusDate = clampDate(activeDate, minimum, maximum);
  const activeKey = dateKey(focusDate);
  const visibleMonth = startOfMonth(focusDate);
  const firstDay = startOfWeek(visibleMonth, { weekStartsOn: 0 });
  const days = Array.from({ length: 42 }, (_, index) => addDays(firstDay, index));
  const dayButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusOnMove = useRef(false);
  const isOpen = open && !disabled && !invalidRange;
  const isAllowed = (date: Date) =>
    !invalidRange && (!minimum || date >= minimum) && (!maximum || date <= maximum);

  useEffect(() => {
    if (isOpen && focusOnMove.current) {
      dayButtons.current.get(activeKey)?.focus();
      focusOnMove.current = false;
    }
  }, [activeKey, isOpen]);

  const changeOpen = (nextOpen: boolean) => {
    if (nextOpen) {
      setActiveDate(clampDate(selectedDate ?? today, minimum, maximum));
    }
    setOpen(nextOpen);
  };

  const selectDate = (date: Date) => {
    if (!isAllowed(date)) return;
    onChange(dateKey(date));
    setOpen(false);
  };

  const moveDate = (date: Date, focus = true) => {
    focusOnMove.current = focus;
    setActiveDate(clampDate(startOfDay(date), minimum, maximum));
  };

  const handleDayKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: Date) => {
    let nextDate: Date;
    switch (event.key) {
      case 'ArrowLeft': nextDate = addDays(date, -1); break;
      case 'ArrowRight': nextDate = addDays(date, 1); break;
      case 'ArrowUp': nextDate = addDays(date, -7); break;
      case 'ArrowDown': nextDate = addDays(date, 7); break;
      case 'Home': nextDate = startOfWeek(date, { weekStartsOn: 0 }); break;
      case 'End': nextDate = endOfWeek(date, { weekStartsOn: 0 }); break;
      case 'PageUp': nextDate = event.shiftKey ? addYears(date, -1) : addMonths(date, -1); break;
      case 'PageDown': nextDate = event.shiftKey ? addYears(date, 1) : addMonths(date, 1); break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        event.stopPropagation();
        selectDate(date);
        return;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
    moveDate(nextDate);
  };

  const previousMonthUnavailable = Boolean(minimum && endOfMonth(addMonths(visibleMonth, -1)) < minimum);
  const nextMonthUnavailable = Boolean(maximum && startOfMonth(addMonths(visibleMonth, 1)) > maximum);
  const navigationClass = 'flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-25 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white';

  return (
    <div className={`min-w-0 space-y-1.5 ${className}`}>
      <label id={labelId} htmlFor={triggerId} className="block text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
      </label>
      <Popover.Root open={isOpen} onOpenChange={changeOpen}>
        <Popover.Trigger asChild>
          <button
            type="button" id={triggerId} aria-labelledby={labelId} aria-describedby={valueId}
            disabled={disabled || invalidRange}
            onClick={event => event.stopPropagation()}
            onKeyDown={event => event.stopPropagation()}
            className="flex h-10 w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-700 shadow-sm transition-colors hover:border-rose-200 hover:bg-rose-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:border-rose-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-rose-800 dark:hover:bg-slate-700/60 dark:focus-visible:ring-offset-slate-900"
          >
            <span id={valueId} className={`truncate tabular-nums ${selectedDate ? '' : 'text-slate-500 dark:text-slate-400'}`}>
              {selectedDate ? format(selectedDate, 'yyyy.MM.dd (EEE)', { locale: ko }) : placeholder}
            </span>
            <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-rose-400 dark:text-rose-300" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start" sideOffset={6} collisionPadding={12}
            aria-label={`${label} 달력`} aria-describedby={helpId}
            onOpenAutoFocus={event => {
              event.preventDefault();
              dayButtons.current.get(activeKey)?.focus();
            }}
            onEscapeKeyDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
            onMouseDown={event => event.stopPropagation()}
            onKeyDown={event => event.stopPropagation()}
            className="ui-popover z-80 max-h-(--radix-popover-content-available-height) w-72 max-w-[calc(100vw-24px)] origin-(--radix-popover-content-transform-origin) overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xl shadow-slate-900/10 outline-none dark:border-slate-700 dark:bg-slate-800 dark:shadow-black/30"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <button type="button" aria-label="이전 달" disabled={previousMonthUnavailable} className={navigationClass}
                onClick={() => moveDate(addMonths(focusDate, -1), false)}>
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              </button>
              <h3 id={titleId} aria-live="polite" className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                {format(visibleMonth, 'yyyy년 M월', { locale: ko })}
              </h3>
              <button type="button" aria-label="다음 달" disabled={nextMonthUnavailable} className={navigationClass}
                onClick={() => moveDate(addMonths(focusDate, 1), false)}>
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <div role="grid" aria-labelledby={titleId}>
              <div role="row" className="mb-1 grid grid-cols-7">
                {WEEKDAYS.map(day => (
                  <span key={day} role="columnheader" className="py-1 text-center text-[11px] font-medium text-slate-500 dark:text-slate-400">{day}</span>
                ))}
              </div>
              {Array.from({ length: 6 }, (_, week) => (
                <div key={week} role="row" className="grid grid-cols-7 gap-y-0.5">
                  {days.slice(week * 7, week * 7 + 7).map(day => {
                    const key = dateKey(day);
                    const selected = selectedDate !== null && isSameDay(day, selectedDate);
                    const current = isSameDay(day, today);
                    const inMonth = isSameMonth(day, visibleMonth);
                    const allowed = isAllowed(day);
                    return (
                      <div key={key} role="gridcell" aria-selected={selected}>
                        <button
                          type="button" disabled={!allowed} tabIndex={key === activeKey ? 0 : -1}
                          ref={element => {
                            if (element) dayButtons.current.set(key, element);
                            else dayButtons.current.delete(key);
                          }}
                          aria-label={format(day, 'yyyy년 M월 d일 EEEE', { locale: ko })}
                          aria-current={current ? 'date' : undefined}
                          onClick={() => selectDate(day)}
                          onKeyDown={event => handleDayKeyDown(event, day)}
                          className={`relative flex h-9 w-full items-center justify-center rounded-lg text-xs tabular-nums transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-25 dark:focus-visible:ring-offset-slate-800 ${selected
                            ? 'bg-rose-600 font-semibold text-white shadow-sm shadow-rose-500/20 hover:bg-rose-700'
                            : current
                              ? 'bg-rose-50 font-semibold text-rose-600 ring-1 ring-inset ring-rose-200 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900 dark:hover:bg-rose-900/40'
                              : inMonth
                                ? 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700'
                                : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700/50'}`}
                        >
                          {format(day, 'd')}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-700">
              <button type="button" disabled={!isAllowed(today)} onClick={() => selectDate(today)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-30 dark:text-rose-300 dark:hover:bg-rose-950/40">
                오늘
              </button>
              <button type="button" disabled={!value} onClick={() => { onChange(''); setOpen(false); }}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200">
                지우기
              </button>
            </div>
            <p id={helpId} className="sr-only">방향키로 날짜 이동, Home과 End로 주의 시작과 끝, Page Up과 Page Down으로 월 이동, Enter로 선택, Escape로 닫기</p>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
