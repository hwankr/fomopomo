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

  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const today = new Date();
              setCurrentMonth(today);
              onSelectDate(today);
            }}
            className="text-xs font-medium px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
          >
            Today
          </button>
          <div className="flex gap-1">
            <button
              onClick={prevMonth}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-500" />
            </button>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
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
              onClick={() => onSelectDate(day)}
              className={cn(
                'aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all duration-200',
                !isCurrentMonth && 'text-gray-300 dark:text-gray-600',
                isCurrentMonth && 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50',
                // Weekend colors
                ((day.getDay() === 0 || holidayDates.includes(parseInt(format(day, 'yyyyMMdd')))) && isCurrentMonth && !isSelected) && 'bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-300',
                (day.getDay() === 6 && isCurrentMonth && !isSelected) && 'bg-blue-50 dark:bg-blue-900/10 text-blue-700 dark:text-blue-300',
                isSelected && 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 shadow-md scale-105 z-10',
                isDayToday && !isSelected && 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400 font-bold'
              )}
            >
              <span className="text-sm">{format(day, 'd')}</span>
              {/* Dot indicator for tasks (placeholder logic) */}
              {isDayToday && (
                <span className={cn(
                  "absolute bottom-2 w-1 h-1 rounded-full",
                  isSelected ? "bg-white dark:bg-gray-900" : "bg-rose-500"
                )} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
