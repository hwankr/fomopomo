import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  startOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  endOfDay,
  addDays,
  format,
} from 'date-fns';
import { getDayStart, getDayEnd } from '@/lib/dateUtils';

export type ViewMode = 'week' | 'month' | 'year';

export type ChartData = {
  name: string;
  hours: number;
  seconds: number;
  taskTotals: Record<string, number>;
  bucketKey: string;
  displayLabel: string;
  breakdownLabel: string;
};

export type HeatmapData = {
  date: string; // yyyy-MM-dd
  count: number; // seconds (or intensity level)
};

export function useStudyStats() {
  const [loading, setLoading] = useState(true);
  const [totalFocusTime, setTotalFocusTime] = useState(0);
  const [todayFocusTime, setTodayFocusTime] = useState(0);
  const [earliestYear, setEarliestYear] = useState<number | null>(null);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([]);

  const fetchStats = useCallback(
    async (
      viewMode: ViewMode,
      activeDate: Date, // Generic active date (could be week start, or month date, or year date)
      userId?: string
    ) => {
      setLoading(true);

      const targetUserId = userId || (await supabase.auth.getUser()).data.user?.id;
      if (!targetUserId) {
        setLoading(false);
        return;
      }

      // 1. Calculate Date Range based on ViewMode
      let start: Date;
      let end: Date;

      if (viewMode === 'week') {
        start = startOfWeek(activeDate, { weekStartsOn: 1 });
        end = endOfDay(addDays(start, 6));
      } else if (viewMode === 'month') {
        start = startOfMonth(activeDate);
        end = endOfMonth(activeDate);
      } else {
        const targetYearDate = new Date(activeDate.getFullYear(), 0, 1);
        start = startOfYear(targetYearDate);
        end = endOfYear(targetYearDate);
      }

      // 2. Fetch Period Sessions (for Chart)
      const { data: periodSessions } = await supabase
        .from('study_sessions')
        .select('duration, created_at, task')
        .eq('user_id', targetUserId)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());

      // 3. Fetch All Sessions (for Total Time & Earliest Year)
      // optimization: we might not need this EVERY time if we cache it or split it out.
      // For now, keeping logical parity with ReportModal.
      const { data: allSessions } = await supabase
        .from('study_sessions')
        .select('duration, created_at')
        .eq('user_id', targetUserId);

      const totalSeconds =
        allSessions?.reduce((acc, curr) => acc + curr.duration, 0) || 0;
      setTotalFocusTime(totalSeconds);

      const earliestSessionDate =
        allSessions?.reduce<Date | null>((acc, curr) => {
          const createdAt = curr.created_at ? new Date(curr.created_at) : null;
          if (!createdAt || Number.isNaN(createdAt.getTime())) return acc;
          if (!acc || createdAt < acc) return createdAt;
          return acc;
        }, null) ?? null;

      if (earliestSessionDate) {
        const firstYear = earliestSessionDate.getFullYear();
        setEarliestYear((prev) =>
          prev === null || firstYear < prev ? firstYear : prev
        );
      }

      // 4. Fetch Today's Sessions
      const todaySessions = await supabase
        .from('study_sessions')
        .select('duration')
        .eq('user_id', targetUserId)
        .gte('created_at', getDayStart().toISOString())
        .lte('created_at', getDayEnd().toISOString());

      const todaySeconds =
        todaySessions.data?.reduce((acc, curr) => acc + curr.duration, 0) || 0;
      setTodayFocusTime(todaySeconds);

      // 5. Process Chart Data
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
        const dayFull = [
          '월요일',
          '화요일',
          '수요일',
          '목요일',
          '금요일',
          '토요일',
          '일요일',
        ];
        // Ensure start is the beginning of the week for iteration
        const weekStart = startOfWeek(activeDate, { weekStartsOn: 1 });
        
        for (let i = 0; i < 7; i++) {
          const day = addDays(weekStart, i);
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
        const studyDayDate = getDayStart(sessionDate);
        let bucketKey = '';

        if (viewMode === 'week' || viewMode === 'month') {
          bucketKey = format(studyDayDate, 'yyyy-MM-dd');
        } else {
          bucketKey = format(studyDayDate, 'yyyy-MM');
        }

        if (!buckets[bucketKey]) return;

        const taskName = session.task?.trim() || '작업 지정 없음';
        buckets[bucketKey].seconds += session.duration;
        buckets[bucketKey].taskTotals[taskName] =
          (buckets[bucketKey].taskTotals[taskName] ?? 0) + session.duration;
      });

      const newChartData = Object.entries(buckets).map(([bucketKey, bucket]) => ({
        name: bucket.label,
        hours: parseFloat((bucket.seconds / 3600).toFixed(1)),
        seconds: bucket.seconds,
        taskTotals: bucket.taskTotals,
        bucketKey,
        displayLabel: bucket.label,
        breakdownLabel: bucket.breakdown ?? `${bucket.label} 작업별 집중 시간`,
      }));

      setChartData(newChartData);

      // 6. Process Heatmap Data (if needed, or maybe separate function)
      // For now, let's just use allSessions to build a simple heatmap if available
      // But heatmap usually needs the WHOLE year, not just the filtered period
      // Efficient way: aggregate allSessions by day.
      if (allSessions) {
        const dailyMap: Record<string, number> = {};
        allSessions.forEach(session => {
            const date = getDayStart(new Date(session.created_at));
            const key = format(date, 'yyyy-MM-dd');
            dailyMap[key] = (dailyMap[key] || 0) + session.duration;
        });
        
        const heatmap = Object.entries(dailyMap).map(([date, count]) => ({
            date,
            count
        }));
        setHeatmapData(heatmap);
      }

      setLoading(false);
    },
    []
  );

  return {
    loading,
    totalFocusTime,
    todayFocusTime,
    earliestYear,
    chartData,
    heatmapData,
    fetchStats,
  };
}
