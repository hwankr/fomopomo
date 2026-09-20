'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
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
  addDays,
  format,
  subMonths,
  addMonths,
  isAfter,
  isSameMonth,
  isSameWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { useStudyStats, ChartData, ViewMode, StudyTotals, UNCLASSIFIED_SUBJECT } from '@/hooks/useStudyStats';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useStudySubjects } from '@/hooks/useStudySubjects';
import { getDayStart } from '@/lib/dateUtils';
import { StudySubject } from '@/lib/studySubjects';
import SubjectHistoryManager from '@/components/subjects/SubjectHistoryManager';

export default function StudyReport() {
  const { session } = useAuthSession();
  const userId = session?.user?.id ?? null;
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [activeYear, setActiveYear] = useState(new Date().getFullYear());
  const [activeMonth, setActiveMonth] = useState(new Date());
  const [activeWeekStart, setActiveWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedBucketKey, setSelectedBucketKey] = useState<string | null>(null);
  const [overviewScope, setOverviewScope] = useState<'period' | 'lifetime'>('period');
  const [grouping, setGrouping] = useState<'subject' | 'task'>('subject');
  const [showHistoryManager, setShowHistoryManager] = useState(false);
  const { subjects, error: subjectsError } = useStudySubjects(userId);
  const scrollRef = useRef<HTMLDivElement>(null);


  const {
    loading,
    error: statsError,
    totalFocusTime,
    todayFocusTime,
    earliestYear,
    chartData,
    periodTotals,
    lifetimeTotals,
    fetchStats
  } = useStudyStats(userId);

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

  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();

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

  // Fetch data when view mode or active date changes (로그인한 사용자에 한함)
  useEffect(() => {
    if (!userId) return;

    const timeoutId = setTimeout(() => {
        let activeDate: Date;
        if (viewMode === 'week') {
            activeDate = activeWeekStart;
        } else if (viewMode === 'month') {
            activeDate = activeMonth;
        } else {
            activeDate = new Date(activeYear, 0, 1);
        }

        fetchStats(viewMode, activeDate, userId);
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [viewMode, activeYear, activeMonth, activeWeekStart, fetchStats, userId]);

  const selectedBucket = useMemo(() => {
    const manuallySelectedBucket = selectedBucketKey
      ? chartData.find((bucket) => bucket.bucketKey === selectedBucketKey) ?? null
      : null;

    if (manuallySelectedBucket) {
      return manuallySelectedBucket;
    }

    if (chartData.length === 0) {
      return null;
    }

    const referenceDate =
      viewMode === 'year'
        ? new Date(activeYear, getDayStart(today).getMonth(), getDayStart(today).getDate())
        : getDayStart(today);
    const todayKey =
      viewMode === 'year'
        ? format(referenceDate, 'yyyy-MM')
        : format(referenceDate, 'yyyy-MM-dd');

    return (
      chartData.find((bucket) => bucket.bucketKey === todayKey) ??
      chartData[chartData.length - 1] ??
      null
    );
  }, [activeYear, chartData, selectedBucketKey, today, viewMode]);


  const tabBase = 'ui-press whitespace-nowrap px-3 py-2 text-xs font-semibold rounded-lg transition-colors';
  const tabActive =
    'bg-white text-rose-600 shadow-sm dark:bg-slate-700 dark:text-rose-200';
  const tabInactive =
    'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200';

  return (
    <div className="ui-panel-enter w-full">
          <div className="mb-6 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="mb-3 text-xs font-medium text-slate-500 dark:text-slate-400">
                총 누적 시간
              </div>
              <div className="text-2xl font-semibold tracking-tight tabular-nums text-slate-800 sm:text-3xl dark:text-white">
                {formatDuration(totalFocusTime)}
              </div>
              <div className="mt-2 text-xs text-slate-400">전체 기간</div>
            </div>
            <div className="rounded-2xl border border-rose-100 bg-rose-50/40 p-4 sm:p-5 dark:border-rose-900/40 dark:bg-rose-950/15">
              <div className="mb-3 text-xs font-medium text-slate-500 dark:text-slate-400">
                오늘 집중 시간
              </div>
              <div className="text-2xl font-semibold tracking-tight tabular-nums text-rose-500 sm:text-3xl dark:text-rose-300">
                {formatDuration(todayFocusTime)}
              </div>
              <div className="mt-2 text-xs text-slate-400">오전 5시부터 새로운 하루</div>
            </div>
          </div>

          <div className="rounded-2xl border-slate-200/80 bg-white p-0 sm:border sm:p-5 dark:border-slate-700 dark:bg-slate-800/30">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <h3 className="text-sm font-bold text-gray-600 dark:text-gray-300 flex items-center gap-2">
                집중 통계
              </h3>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="ui-segmented flex">
                  <button
                    onClick={() => setViewMode('week')}
                    aria-pressed={viewMode === 'week'}
                    className={`${tabBase} ${viewMode === 'week' ? tabActive : tabInactive
                      }`}
                  >
                    주간
                  </button>
                  <button
                    onClick={() => setViewMode('month')}
                    aria-pressed={viewMode === 'month'}
                    className={`${tabBase} ${viewMode === 'month' ? tabActive : tabInactive
                      }`}
                  >
                    월간
                  </button>
                  <button
                    onClick={() => setViewMode('year')}
                    aria-pressed={viewMode === 'year'}
                    className={`${tabBase} ${viewMode === 'year' ? tabActive : tabInactive
                      }`}
                  >
                    연간
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
                            setSelectedBucketKey((data.payload as ChartData).bucketKey);
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
                `${format(activeWeekStart, 'M/dd')} - ${format(addDays(activeWeekStart, 6), 'M/dd')} (월~일)`}
              {viewMode === 'month' &&
                `${format(startOfMonth(activeMonth), 'yyyy.MM')} (1일~${endOfMonth(activeMonth).getDate()}일)`}
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

            <section className="mt-6 rounded-2xl border border-slate-200/80 p-4 sm:p-5 dark:border-slate-700" aria-label="과목과 할 일별 누적 통계">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="ui-segmented flex">
                  <button type="button" aria-pressed={overviewScope === 'period'} onClick={() => setOverviewScope('period')} className={`${tabBase} ${overviewScope === 'period' ? tabActive : tabInactive}`}>선택 기간 합계</button>
                  <button type="button" aria-pressed={overviewScope === 'lifetime'} onClick={() => setOverviewScope('lifetime')} className={`${tabBase} ${overviewScope === 'lifetime' ? tabActive : tabInactive}`}>전체 누적</button>
                </div>
                <div className="ui-segmented flex">
                  <button type="button" aria-pressed={grouping === 'subject'} onClick={() => setGrouping('subject')} className={`${tabBase} ${grouping === 'subject' ? tabActive : tabInactive}`}>과목별</button>
                  <button type="button" aria-pressed={grouping === 'task'} onClick={() => setGrouping('task')} className={`${tabBase} ${grouping === 'task' ? tabActive : tabInactive}`}>할 일별</button>
                </div>
              </div>
              {(subjectsError || statsError) && <p role="alert" className="mt-3 text-xs text-red-500">{subjectsError || statsError}</p>}
              {statsError && <button type="button" onClick={() => void fetchStats(viewMode, viewMode === 'week' ? activeWeekStart : viewMode === 'month' ? activeMonth : new Date(activeYear, 0, 1), userId ?? undefined)} className="mt-2 text-xs font-semibold text-rose-600">통계 다시 조회</button>}
              {loading ? <p role="status" className="mt-4 text-xs text-gray-400">통계를 불러오는 중…</p> : <StudyTotalsOverview key={`${userId}:${overviewScope}:${grouping}`} totals={overviewScope === 'period' ? periodTotals : lifetimeTotals} subjects={subjects} grouping={grouping} formatDuration={formatDuration} />}
            </section>

            {userId && <div className="mt-5">
              <button type="button" aria-expanded={showHistoryManager} onClick={() => setShowHistoryManager(value => !value)} className="ui-button-secondary ui-press inline-flex items-center gap-2 px-3 py-2.5 text-sm font-medium"><SlidersHorizontal size={15} aria-hidden="true" />{showHistoryManager ? '기존 기록 과목 정리 닫기' : '기존 기록 과목 정리'}</button>
              {showHistoryManager && <SubjectHistoryManager userId={userId} />}
            </div>}
          </div>
    </div>
  );
}

function StudyTotalsOverview({ totals, subjects, grouping, formatDuration }: {
  totals: StudyTotals;
  subjects: StudySubject[];
  grouping: 'subject' | 'task';
  formatDuration: (seconds: number) => string;
}) {
  const names = new Map(subjects.map(subject => [subject.id, subject.name]));
  const rows = grouping === 'subject'
    ? Object.entries(totals.subjects).map(([id, value]) => ({ id, name: id === UNCLASSIFIED_SUBJECT ? '미분류' : names.get(id) ?? '알 수 없는 과목', ...value }))
    : Object.entries(totals.taskTotals).map(([task, seconds]) => ({ id: task, name: task, seconds, taskTotals: {} as Record<string, number> }));
  rows.sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));

  return (
    <div className="ui-panel-enter mt-5">
      <p className="mb-4 text-base font-semibold tabular-nums text-slate-800 dark:text-slate-100">합계 {formatDuration(totals.seconds)}</p>
      {!rows.length ? <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400 dark:bg-slate-800/50">데이터가 없습니다.</p> : <ul className="space-y-2">
        {rows.map(row => {
          const share = totals.seconds > 0 ? row.seconds / totals.seconds * 100 : 0;
          const content = <span className="flex min-w-0 flex-1 flex-col gap-2.5">
            <span className="flex items-center justify-between gap-3">
              <span className="min-w-0 break-words font-medium">{row.name}</span>
              <span className="flex shrink-0 items-baseline gap-2 text-xs tabular-nums"><span className="font-semibold">{formatDuration(row.seconds)}</span><span className="w-12 text-right text-slate-400">{share.toFixed(1)}%</span></span>
            </span>
            <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/70"><span className="block h-full rounded-full bg-rose-300 transition-[width] duration-300 motion-reduce:transition-none dark:bg-rose-400/70" style={{ width: `${share}%` }} /></span>
          </span>;
          return <li key={row.id} className="overflow-hidden rounded-xl border border-slate-100 bg-white transition-colors hover:border-rose-100 dark:border-slate-700 dark:bg-slate-800/30 dark:hover:border-rose-900/50">
            {grouping === 'subject' ? <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 p-3.5 text-sm text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-300 dark:text-slate-200">{content}<ChevronRight aria-hidden="true" size={14} className="shrink-0 text-slate-400 transition-transform group-open:rotate-90 motion-reduce:transition-none" /></summary>
              <ul className="ui-panel-enter space-y-3 border-t border-slate-100 bg-slate-50/60 px-4 py-4 dark:border-slate-700 dark:bg-slate-900/20" aria-label={`${row.name} 세부 할 일`}>
                {Object.entries(row.taskTotals).sort((a, b) => b[1] - a[1]).map(([task, seconds]) => <li key={task} className="flex justify-between gap-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300"><span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{task}</span><span className="shrink-0 font-medium tabular-nums">{formatDuration(seconds)}</span></li>)}
              </ul>
            </details> : <div className="flex p-3.5 text-sm text-slate-700 dark:text-slate-200">{content}</div>}
          </li>;
        })}
      </ul>}
      {grouping === 'subject' && rows.length > 0 && <p className="mt-3 text-xs text-gray-400">과목을 누르면 세부 할 일별 시간을 볼 수 있습니다.</p>}
    </div>
  );
}
