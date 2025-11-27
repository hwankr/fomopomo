'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
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
} from 'date-fns';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ChartData = {
  name: string;
  hours: number;
  seconds: number;
  taskTotals: Record<string, number>;
  bucketKey: string;
  displayLabel: string;
  breakdownLabel: string;
};

export default function ReportModal({ isOpen, onClose }: ReportModalProps) {
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [totalFocusTime, setTotalFocusTime] = useState(0);
  const [todayFocusTime, setTodayFocusTime] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedBucket, setSelectedBucket] = useState<ChartData | null>(null);
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'year'>('week');

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

  const fetchReportData = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const today = new Date();
    let start: Date;
    let end: Date;

    if (viewMode === 'week') {
      start = startOfWeek(today, { weekStartsOn: 1 });
      end = addDays(start, 6); // Monday to Sunday
    } else if (viewMode === 'month') {
      start = startOfMonth(today);
      end = endOfMonth(today);
    } else {
      start = startOfYear(today);
      end = endOfYear(today);
    }

    const { data: periodSessions } = await supabase
      .from('study_sessions')
      .select('duration, created_at, task')
      .eq('user_id', user.id)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    const { data: allSessions } = await supabase
      .from('study_sessions')
      .select('duration')
      .eq('user_id', user.id);

    const totalSeconds =
      allSessions?.reduce((acc, curr) => acc + curr.duration, 0) || 0;
    setTotalFocusTime(totalSeconds);

    const todaySessions = await supabase
      .from('study_sessions')
      .select('duration')
      .eq('user_id', user.id)
      .gte(
        'created_at',
        new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
      )
      .lte(
        'created_at',
        new Date(new Date().setHours(23, 59, 59, 999)).toISOString()
      );

    const todaySeconds =
      todaySessions.data?.reduce((acc, curr) => acc + curr.duration, 0) || 0;
    setTodayFocusTime(todaySeconds);

    const buckets: Record<
      string,
      {
        label: string;
        seconds: number;
        taskTotals: Record<string, number>;
        breakdown: string;
      }
    > = {};

    if (viewMode === 'week') {
      const dayLabels = ['월', '화', '수', '목', '금', '토', '일'];
      const dayFull = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
      for (let i = 0; i < 7; i++) {
        const day = addDays(start, i);
        const key = format(day, 'yyyy-MM-dd');
        buckets[key] = {
          label: `${dayLabels[i]} (${format(day, 'M/d')})`,
          seconds: 0,
          taskTotals: {},
          breakdown: `${dayFull[i]} 작업별 집중 시간`,
        };
      }
    } else if (viewMode === 'month') {
      const daysInMonth = end.getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const day = new Date(start.getFullYear(), start.getMonth(), d);
        const key = format(day, 'yyyy-MM-dd');
        buckets[key] = {
          label: String(d),
          seconds: 0,
          taskTotals: {},
          breakdown: `${d}일의 작업별 집중 시간`,
        };
      }
    } else {
      for (let m = 0; m < 12; m++) {
        const monthDate = new Date(start.getFullYear(), m, 1);
        const key = format(monthDate, 'yyyy-MM');
        buckets[key] = {
          label: `${m + 1}`,
          seconds: 0,
          taskTotals: {},
          breakdown: `${m + 1}월의 작업별 집중 시간`,
        };
      }
    }

    periodSessions?.forEach((session) => {
      const sessionDate = new Date(session.created_at);
      let bucketKey = '';

      if (viewMode === 'week' || viewMode === 'month') {
        bucketKey = format(sessionDate, 'yyyy-MM-dd');
      } else {
        bucketKey = format(sessionDate, 'yyyy-MM');
      }

      if (!buckets[bucketKey]) return;

      const taskName = session.task?.trim() || '작업 지정 없음';
      buckets[bucketKey].seconds += session.duration;
      buckets[bucketKey].taskTotals[taskName] =
        (buckets[bucketKey].taskTotals[taskName] ?? 0) + session.duration;
    });

    const newChartData = Object.entries(buckets).map(
      ([bucketKey, bucket]) => ({
        name: bucket.label,
        hours: parseFloat((bucket.seconds / 3600).toFixed(1)),
        seconds: bucket.seconds,
        taskTotals: bucket.taskTotals,
        bucketKey,
        displayLabel: bucket.label,
        breakdownLabel:
          bucket.breakdown ?? `${bucket.label} 작업별 집중 시간`,
      })
    );

    const todayKey =
      viewMode === 'year'
        ? format(today, 'yyyy-MM')
        : format(today, 'yyyy-MM-dd');
    const preferredBucket =
      newChartData.find((bucket) => bucket.bucketKey === todayKey) ??
      newChartData[newChartData.length - 1] ??
      null;

    setChartData(newChartData);
    setSelectedBucket(preferredBucket);
    setLoading(false);
  }, [viewMode]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => fetchReportData(), 0);
    }
  }, [isOpen, fetchReportData]);

  if (!isOpen) return null;

  const tabBase = 'px-4 py-1.5 text-xs font-bold rounded-md transition-all';
  const tabActive =
    'bg-white dark:bg-slate-600 text-gray-800 dark:text-white shadow-sm border border-gray-200 dark:border-slate-500';
  const tabInactive =
    'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in p-4">
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors duration-300">
        <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <span className="bg-rose-100 text-rose-500 dark:bg-rose-900/30 dark:text-rose-400 p-2 rounded-xl">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                />
              </svg>
            </span>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">
              Report
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto scrollbar-hide">
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
              <div className="bg-gray-100 dark:bg-slate-800 p-1 rounded-lg flex">
                <button
                  onClick={() => setViewMode('week')}
                  className={`${tabBase} ${
                    viewMode === 'week' ? tabActive : tabInactive
                  }`}
                >
                  Week
                </button>
                <button
                  onClick={() => setViewMode('month')}
                  className={`${tabBase} ${
                    viewMode === 'month' ? tabActive : tabInactive
                  }`}
                >
                  Month
                </button>
                <button
                  onClick={() => setViewMode('year')}
                  className={`${tabBase} ${
                    viewMode === 'year' ? tabActive : tabInactive
                  }`}
                >
                  Year
                </button>
              </div>
            </div>

            <div className="h-64 w-full relative">
              {loading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-800/50 z-10">
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
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    dy={10}
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

            <div className="text-center mt-4 text-xs text-gray-400">
              {viewMode === 'week' &&
                `${format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'M/dd')} - ${format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 6), 'M/dd')} (월~일)`}
              {viewMode === 'month' &&
                `${format(startOfMonth(new Date()), 'yyyy.MM')} (1일~${endOfMonth(new Date()).getDate()}일)`}
              {viewMode === 'year' &&
                `${format(startOfYear(new Date()), 'yyyy')}년 (1월~12월)`}
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
      </div>
    </div>
  );
}
