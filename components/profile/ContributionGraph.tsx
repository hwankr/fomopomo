import { useMemo, useState, useEffect, useRef } from 'react';
import {
  format,
  eachDayOfInterval,
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
}

export default function ContributionGraph({ data, endDate = new Date() }: ContributionGraphProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedData, setSelectedData] = useState<{ date: Date; minutes: number } | null>(null);
  
  // Always show 365 days regardless of screen size
  const daysToShow = 365;

  // Generate days based on daysToShow
  const days = useMemo(() => {
    const end = endOfYear(endDate); // Extend to end of year (Dec 31)
    const start = subDays(end, daysToShow); 
    
    // Create interval
    // We don't force startOfWeek here to allow just sliding window, 
    // but aligning to week start (Sunday) is usually better for grid alignment.
    // Let's align start to Sunday so the first column is complete or consistent.
    const startAligned = startOfWeek(start, { weekStartsOn: 0 });
    
    return eachDayOfInterval({ start: startAligned, end });
  }, [endDate, daysToShow]);

  // Auto-scroll to end when days change or on mount
  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [days, daysToShow]);

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
      switch(level) {
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
          map[d.date] = d.count;
      });
      return map;
  }, [data]);

  return (
    <div className="flex flex-col w-full">
        <div className="flex gap-2 w-full">
            {/* Day Labels Column */}
            <div className="flex flex-col gap-1 pt-[1.25rem] shrink-0">
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
                <div className="flex flex-col gap-2 min-w-max">
                    {/* Month Labels Row */}
                    <div className="grid grid-rows-1 grid-flow-col gap-1 mb-1">
                        {Array.from({ length: Math.ceil(days.length / 7) }).map((_, weekIndex) => {
                            const day = days[weekIndex * 7];
                            // Skip if day is undefined (safety check)
                            if (!day) return <div key={weekIndex} className="w-3" />;

                            // Logic: Show label if it's the first week of the dataset OR if month changed from previous week
                            const prevWeekDay = days[(weekIndex - 1) * 7];
                            const isNewMonth = !prevWeekDay || !isSameMonth(day, prevWeekDay);

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
                            const isRightEdge = currentColumn >= totalColumns - 3; // Align right for last 3 columns

                            return (
                                <div
                                    key={dateKey}
                                    className={`w-3 h-3 rounded-sm ${getColor(level)} transition-colors hover:ring-2 hover:ring-rose-400/50 relative group cursor-pointer`}
                                    title={`${format(day, 'yyyy-MM-dd')}: ${Math.floor(value/60)}분`}
                                    onClick={() => setSelectedData({ date: day, minutes: Math.floor(value / 60) })}
                                >
                                    {/* Simple Tooltip on Hover */}
                                    <div 
                                        className={`hidden md:group-hover:block absolute bottom-full mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap z-10 pointer-events-none ${
                                            isRightEdge ? 'right-0' : 'left-1/2 -translate-x-1/2'
                                        }`}
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
        <div className="mt-2 h-4 text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center justify-between">
                {selectedData ? (
                    <span>
                        {format(selectedData.date, 'M월 d일')}: {Math.floor(selectedData.minutes / 60)}시간 {selectedData.minutes % 60}분
                    </span>
                ) : (
                    <span className="text-gray-400 dark:text-gray-600 font-normal">날짜를 클릭하여 상세 정보를 확인하세요</span>
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
