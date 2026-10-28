'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from 'react';
import {
  startOfWeek,
  startOfMonth,
  addDays,
  format,
  subMonths,
  addMonths,
  isAfter,
  isSameMonth,
  isSameWeek,
} from 'date-fns';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { ChartData, ViewMode, StudyTotals, UNCLASSIFIED_SUBJECT, type useStudyStats } from '@/hooks/useStudyStats';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useStudySubjects } from '@/hooks/useStudySubjects';
import { getDayStart } from '@/lib/dateUtils';
import { StudySubject } from '@/lib/studySubjects';
import { cn } from '@/lib/utils';
import { playMotion } from '@/components/ui/motion';
import { usePresence } from '@/components/ui/usePresence';
import SubjectHistoryManager from '@/components/subjects/SubjectHistoryManager';
import { formatRoundedHours, formatShortDuration, formatStudyDuration } from '@/components/profile/studyDuration';

const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: 'week', label: '주간' },
  { value: 'month', label: '월간' },
  { value: 'year', label: '연간' },
];
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
// 모바일 알약 탭 크기(보드: 32px · 13px)
const SEGMENTED_MOBILE = 'max-md:[&>button]:h-8 max-md:[&>button]:px-3 max-md:[&>button]:text-[13px]';

const parseBucketDate = (bucketKey: string) => {
  const [year, month, day = 1] = bucketKey.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// 프로필 머리의 오늘·누적 시간과 같은 집계를 쓰도록 페이지의 useStudyStats 하나를 받는다.
// 기간을 넘길 때마다 다시 조회한 오늘 합계가 머리와 막대에 함께 반영된다.
export type StudyStats = ReturnType<typeof useStudyStats>;

export default function StudyReport({ stats }: { stats: StudyStats }) {
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
  const statsTitleId = useId();
  const totalsTitleId = useId();
  const historyId = useId();
  const chartRef = useRef<HTMLDivElement>(null);
  const breakdownRef = useRef<HTMLDivElement>(null);
  const totalsRef = useRef<HTMLDivElement>(null);

  const {
    loading,
    error: statsError,
    earliestYear,
    chartData,
    periodTotals,
    lifetimeTotals,
    fetchStats
  } = stats;

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
  const periodStart = (viewMode === 'week' ? activeWeekStart : viewMode === 'month' ? startOfMonth(activeMonth) : new Date(activeYear, 0, 1)).getTime();

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

  const todayBucketKey = useMemo(() => {
    const referenceDate =
      viewMode === 'year'
        ? new Date(activeYear, getDayStart(today).getMonth(), getDayStart(today).getDate())
        : getDayStart(today);
    return viewMode === 'year'
      ? format(referenceDate, 'yyyy-MM')
      : format(referenceDate, 'yyyy-MM-dd');
  }, [activeYear, today, viewMode]);

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

    return (
      chartData.find((bucket) => bucket.bucketKey === todayBucketKey) ??
      chartData[chartData.length - 1] ??
      null
    );
  }, [chartData, selectedBucketKey, todayBucketKey]);

  // 막대 아래 이름과 고른 막대의 제목(예: "10월 27일", "2026년 10월")
  const bucketTitle = (bucket: ChartData) => {
    const date = parseBucketDate(bucket.bucketKey);
    return viewMode === 'year' ? format(date, 'yyyy년 M월') : format(date, 'M월 d일');
  };
  const bucketAxisLabel = (bucket: ChartData) => {
    const date = parseBucketDate(bucket.bucketKey);
    if (viewMode === 'week') return DAY_NAMES[date.getDay()];
    if (viewMode === 'year') return `${date.getMonth() + 1}월`;
    const day = date.getDate();
    return day === 1 || day % 5 === 0 ? String(day) : '';
  };
  const bucketAriaLabel = (bucket: ChartData) => {
    const date = parseBucketDate(bucket.bucketKey);
    const title = viewMode === 'week' ? `${bucketTitle(bucket)} ${DAY_NAMES[date.getDay()]}요일` : bucketTitle(bucket);
    return `${title}, ${bucket.seconds > 0 ? formatStudyDuration(bucket.seconds) : '기록 없음'}`;
  };
  const maxBucketSeconds = Math.max(3600, ...chartData.map(bucket => bucket.seconds));

  const range = viewMode === 'week'
    ? {
        label: `${format(activeWeekStart, 'M/d')} - ${format(addDays(activeWeekStart, 6), 'M/d')}`,
        resetTitle: '이번 주로 이동',
        onReset: () => setActiveWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 })),
        prevLabel: '이전 주', onPrev: goToPrevWeek, canPrev: true,
        nextLabel: '다음 주', onNext: goToNextWeek, canNext: canGoNextWeek,
      }
    : viewMode === 'month'
      ? {
          label: format(activeMonth, 'yyyy년 M월'),
          resetTitle: '이번 달로 이동',
          onReset: () => setActiveMonth(new Date()),
          prevLabel: '이전 달', onPrev: goToPrevMonth, canPrev: true,
          nextLabel: '다음 달', onNext: goToNextMonth, canNext: canGoNextMonth,
        }
      : {
          label: `${activeYear}년`,
          resetTitle: '올해로 이동',
          onReset: () => setActiveYear(currentYear),
          prevLabel: '이전 년도', onPrev: () => setActiveYear(prev => prev - 1), canPrev: !(earliestYear !== null && activeYear <= earliestYear),
          nextLabel: '다음 년도', onNext: () => setActiveYear(prev => prev + 1), canNext: activeYear < currentYear,
        };

  // 사용자가 기간을 넘기고 새 기간의 집계가 도착하면 막대와 작업별 시간(선택 기간 합계도)이 넘긴 쪽에서 6px 들어오며
  // 나타나고 막대는 바닥에서 자란다. 단위를 바꾸면 방향 없이 나타난다. 처음 불러올 때, 같은 기간을 다시 조회할 때
  // (과목 정리 뒤 등)는 움직이지 않는다.
  const shownPeriodRef = useRef<{ chartData: ChartData[]; viewMode: ViewMode; periodStart: number } | null>(null);
  useLayoutEffect(() => {
    const shown = shownPeriodRef.current;
    if (loading || shown?.chartData === chartData) return;
    shownPeriodRef.current = { chartData, viewMode, periodStart };
    if (!shown || (shown.viewMode === viewMode && shown.periodStart === periodStart)) return;
    const shift = shown.viewMode === viewMode ? Math.sign(periodStart - shown.periodStart) * 6 : 0;
    const contents = [chartRef.current, breakdownRef.current, overviewScope === 'period' ? totalsRef.current : null];
    for (const element of contents) playMotion(element, [{ opacity: 0, transform: `translateX(${shift}px)`, offset: 0 }]);
    chartRef.current?.querySelectorAll('[data-bar]').forEach(bar => {
      playMotion(bar, [{ transform: 'scaleY(0)', offset: 0 }], { duration: 'emphasized' });
    });
  }, [chartData, loading, viewMode, periodStart, overviewScope]);

  // 합계 범위·묶는 기준을 바꾸면 새 목록이 살짝 나타난다.
  const totalsViewRef = useRef(`${overviewScope}:${grouping}`);
  useLayoutEffect(() => {
    const view = `${overviewScope}:${grouping}`;
    if (totalsViewRef.current === view) return;
    totalsViewRef.current = view;
    playMotion(totalsRef.current, [{ opacity: 0, offset: 0 }]);
  }, [overviewScope, grouping]);

  const selectBucket = (bucketKey: string) => {
    // 다른 막대를 고르면 그날의 작업별 시간이 살짝 나타난다.
    if (bucketKey !== selectedBucket?.bucketKey) playMotion(breakdownRef.current, [{ opacity: 0, offset: 0 }]);
    setSelectedBucketKey(bucketKey);
  };

  const retryStats = () => void fetchStats(viewMode, viewMode === 'week' ? activeWeekStart : viewMode === 'month' ? activeMonth : new Date(activeYear, 0, 1), userId ?? undefined);
  const selectedTasks = selectedBucket ? Object.entries(selectedBucket.taskTotals).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="flex w-full flex-col gap-9 md:gap-10">
      <section aria-labelledby={statsTitleId} className="flex flex-col gap-3.5 md:gap-5">
        <div className="flex flex-col gap-3.5 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4">
          <h2 id={statsTitleId} className="ui-h2">집중 통계</h2>
          <div className="flex flex-wrap items-center gap-y-3.5 md:flex-nowrap">
            <div role="group" aria-label="기간 단위" className={cn('ui-segmented order-1 mr-auto md:mr-3', SEGMENTED_MOBILE)}>
              {VIEW_OPTIONS.map(option => (
                <button key={option.value} type="button" aria-pressed={viewMode === option.value} onClick={() => setViewMode(option.value)}>
                  {option.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={range.onPrev} disabled={!range.canPrev} aria-label={range.prevLabel} className="ui-icon-button order-2 size-9">
              <ChevronLeft size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <div className="order-4 basis-full md:order-3 md:basis-auto md:px-0.5">
              <button
                type="button"
                onClick={range.onReset}
                title={range.resetTitle}
                className="ui-press -ml-2 min-h-8 rounded-[9px] px-2 text-[15px] font-bold transition-[background-color,scale] hover:bg-hover md:ml-0 md:min-h-9 md:min-w-[120px] md:rounded-chip md:px-2.5 md:font-semibold"
              >
                {range.label}
              </button>
            </div>
            <button type="button" onClick={range.onNext} disabled={!range.canNext} aria-label={range.nextLabel} className="ui-icon-button order-3 size-9 md:order-4">
              <ChevronRight size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div aria-busy={loading} className="relative">
          {loading ? (
            <p role="status" className="absolute top-0 left-0 m-0 text-[13px] text-ink-muted">통계를 불러오는 중이에요…</p>
          ) : null}
          <div
            ref={chartRef}
            className={cn(
              // 보드의 막대 상자는 content-box(높이 + 아래 여백): 모바일 180 + 22, 데스크톱 220 + 24
              'flex h-[202px] items-end pb-[22px] [--bar-max:120px] md:h-[244px] md:pb-6 md:[--bar-max:150px]',
              viewMode === 'month' ? 'gap-0.5 md:gap-1' : 'gap-2 md:gap-3',
              loading && 'opacity-50',
            )}
          >
            {chartData.map(bucket => {
              const isSelected = bucket.bucketKey === selectedBucket?.bucketKey;
              const isToday = bucket.bucketKey === todayBucketKey;
              const ratio = bucket.seconds / maxBucketSeconds;
              const barStyle = {
                height: `max(${bucket.seconds > 0 ? 6 : 3}px, calc(var(--bar-max) * ${ratio.toFixed(4)}))`,
              } as CSSProperties;
              return (
                <button
                  key={bucket.bucketKey}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={bucketAriaLabel(bucket)}
                  onClick={() => selectBucket(bucket.bucketKey)}
                  className="ui-press relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[5px] rounded-[6px] p-0 transition-[filter,scale] hover:brightness-92 md:gap-1.5"
                >
                  {viewMode !== 'month' ? (
                    <span aria-hidden="true" className={cn('text-[10px] font-semibold whitespace-nowrap transition-colors md:text-[11px]', isSelected ? 'text-ink' : 'text-ink-muted')}>
                      {viewMode === 'year' ? (
                        <>
                          {/* 모바일 연간은 12칸이 좁아 반올림한 시간만 쓴다. 정확한 값은 버튼 이름과 아래 작업별 시간에 있다. */}
                          <span className="md:hidden">{formatRoundedHours(bucket.seconds)}</span>
                          <span className="max-md:hidden">{formatShortDuration(bucket.seconds)}</span>
                        </>
                      ) : formatShortDuration(bucket.seconds)}
                    </span>
                  ) : null}
                  <span
                    data-bar
                    aria-hidden="true"
                    style={barStyle}
                    className={cn(
                      'block w-full max-w-9 origin-bottom rounded-t-[5px] rounded-b-[3px] transition-colors md:max-w-11 md:rounded-t-[6px]',
                      isSelected ? 'bg-pomo' : bucket.seconds > 0 ? 'bg-pomo-soft' : 'bg-line-soft',
                    )}
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute -bottom-5 text-[11px] whitespace-nowrap md:-bottom-[22px]',
                      isToday ? 'font-bold text-ink' : 'font-medium text-ink-muted',
                    )}
                  >
                    {bucketAxisLabel(bucket)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div ref={breakdownRef} className="flex flex-col gap-2 pt-1 md:gap-2.5 md:pt-2">
          <h3 className="m-0 text-sm font-semibold">
            {selectedBucket ? `${bucketTitle(selectedBucket)} 작업별 집중 시간` : '작업별 집중 시간'}
          </h3>
          {selectedTasks.length > 0 ? (
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0 md:gap-2">
              {selectedTasks.map(([task, secs]) => (
                <li key={task} className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-chip bg-surface px-2.5 text-[13px] md:h-[34px] md:gap-2 md:px-3">
                  <span className="min-w-0 truncate font-semibold">{task}</span>
                  <span className="shrink-0 text-ink-muted">{formatStudyDuration(secs)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[13px] text-ink-muted">기록이 없어요.</p>
          )}
        </div>
      </section>

      <section aria-labelledby={totalsTitleId} className="flex flex-col gap-3.5 md:gap-4">
        <div className="flex flex-col gap-3.5 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4">
          <h2 id={totalsTitleId} className="ui-h2">과목과 할 일별 누적</h2>
          <div className="flex flex-wrap gap-2 md:gap-2.5">
            <div role="group" aria-label="합계 범위" className={cn('ui-segmented', SEGMENTED_MOBILE)}>
              <button type="button" aria-pressed={overviewScope === 'period'} onClick={() => setOverviewScope('period')}>선택 기간<span className="max-md:hidden"> 합계</span></button>
              <button type="button" aria-pressed={overviewScope === 'lifetime'} onClick={() => setOverviewScope('lifetime')}>전체 누적</button>
            </div>
            <div role="group" aria-label="묶는 기준" className={cn('ui-segmented', SEGMENTED_MOBILE)}>
              <button type="button" aria-pressed={grouping === 'subject'} onClick={() => setGrouping('subject')}>과목별</button>
              <button type="button" aria-pressed={grouping === 'task'} onClick={() => setGrouping('task')}>할 일별</button>
            </div>
          </div>
        </div>
        {(subjectsError || statsError) && <p role="alert" className="m-0 text-sm text-pomo-deep">{subjectsError || statsError}</p>}
        {statsError && <button type="button" onClick={retryStats} className="ui-button-ghost -ml-3 self-start text-pomo">통계 다시 조회</button>}
        {loading ? <p role="status" className="m-0 text-[13px] text-ink-muted">통계를 불러오는 중…</p> : <StudyTotalsOverview ref={totalsRef} key={`${userId}:${overviewScope}:${grouping}`} totals={overviewScope === 'period' ? periodTotals : lifetimeTotals} hasAnyRecord={lifetimeTotals.seconds > 0} subjects={subjects} grouping={grouping} />}

        {userId && <div className="flex flex-col gap-3 pt-1">
          <button type="button" aria-expanded={showHistoryManager} aria-controls={showHistoryManager ? historyId : undefined} onClick={() => setShowHistoryManager(value => !value)} className="ui-button-secondary ui-press self-start rounded-tile px-4">
            {showHistoryManager ? '기존 기록 과목 정리 닫기' : '기존 기록 과목 정리'}
          </button>
          {showHistoryManager && <div id={historyId}><SubjectHistoryManager userId={userId} /></div>}
        </div>}
      </section>
    </div>
  );
}

type TotalsRow = { id: string; name: string; seconds: number; taskTotals: Record<string, number>; unclassified: boolean };

function StudyTotalsOverview({ ref, totals, hasAnyRecord, subjects, grouping }: {
  ref?: Ref<HTMLDivElement>;
  totals: StudyTotals;
  hasAnyRecord: boolean;
  subjects: StudySubject[];
  grouping: 'subject' | 'task';
}) {
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set());
  const listId = useId();
  const names = new Map(subjects.map(subject => [subject.id, subject.name]));
  const rows: TotalsRow[] = grouping === 'subject'
    ? Object.entries(totals.subjects).map(([id, value]) => ({ id, name: id === UNCLASSIFIED_SUBJECT ? '미분류' : names.get(id) ?? '알 수 없는 과목', unclassified: id === UNCLASSIFIED_SUBJECT, ...value }))
    : Object.entries(totals.taskTotals).map(([task, seconds]) => ({ id: task, name: task, seconds, taskTotals: {}, unclassified: false }));
  rows.sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));
  const maxSeconds = Math.max(1, ...rows.map(row => row.seconds));

  const toggle = (id: string) => setOpenRows(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div ref={ref} className="flex flex-col gap-2">
      <p className="m-0 text-sm font-semibold text-ink-muted">합계 {formatStudyDuration(totals.seconds)}</p>
      {!rows.length ? (
        <p className="m-0 py-4 text-sm text-ink-muted">
          {hasAnyRecord ? '이 기간에는 기록이 없어요.' : '아직 기록이 없어요. 첫 뽀모도로를 시작하면 여기에 쌓여요.'}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {rows.map((row, index) => {
            const share = totals.seconds > 0 ? row.seconds / totals.seconds * 100 : 0;
            const expandable = grouping === 'subject';
            const open = expandable && openRows.has(row.id);
            const childrenId = `${listId}-${index}`;
            const content = <>
              <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-1.5 font-semibold md:gap-2">
                <span className="truncate">{row.name}</span>
                {expandable ? <ChevronDown aria-hidden="true" size={14} strokeWidth={2.2} className={cn('shrink-0 text-ink-muted transition-transform duration-(--duration-enter) motion-reduce:transition-none', open && 'rotate-180')} /> : null}
              </span>
              <span aria-hidden="true" className="col-span-2 row-start-2 block h-1.5 overflow-hidden rounded-full bg-surface md:col-span-1 md:col-start-2 md:row-start-1 md:h-2">
                <span className={cn('block h-full rounded-full', row.unclassified ? 'bg-bar' : 'bg-pomo')} style={{ width: `${Math.max(2, row.seconds / maxSeconds * 100)}%` }} />
              </span>
              <span className="col-start-2 row-start-1 flex items-baseline justify-end gap-2 whitespace-nowrap md:col-start-3">
                <span className="text-xs font-medium text-ink-subtle">{share.toFixed(1)}%</span>
                <span className="font-bold">{formatStudyDuration(row.seconds)}</span>
              </span>
            </>;
            const rowClass = 'grid w-[calc(100%+20px)] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-2 rounded-control -mx-2.5 px-2.5 py-2.5 text-left md:-mx-3 md:w-[calc(100%+24px)] md:min-h-[52px] md:grid-cols-[180px_minmax(0,1fr)_150px] md:gap-x-4 md:rounded-tile md:px-3 md:py-1.5';
            return (
              <li key={row.id} className="flex flex-col">
                {expandable ? (
                  <button type="button" aria-expanded={open} aria-controls={open ? childrenId : undefined} onClick={() => toggle(row.id)} className={cn(rowClass, 'hover:bg-hover')}>
                    {content}
                  </button>
                ) : (
                  <div className={rowClass}>{content}</div>
                )}
                {expandable ? <SubjectTasks id={childrenId} name={row.name} open={open} taskTotals={row.taskTotals} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// 과목 줄의 세부 할 일. 펼치면 아래로 열리고, 접으면 다 접힌 뒤 목록을 내린다(docs/design-system.md §8 ui-collapse).
// 안에는 포커스를 받는 요소가 없으므로 접을 때 옮길 포커스도 없다.
function SubjectTasks({ id, name, open, taskTotals }: { id: string; name: string; open: boolean; taskTotals: Record<string, number> }) {
  const { ref, mounted } = usePresence<HTMLDivElement>(open);
  const tasks = Object.entries(taskTotals).sort((a, b) => b[1] - a[1]);
  const childMax = Math.max(1, tasks[0]?.[1] ?? 0);
  return (
    <div ref={ref} className="ui-collapse" data-state={open ? 'open' : 'closed'} inert={!open || undefined}>
      <div>
        {mounted ? (
          <ul id={id} aria-label={`${name} 세부 할 일`} className="m-0 mb-1.5 flex list-none flex-col p-0 pl-3.5 md:pl-5">
            {tasks.map(([task, seconds]) => (
              <li key={task} className="grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 text-sm text-ink-muted md:min-h-10 md:grid-cols-[160px_minmax(0,1fr)_150px] md:gap-4">
                <span className="min-w-0 truncate" title={task}>{task}</span>
                <span aria-hidden="true" className="hidden h-1.5 overflow-hidden rounded-full bg-surface md:block">
                  <span className="block h-full rounded-full bg-bar" style={{ width: `${Math.max(2, seconds / childMax * 100)}%` }} />
                </span>
                <span className="text-right whitespace-nowrap">{formatStudyDuration(seconds)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
