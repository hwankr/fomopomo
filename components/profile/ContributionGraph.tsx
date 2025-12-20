import { useMemo } from 'react';
import {
  format,
  eachDayOfInterval,
  endOfYear,
  startOfYear,
  getDay,
  subDays,
  isSameDay,
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
  // Generate last 365 days (approx 53 weeks)
  const days = useMemo(() => {
    const end = endDate;
    const start = subDays(end, 364); // Show last year roughly
    // Align start to Sunday/Monday? 
    // GitHub starts week on Sunday usually, or aligns so the graph looks nice.
    // Let's just generate the interval.
    
    // To generate a perfect grid, usually we want to start from a specific day of week?
    // Let's just create 53 weeks.
    
    // Adjust start to be a Sunday to make columns align nicely?
    // If we use grid-rows-7, we expect data[0] to be Sunday...
    
    const startAligned = startOfWeek(start, { weekStartsOn: 0 }); // Sunday start
    
    return eachDayOfInterval({ start: startAligned, end });
  }, [endDate]);

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
    <div className="w-full overflow-x-auto pb-4 scrollbar-hide">
        <div className="flex flex-col gap-2 min-w-max">
            {/* Months Label Row (optional/complex to align) */}
            
            <div className="grid grid-rows-7 grid-flow-col gap-1">
                {days.map(day => {
                    const dateKey = format(day, 'yyyy-MM-dd');
                    const value = dataMap[dateKey] || 0;
                    const level = intensity(value);
                    
                    return (
                        <div
                            key={dateKey}
                            className={`w-3 h-3 rounded-sm ${getColor(level)} transition-colors hover:ring-2 hover:ring-rose-400/50 relative group cursor-pointer`}
                            title={`${format(day, 'yyyy-MM-dd')}: ${Math.floor(value/60)}분`}
                        >
                             {/* Simple Tooltip on Hover */}
                             <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap z-10 pointer-events-none">
                                {format(day, 'M월 d일')}: {Math.floor(value / 3600)}시간 {Math.floor((value % 3600) / 60)}분
                             </div>
                        </div>
                    );
                })}
            </div>
            
             <div className="flex items-center gap-2 text-xs text-gray-400 mt-2 justify-end">
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
