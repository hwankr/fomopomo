'use client';

import { useEffect, useState, useRef } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from 'recharts';
import {
  startOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  addDays,
  format,
  subMonths,
  addMonths,
  isAfter,
  isSameMonth,
  isSameWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useStudyStats, ChartData, ViewMode } from '@/hooks/useStudyStats';

export default function StudyReport() {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [activeYear, setActiveYear] = useState(new Date().getFullYear());
  const [activeMonth, setActiveMonth] = useState(new Date());
  const [activeWeekStart, setActiveWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedBucket, setSelectedBucket] = useState<ChartData | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);


  const {
    loading,
    totalFocusTime,
    todayFocusTime,
    earliestYear,
    chartData,
    fetchStats
  } = useStudyStats();

  // Auto-scroll to end when chart data or view mode changes
  useEffect(() => {
    if (scrollRef.current) {
        setTimeout(() => {
            if (scrollRef.current) {
               scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
            }
        }, 100);
    }
  }, [chartData, viewMode]);

  const currentYear = new Date().getFullYear();
  const today = new Date();

  // Navigation functions
  const goToPrevMonth = () => setActiveMonth(prev => subMonths(prev, 1));
  const goToNextMonth = () => {
    const next = addMonths(activeMonth, 1);
    if (!isAfter(startOfMonth(next), startOfMonth(today))) {
      setActiveMonth(next);
    }
  };
  const goToPrevWeek = () => setActiveWeekStart(prev => addDays(prev, -7));
  const goToNextWeek = () => {
    const next = addDays(activeWeekStart, 7);
    if (!isAfter(next, startOfWeek(today, { weekStartsOn: 1 }))) {
      setActiveWeekStart(next);
    }
  };

  const canGoNextMonth = !isSameMonth(activeMonth, today);
  const canGoNextWeek = !isSameWeek(activeWeekStart, today, { weekStartsOn: 1 });

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const formatTooltipDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const formatAxisValue = (hours: number) => {
    if (hours < 1) {
      return `${Math.round(hours * 60)}m`;
    }
    return `${hours}h`;
  };

  // Fetch data when view mode or active date changes
  useEffect(() => {
    setTimeout(() => {
        let activeDate: Date;
        if (viewMode === 'week') {
            activeDate = activeWeekStart;
        } else if (viewMode === 'month') {
            activeDate = activeMonth;
        } else {
            activeDate = new Date(activeYear, 0, 1);
        }
        
        fetchStats(viewMode, activeDate);
    }, 0);
  }, [viewMode, activeYear, activeMonth, activeWeekStart, fetchStats]);

  // Set selected bucket when data changes
  useEffect(() => {
    if (chartData.length > 0) {
      const referenceDate =
        viewMode === 'year'
          ? new Date(activeYear, today.getMonth(), today.getDate())
          : today;
      const todayKey =
        viewMode === 'year'
          ? format(referenceDate, 'yyyy-MM')
          : format(referenceDate, 'yyyy-MM-dd');
      
      const preferredBucket =
        chartData.find((bucket) => bucket.bucketKey === todayKey) ??
        chartData[chartData.length - 1] ??
        null;
        
      setSelectedBucket(preferredBucket);
    }
  }, [chartData, viewMode, activeYear]); // eslint-disable-next-line react-hooks/exhaustive-deps


  const tabBase = 'px-4 py-1.5 text-xs font-bold rounded-md transition-all';
  const tabActive =
    'bg-white dark:bg-slate-600 text-gray-800 dark:text-white shadow-sm border border-gray-200 dark:border-slate-500';
  const tabInactive =
    'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700';

  return (
    <div className="animate-fade-in w-full">
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-gray-50 dark:bg-slate-700/50 p-5 rounded-2xl border border-gray-100 dark:border-slate-600">
              <div className="text-gray-400 text-xs uppercase font-bold tracking-wider mb-2">
                Total Hours
              </div>
              <div className="text-3xl font-mono font-bold text-gray-800 dark:text-white">
                {Math.floor(totalFocusTime / 3600)}
                <span className="text-lg text-gray-400 ml-1">h</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">총 누적 시간</div>
            </div>
            <div className="bg-gray-50 dark:bg-slate-700/50 p-5 rounded-2xl border border-gray-100 dark:border-slate-600">
              <div className="text-gray-400 text-xs uppercase font-bold tracking-wider mb-2">
                Today
              </div>
              <div className="text-3xl font-mono font-bold text-rose-500 dark:text-rose-400">
                {formatDuration(todayFocusTime)}
              </div>
              <div className="text-xs text-gray-500 mt-1">오늘 집중 시간</div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-700/30 p-0 sm:p-6 rounded-2xl sm:border border-gray-100 dark:border-slate-600">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <h3 className="text-sm font-bold text-gray-600 dark:text-gray-300 flex items-center gap-2">
                집중 통계
              </h3>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="bg-gray-100 dark:bg-slate-800 p-1 rounded-lg flex">
                  <button
                    onClick={() => setViewMode('week')}
                    className={`${tabBase} ${viewMode === 'week' ? tabActive : tabInactive
                      }`}
                  >
                    Week
                  </button>
                  <button
                    onClick={() => setViewMode('month')}
                    className={`${tabBase} ${viewMode === 'month' ? tabActive : tabInactive
                      }`}
                  >
                    Month
                  </button>
                  <button
                    onClick={() => setViewMode('year')}
                    className={`${tabBase} ${viewMode === 'year' ? tabActive : tabInactive
                      }`}
                  >
                    Year
                  </button>
                </div>
                {viewMode === 'year' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveYear(prev => prev - 1)}
                      disabled={earliestYear !== null && activeYear <= earliestYear}
                      className={`p-1.5 rounded-lg transition-colors ${
                        earliestYear !== null && activeYear <= earliestYear
                          ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                          : 'hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400'
                      }`}
                      aria-label="이전 년도"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      onClick={() => setActiveYear(currentYear)}
                      className="text-sm font-semibold text-gray-700 dark:text-gray-200 min-w-[60px] text-center hover:text-rose-500 dark:hover:text-rose-400 transition-colors cursor-pointer"
                      title="올해로 이동"
                    >
                      {activeYear}년
                    </button>
                    <button
                      onClick={() => setActiveYear(prev => prev + 1)}
                      disabled={activeYear >= currentYear}
                      className={`p-1.5 rounded-lg transition-colors ${
                        activeYear >= currentYear
                          ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                          : 'hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400'
                      }`}
                      aria-label="다음 년도"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                )}
                {viewMode === 'month' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={goToPrevMonth}
                      className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 transition-colors"
                      aria-label="이전 달"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      onClick={() => setActiveMonth(new Date())}
                      className="text-sm font-semibold text-gray-700 dark:text-gray-200 min-w-[100px] text-center hover:text-rose-500 dark:hover:text-rose-400 transition-colors cursor-pointer"
                      title="이번 달로 이동"
                    >
                      {format(activeMonth, 'yyyy년 M월')}
                    </button>
                    <button
                      onClick={goToNextMonth}
                      disabled={!canGoNextMonth}
                      className={`p-1.5 rounded-lg transition-colors ${
                        canGoNextMonth
                          ? 'hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400'
                          : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      }`}
                      aria-label="다음 달"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                )}
                {viewMode === 'week' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={goToPrevWeek}
                      className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 transition-colors"
                      aria-label="이전 주"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      onClick={() => setActiveWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                      className="text-sm font-semibold text-gray-700 dark:text-gray-200 min-w-[120px] text-center hover:text-rose-500 dark:hover:text-rose-400 transition-colors cursor-pointer"
                      title="이번 주로 이동"
                    >
                      {format(activeWeekStart, 'M/d')} - {format(addDays(activeWeekStart, 6), 'M/d')}
                    </button>
                    <button
                      onClick={goToNextWeek}
                      disabled={!canGoNextWeek}
                      className={`p-1.5 rounded-lg transition-colors ${
                        canGoNextWeek
                          ? 'hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400'
                          : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      }`}
                      aria-label="다음 주"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div ref={scrollRef} className="w-full overflow-x-auto pb-4 scrollbar-hide">
                <div className="h-64 min-w-[600px] relative">
                  {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-800/50 z-10 transition-opacity duration-300">
                      <div className="text-gray-400 animate-pulse text-sm">
                        Loading data...
                      </div>
                    </div>
                  ) : null}

                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#e5e7eb"
                        className="dark:stroke-slate-600"
                      />
                      <XAxis
                        dataKey="displayLabel"
                        stroke="#9ca3af"
                        fontSize={viewMode === 'month' ? 9 : 11}
                        tickLine={false}
                        axisLine={false}
                        dy={10}
                        interval={0}
                      />
                      <YAxis
                        stroke="#9ca3af"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => formatAxisValue(value)}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderColor: '#e5e7eb',
                          color: '#111827',
                          borderRadius: '8px',
                          fontSize: '12px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.12)',
                        }}
                        labelStyle={{ color: '#111827', fontWeight: 700 }}
                        labelFormatter={(label) => `${label}`}
                        formatter={(_, __, props) => [
                          formatTooltipDuration(props?.payload?.seconds ?? 0),
                          '집중 시간',
                        ]}
                      />
                      <Bar
                        dataKey="hours"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={50}
                        onClick={(data) => {
                          if (data && 'payload' in data) {
                            setSelectedBucket(data.payload as ChartData);
                          }
                        }}
                      >
                        {chartData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            className={
                              entry.hours > 0
                                ? 'fill-rose-400 dark:fill-rose-500'
                                : 'fill-gray-100 dark:fill-slate-700'
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
            </div>

            <div className="text-center mt-4 text-xs text-gray-400">
              {viewMode === 'week' &&
                `${format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'M/dd')} - ${format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 6), 'M/dd')} (월~일)`}
              {viewMode === 'month' &&
                `${format(startOfMonth(new Date()), 'yyyy.MM')} (1일~${endOfMonth(new Date()).getDate()}일)`}
              {viewMode === 'year' &&
                `${format(startOfYear(new Date(activeYear, 0, 1)), 'yyyy')}년 (1월~12월)`}
            </div>

            <div className="mt-4 bg-gray-50 dark:bg-slate-800/60 rounded-xl p-4 border border-gray-100 dark:border-slate-700">
              <div className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">
                {selectedBucket
                  ? selectedBucket.breakdownLabel
                  : '작업별 집중 시간'}
              </div>
              {selectedBucket && Object.keys(selectedBucket.taskTotals).length > 0 ? (
                <div className="flex flex-wrap gap-2 text-xs">
                  {Object.entries(selectedBucket.taskTotals)
                    .sort((a, b) => b[1] - a[1])
                    .map(([task, secs]) => (
                      <span
                        key={task}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-slate-600"
                      >
                        {`${task}: ${formatDuration(secs)}`}
                      </span>
                    ))}
                </div>
              ) : (
                <div className="text-gray-400 text-xs">데이터가 없습니다.</div>
              )}
            </div>
          </div>
    </div>
  );
}
