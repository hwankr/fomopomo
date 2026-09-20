'use client';

import { useState, useEffect } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getKoreanHolidays } from '@/actions/holidays';

interface CalendarProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}

export default function Calendar({ selectedDate, onSelectDate }: CalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [holidayDates, setHolidayDates] = useState<number[]>([]);

  useEffect(() => {
    const fetchHolidays = async () => {
      const year = currentMonth.getFullYear();
      const dates = await getKoreanHolidays(year.toString());
      setHolidayDates(dates);
    };
    fetchHolidays();
  }, [currentMonth]);

  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const days = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const weekDays = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 aria-live="polite" className="text-lg font-bold text-gray-900 dark:text-white">
          {format(currentMonth, 'yyyy년 M월', { locale: ko })}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const today = new Date();
              setCurrentMonth(today);
              onSelectDate(today);
            }}
            className="ui-press min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            오늘
          </button>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label="이전 달"
              onClick={prevMonth}
              className="ui-press rounded-lg p-2 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 dark:hover:bg-slate-700"
            >
              <ChevronLeft className="w-5 h-5 text-gray-500" />
            </button>
            <button
              type="button"
              aria-label="다음 달"
              onClick={nextMonth}
              className="ui-press rounded-lg p-2 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 dark:hover:bg-slate-700"
            >
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-2">
        {weekDays.map((day, i) => (
          <div
            key={`${day}-${i}`}
            className="text-center text-xs font-medium text-gray-400 py-2"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const isSelected = isSameDay(day, selectedDate);
          const isCurrentMonth = isSameMonth(day, monthStart);
          const isDayToday = isToday(day);

          return (
            <button
              key={day.toString()}
              type="button"
              aria-label={format(day, 'yyyy년 M월 d일 EEEE', { locale: ko })}
              aria-pressed={isSelected}
              aria-current={isDayToday ? 'date' : undefined}
              onClick={() => onSelectDate(day)}
              className={cn(
                'ui-press aspect-square rounded-xl flex flex-col items-center justify-center relative transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800',
                !isCurrentMonth && 'text-gray-300 dark:text-gray-600',
                isCurrentMonth && 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50',
                // Weekend colors
                ((day.getDay() === 0 || holidayDates.includes(parseInt(format(day, 'yyyyMMdd')))) && isCurrentMonth && !isSelected) && 'bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-200',
                (day.getDay() === 6 && isCurrentMonth && !isSelected) && 'bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-200',
                isSelected && 'bg-rose-500 text-white hover:bg-rose-600 dark:bg-rose-500 dark:text-white dark:hover:bg-rose-400',
                isDayToday && !isSelected && 'ring-1 ring-inset ring-rose-300 font-semibold dark:ring-rose-500/60'
              )}
            >
              <span className="text-sm">{format(day, 'd')}</span>
              {/* Dot indicator for tasks (placeholder logic) */}
              {isDayToday && (
                <span className={cn(
                  "absolute bottom-2 w-1 h-1 rounded-full",
                  isSelected ? "bg-white" : "bg-rose-500"
                )} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
