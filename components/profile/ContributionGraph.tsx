import { useMemo, useState, useEffect, useRef } from 'react';
import {
  format,
  eachDayOfInterval,
  endOfDay,
  endOfYear,
  startOfYear,
  getDay,
  subDays,
  isSameDay,
  isSameMonth,
  startOfWeek,
  endOfWeek
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { Tooltip } from 'recharts'; // reusing rechart tooltip style logic if needed, or custom

interface ContributionGraphProps {
  data: { date: string; count: number }[];
  endDate?: Date;
  year?: number;
}

export default function ContributionGraph({
  data,
  endDate,
  year,
}: ContributionGraphProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedData, setSelectedData] = useState<{ date: Date; minutes: number } | null>(null);
  const resolvedEndDate = useMemo(() => endDate ?? new Date(), [endDate]);

  // Rolling view shows the last 365 days regardless of screen size.
  const daysToShow = 365;

  // Generate days based on daysToShow
  const days = useMemo(() => {
    if (typeof year === 'number') {
      const yearStart = startOfYear(new Date(year, 0, 1));
      const yearEnd = endOfYear(yearStart);
      const startAligned = startOfWeek(yearStart, { weekStartsOn: 0 });
      return eachDayOfInterval({ start: startAligned, end: yearEnd });
    }

    // Anchor the range to the selected end date (e.g., today), not year-end.
    const end = endOfDay(resolvedEndDate);
    const start = subDays(end, daysToShow - 1);

    // Create interval
    // We don't force startOfWeek here to allow just sliding window, 
    // but aligning to week start (Sunday) is usually better for grid alignment.
    // Let's align start to Sunday so the first column is complete or consistent.
    const startAligned = startOfWeek(start, { weekStartsOn: 0 });

    return eachDayOfInterval({ start: startAligned, end });
  }, [year, resolvedEndDate, daysToShow]);

  const focusDate = useMemo(() => {
    if (typeof year === 'number') {
      const now = new Date();
      if (year === now.getFullYear()) return now;
      return new Date(year, 0, 1);
    }

    return resolvedEndDate;
  }, [year, resolvedEndDate]);

  useEffect(() => {
    setSelectedData(null);
  }, [year]);

  // Auto-scroll to end when days change or on mount
  useEffect(() => {
    if (!scrollRef.current) return;

    const targetKey = format(focusDate, 'yyyy-MM-dd');
    const target = scrollRef.current.querySelector(
      `[data-date="${targetKey}"]`
    ) as HTMLElement | null;

    if (target) {
      target.scrollIntoView({ block: 'nearest', inline: 'end' });
      return;
    }

    scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [days, focusDate]);

  const intensity = (seconds: number) => {
    const hours = seconds / 3600;
    if (hours === 0) return 0;
    if (hours < 1) return 1;
    if (hours < 3) return 2;
    if (hours < 5) return 3;
    return 4;
  };

  const getColor = (level: number) => {
    // GitHub green logic or custom theme?
    // User uses Rose theme.
    switch (level) {
      case 0: return 'bg-gray-100 dark:bg-slate-700';
      case 1: return 'bg-rose-200 dark:bg-rose-900/40';
      case 2: return 'bg-rose-300 dark:bg-rose-800/60';
      case 3: return 'bg-rose-400 dark:bg-rose-600/80';
      case 4: return 'bg-rose-500 dark:bg-rose-500';
      default: return 'bg-gray-100 dark:bg-slate-700';
    }
  };

  const dataMap = useMemo(() => {
    const map: Record<string, number> = {};
    data.forEach(d => {
      if (typeof year === 'number') {
        const dataYear = Number(d.date.slice(0, 4));
        if (dataYear !== year) return;
      }
      map[d.date] = d.count;
    });
    return map;
  }, [data, year]);

  return (
    <div className="flex flex-col w-full">
      <div className="flex gap-2 w-full">
        {/* Day Labels Column */}
        <div className="flex flex-col gap-1 pt-7 shrink-0">
          <span className="h-3 text-[10px] text-transparent leading-3">일</span>
          <span className="h-3 text-[10px] text-gray-300 dark:text-gray-600 leading-3">월</span>
          <span className="h-3 text-[10px] text-transparent leading-3">화</span>
          <span className="h-3 text-[10px] text-gray-300 dark:text-gray-600 leading-3">수</span>
          <span className="h-3 text-[10px] text-transparent leading-3">목</span>
          <span className="h-3 text-[10px] text-gray-300 dark:text-gray-600 leading-3">금</span>
          <span className="h-3 text-[10px] text-transparent leading-3">토</span>
        </div>

        {/* Scrollable Graph Area */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto pb-2 scrollbar-hide">
          <div className="flex flex-col gap-2 min-w-max px-1">
            {/* Month Labels Row */}
            <div className="grid grid-rows-1 grid-flow-col gap-1 mb-1">
              {Array.from({ length: Math.ceil(days.length / 7) }).map((_, weekIndex) => {
                const day = days[weekIndex * 7];
                // Skip if day is undefined (safety check)
                if (!day) return <div key={weekIndex} className="w-3" />;

                // Logic: Show label if month changed from previous week (skip first week to avoid overlap)
                const prevWeekDay = days[(weekIndex - 1) * 7];
                const isNewMonth = prevWeekDay && !isSameMonth(day, prevWeekDay);

                return (
                  <div key={weekIndex} className="w-3 text-xs text-gray-400 dark:text-gray-500 relative h-4">
                    {isNewMonth && (
                      <span className="absolute left-0 top-0 whitespace-nowrap">
                        {format(day, 'M월')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid grid-rows-7 grid-flow-col gap-1">
              {days.map((day, index) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const value = dataMap[dateKey] || 0;
                const level = intensity(value);

                // Tooltip positioning logic
                const totalColumns = Math.ceil(days.length / 7);
                const currentColumn = Math.floor(index / 7);
                const isLeftEdge = currentColumn < 3; // Align left for first 3 columns
                const isRightEdge = currentColumn >= totalColumns - 3; // Align right for last 3 columns

                const isSelected = selectedData && isSameDay(day, selectedData.date);
                const isToday = isSameDay(day, new Date());

                // Determine tooltip position class
                let tooltipPositionClass = 'left-1/2 -translate-x-1/2'; // default: center
                if (isLeftEdge) {
                  tooltipPositionClass = 'left-0'; // align left edge
                } else if (isRightEdge) {
                  tooltipPositionClass = 'right-0'; // align right edge
                }

                return (
                  <div
                    key={dateKey}
                    data-date={dateKey}
                    className={`w-3 h-3 rounded-sm ${getColor(level)} transition-all relative group cursor-pointer
                                        ${isSelected ? 'ring-2 ring-gray-800 dark:ring-white z-10' : ''}
                                        ${isToday && !isSelected ? 'ring-1 ring-rose-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-900' : ''}
                                        ${!isSelected && !isToday ? 'hover:ring-2 hover:ring-rose-400/50' : ''}
                                    `}
                    title={`${format(day, 'yyyy-MM-dd')}: ${Math.floor(value / 60)}분`}
                    onClick={() => setSelectedData({ date: day, minutes: Math.floor(value / 60) })}
                  >
                    {/* Tooltip: hover on PC, click/touch on mobile */}
                    <div
                      className={`absolute bottom-full mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap z-20 pointer-events-none ${tooltipPositionClass}
                        ${isSelected ? 'block' : 'hidden md:group-hover:block'}
                      `}
                    >
                      {format(day, 'M월 d일')}: {Math.floor(value / 3600)}시간 {Math.floor((value % 3600) / 60)}분
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Selected Date Info (Mobile Friendly) - Moved outside scrollable area */}
      <div className="mt-3 py-2 px-3 rounded-lg bg-gray-50 dark:bg-slate-800/50 flex items-center justify-between">
        {selectedData ? (
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            📅 {format(selectedData.date, 'M월 d일')}: <span className="text-rose-500">{Math.floor(selectedData.minutes / 60)}시간 {selectedData.minutes % 60}분</span>
          </span>
        ) : (
          <span className="text-sm text-gray-500 dark:text-gray-400">📅 날짜를 클릭하여 상세 정보를 확인하세요</span>
        )}

        <div className="flex items-center gap-2">
          <span>적음</span>
          <div className={`w-3 h-3 rounded-sm ${getColor(0)}`}></div>
          <div className={`w-3 h-3 rounded-sm ${getColor(1)}`}></div>
          <div className={`w-3 h-3 rounded-sm ${getColor(2)}`}></div>
          <div className={`w-3 h-3 rounded-sm ${getColor(3)}`}></div>
          <div className={`w-3 h-3 rounded-sm ${getColor(4)}`}></div>
          <span>많음</span>
        </div>
      </div>
    </div>
  );
}
