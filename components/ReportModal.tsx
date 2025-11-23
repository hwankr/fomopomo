'use client';

import { useEffect, useState } from 'react';
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
  endOfWeek,
  eachDayOfInterval,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  eachMonthOfInterval,
  format,
  isSameDay,
  isSameMonth,
} from 'date-fns';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ReportModal({ isOpen, onClose }: ReportModalProps) {
  const [chartData, setChartData] = useState<any[]>([]);
  const [totalFocusTime, setTotalFocusTime] = useState(0);
  const [todayFocusTime, setTodayFocusTime] = useState(0);
  const [loading, setLoading] = useState(true);

  // ✨ 뷰 모드 상태 추가 (week | month | year)
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'year'>('week');

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const fetchReportData = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const today = new Date();
    let start, end;

    // ✨ 1. 뷰 모드에 따라 날짜 범위 설정
    if (viewMode === 'week') {
      start = startOfWeek(today, { weekStartsOn: 1 }); // 월요일 시작
      end = endOfWeek(today, { weekStartsOn: 1 });
    } else if (viewMode === 'month') {
      start = startOfMonth(today);
      end = endOfMonth(today);
    } else {
      start = startOfYear(today);
      end = endOfYear(today);
    }

    // 2. 해당 범위의 데이터 가져오기
    const { data: periodSessions } = await supabase
      .from('study_sessions')
      .select('duration, created_at')
      .eq('user_id', user.id)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    // 3. 전체 누적 시간 (Total Hours용 - 범위 상관없이 전체)
    const { data: allSessions } = await supabase
      .from('study_sessions')
      .select('duration')
      .eq('user_id', user.id);

    // --- 데이터 가공 ---

    // A. 총 누적 시간
    const totalSeconds =
      allSessions?.reduce((acc, curr) => acc + curr.duration, 0) || 0;
    setTotalFocusTime(totalSeconds);

    // B. 오늘 시간 (항상 표시)
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

    // ✨ C. 그래프 데이터 만들기 (모드별 분기)
    let newChartData = [];

    if (viewMode === 'year') {
      // [연간 뷰] 월별 데이터 (Jan ~ Dec)
      const months = eachMonthOfInterval({ start, end });
      newChartData = months.map((month) => {
        const monthSeconds =
          periodSessions
            ?.filter((s) => isSameMonth(new Date(s.created_at), month))
            .reduce((acc, curr) => acc + curr.duration, 0) || 0;

        return {
          name: format(month, 'MMM'), // Jan, Feb...
          hours: parseFloat((monthSeconds / 3600).toFixed(1)),
        };
      });
    } else {
      // [주간/월간 뷰] 일별 데이터
      const days = eachDayOfInterval({ start, end });
      newChartData = days.map((day) => {
        const daySeconds =
          periodSessions
            ?.filter((s) => isSameDay(new Date(s.created_at), day))
            .reduce((acc, curr) => acc + curr.duration, 0) || 0;

        return {
          name: viewMode === 'week' ? format(day, 'EEE') : format(day, 'd'), // Mon or 1, 2, 3...
          hours: parseFloat((daySeconds / 3600).toFixed(1)),
        };
      });
    }

    setChartData(newChartData);
    setLoading(false);
  };

  // 뷰 모드가 바뀌거나 창이 열릴 때 데이터 다시 가져오기
  useEffect(() => {
    if (isOpen) {
      fetchReportData();
    }
  }, [isOpen, viewMode]);

  if (!isOpen) return null;

  // 탭 버튼 스타일
  const tabBase = 'px-4 py-1.5 text-xs font-bold rounded-md transition-all';
  const tabActive =
    'bg-white dark:bg-slate-600 text-gray-800 dark:text-white shadow-sm border border-gray-200 dark:border-slate-500';
  const tabInactive =
    'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in p-4">
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors duration-300">
        {/* 헤더 */}
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
          {/* 1. 요약 카드 섹션 */}
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

          {/* 2. 그래프 섹션 */}
          <div className="bg-white dark:bg-slate-700/30 p-0 sm:p-6 rounded-2xl sm:border border-gray-100 dark:border-slate-600">
            {/* ✨ 그래프 헤더 (탭 버튼) */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <h3 className="text-sm font-bold text-gray-600 dark:text-gray-300 flex items-center gap-2">
                📊 집중 통계
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

            {/* 그래프 영역 */}
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
                    dataKey="name"
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
                    tickFormatter={(value) => `${value}h`}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      borderColor: '#374151',
                      color: '#fff',
                      borderRadius: '8px',
                      fontSize: '12px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    }}
                    formatter={(value: number) => [`${value}시간`, '집중']}
                  />
                  <Bar dataKey="hours" radius={[4, 4, 0, 0]} maxBarSize={50}>
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

            {/* 안내 문구 */}
            <div className="text-center mt-4 text-xs text-gray-400">
              {viewMode === 'week' && '이번 주 (월 ~ 일)'}
              {viewMode === 'month' && '이번 달 (1일 ~ 말일)'}
              {viewMode === 'year' && '올해 (1월 ~ 12월)'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
