'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { addDays, format, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getDayStart } from '@/lib/dateUtils';
import { formatStudyDuration } from '@/components/profile/studyDuration';
import { playMotion } from '@/components/ui/motion';
import { cn } from '@/lib/utils';

interface ContributionGraphProps {
  /** 공부일(yyyy-MM-dd)별 집중 시간(초) */
  data: { date: string; count: number }[];
  /** 기록이 시작된 해. 연도 탭과 반기 넘기기의 하한이다. */
  earliestYear: number | null;
  loading?: boolean;
}

type Period = { year: number; half: 0 | 1 };

const HEAT_CLASSES = ['bg-heat-0', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4'] as const;
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
const DEFAULT_PICKED_TEXT = '구슬을 누르면 그날의 집중 시간을 볼 수 있어요';
const MOBILE_QUERY = '(max-width: 767.98px)';

// 하루 집중 시간 → 구슬 농도 0~4 (없음 · 1시간 미만 · 3시간 미만 · 5시간 미만 · 그 이상)
export function getHeatLevel(seconds: number) {
  const hours = seconds / 3600;
  if (hours <= 0) return 0;
  if (hours < 1) return 1;
  if (hours < 3) return 2;
  if (hours < 5) return 3;
  return 4;
}

function subscribeMobile(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

// 모바일 보드는 반기(27주), 데스크톱 보드는 1년(53주)을 그린다.
function useIsMobile() {
  return useSyncExternalStore(
    subscribeMobile,
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}

const parseKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export default function ContributionGraph({ data, earliestYear, loading = false }: ContributionGraphProps) {
  const isMobile = useIsMobile();
  const titleId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const today = useMemo(() => getDayStart(new Date()), []);
  const todayKey = format(today, 'yyyy-MM-dd');
  const currentPeriod: Period = { year: today.getFullYear(), half: today.getMonth() < 6 ? 0 : 1 };
  const firstYear = Math.min(earliestYear ?? currentPeriod.year, currentPeriod.year);

  const [period, setPeriod] = useState<Period>(currentPeriod);
  const [picked, setPicked] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const years = useMemo(() => {
    const list: number[] = [];
    for (let year = currentPeriod.year; year >= firstYear; year -= 1) list.push(year);
    return list;
  }, [currentPeriod.year, firstYear]);

  const secondsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const day of data) map.set(day.date, (map.get(day.date) ?? 0) + day.count);
    return map;
  }, [data]);

  const rangeStart = isMobile ? new Date(period.year, period.half * 6, 1) : new Date(period.year, 0, 1);
  const rangeEnd = isMobile ? new Date(period.year, period.half * 6 + 6, 0) : new Date(period.year, 11, 31);
  const startKey = format(rangeStart, 'yyyy-MM-dd');
  const endKey = format(rangeEnd, 'yyyy-MM-dd');
  const periodLabel = isMobile ? `${period.year}년 ${period.half ? '하반기' : '상반기'}` : `${period.year}년`;

  // 일요일에서 시작하는 주 단위 열. 범위 밖 칸은 자리만 차지한다.
  const weeks = useMemo(() => {
    const start = startOfWeek(parseKey(startKey), { weekStartsOn: 0 });
    const end = parseKey(endKey);
    const columns: { key: string; date: Date; inRange: boolean }[][] = [];
    for (let day = start; day <= end; day = addDays(day, 1)) {
      if (day.getDay() === 0) columns.push([]);
      const key = format(day, 'yyyy-MM-dd');
      columns[columns.length - 1].push({ key, date: day, inRange: key >= startKey && key <= endKey });
    }
    return columns;
  }, [startKey, endKey]);

  const monthLabels = useMemo(() => {
    let lastMonth = -1;
    return weeks.map(week => {
      const sunday = week[0];
      if (!sunday.inRange || sunday.date.getDate() > 7 || sunday.date.getMonth() === lastMonth) return '';
      lastMonth = sunday.date.getMonth();
      return `${lastMonth + 1}월`;
    });
  }, [weeks]);

  const inRange = (key: string | null) => !!key && key >= startKey && key <= endKey;
  const visiblePicked = inRange(picked) ? picked : null;
  // 키보드로 들어오는 칸: 고른 날 → 오늘 → 범위의 마지막 날
  const tabStop = inRange(focusKey) ? focusKey : visiblePicked ?? (inRange(todayKey) ? todayKey : endKey);

  const describe = (key: string) => {
    const seconds = secondsByDay.get(key) ?? 0;
    return seconds > 0 ? formatStudyDuration(seconds) : '기록 없음';
  };
  const pickedDate = visiblePicked ? parseKey(visiblePicked) : null;
  const pickedText = pickedDate
    ? `${format(pickedDate, 'M월 d일')} ${DAY_NAMES[pickedDate.getDay()]}요일, ${describe(visiblePicked!)}`
    : DEFAULT_PICKED_TEXT;

  // 처음과 기간을 바꿀 때 오늘(또는 기간 끝)이 보이도록 가로 스크롤을 맞춘다.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || container.scrollWidth <= container.clientWidth) return;
    const target = cellRefs.current.get(todayKey >= startKey && todayKey <= endKey ? todayKey : endKey);
    container.scrollLeft = target ? target.offsetLeft - container.clientWidth + 48 : container.scrollWidth;
  }, [startKey, endKey, todayKey]);

  const changePeriod = (next: Period) => {
    setPeriod(next);
    setFocusKey(null);
  };
  const periodIndex = period.year * 2 + period.half;
  // 연도·반기를 바꾸면 새 기간의 구슬이 넘긴 쪽에서 6px 들어오며 나타난다(처음 그릴 때는 움직이지 않는다).
  const shownPeriodRef = useRef(periodIndex);
  useLayoutEffect(() => {
    const direction = Math.sign(periodIndex - shownPeriodRef.current);
    shownPeriodRef.current = periodIndex;
    if (direction) playMotion(scrollRef.current, [{ opacity: 0, transform: `translateX(${direction * 6}px)`, offset: 0 }]);
  }, [periodIndex]);
  const canGoPrev = periodIndex > firstYear * 2;
  const canGoNext = periodIndex < currentPeriod.year * 2 + currentPeriod.half;
  const shiftHalf = (direction: -1 | 1) => {
    const index = periodIndex + direction;
    changePeriod({ year: Math.floor(index / 2), half: (index % 2) as 0 | 1 });
  };

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, key: string) => {
    const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[event.key];
    if (!step) return;
    event.preventDefault();
    const nextKey = format(addDays(parseKey(key), step), 'yyyy-MM-dd');
    if (!inRange(nextKey)) return;
    setFocusKey(nextKey);
    setPicked(nextKey);
    cellRefs.current.get(nextKey)?.focus();
  };

  // 모바일은 폭에 맞춰 줄어드는 칸(최대 10px), 데스크톱은 14px 고정 칸 + 가로 스크롤
  const cellSize = isMobile ? 'aspect-square w-full' : 'size-3.5';
  const columns = isMobile ? 'auto-cols-[minmax(0,1fr)] gap-[3px]' : 'auto-cols-[14px] gap-1';

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3.5 md:gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-2 md:gap-4">
        <h2 id={titleId} className="ui-h2">공부 기록</h2>
        {isMobile ? (
          <div className="flex items-center">
            <button type="button" onClick={() => shiftHalf(-1)} disabled={!canGoPrev} aria-label="이전 반기" className="ui-icon-button size-9">
              <ChevronLeft size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <span aria-live="polite" className="min-w-[104px] text-center text-sm font-bold">{periodLabel}</span>
            <button type="button" onClick={() => shiftHalf(1)} disabled={!canGoNext} aria-label="다음 반기" className="ui-icon-button size-9">
              <ChevronRight size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div role="group" aria-label="연도" className="ui-segmented">
            {years.map(year => (
              <button
                key={year}
                type="button"
                aria-pressed={period.year === year}
                onClick={() => changePeriod({ year, half: year === currentPeriod.year ? currentPeriod.half : 1 })}
              >
                {year}년
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && data.length === 0 ? (
        <p role="status" className="flex h-[150px] items-center text-[13px] text-ink-muted md:h-[148px]">기록을 불러오는 중이에요…</p>
      ) : (
        <div ref={scrollRef} className={isMobile ? undefined : 'ui-scrollbar-horizontal -m-1 overflow-x-auto p-1 pb-2'}>
          <div className={cn('flex flex-col', isMobile ? 'w-full max-w-[348px] gap-[5px]' : 'w-max gap-1.5')}>
            <div aria-hidden="true" className={cn('grid grid-flow-col text-ink-muted', columns, isMobile ? 'h-3.5 text-[11px]' : 'h-4 text-xs')}>
              {monthLabels.map((label, index) => (
                <span key={index} className="leading-none whitespace-nowrap">{label}</span>
              ))}
            </div>
            <div role="group" aria-label={`${periodLabel} 하루별 집중 시간`} className={cn('grid grid-flow-col grid-rows-[repeat(7,auto)]', columns)}>
              {weeks.flat().map(cell => {
                if (!cell.inRange) return <span key={cell.key} aria-hidden="true" className={cellSize} />;
                const isPicked = cell.key === visiblePicked;
                return (
                  <button
                    key={cell.key}
                    ref={node => {
                      if (node) cellRefs.current.set(cell.key, node);
                      else cellRefs.current.delete(cell.key);
                    }}
                    type="button"
                    tabIndex={cell.key === tabStop ? 0 : -1}
                    aria-pressed={isPicked}
                    aria-label={`${format(cell.date, 'M월 d일')}, ${describe(cell.key)}`}
                    onClick={() => {
                      setFocusKey(cell.key);
                      setPicked(isPicked ? null : cell.key);
                    }}
                    onKeyDown={event => moveFocus(event, cell.key)}
                    className={cn(
                      'ui-focus-ink block rounded-full p-0 transition-[scale,box-shadow] hover:scale-130 motion-reduce:transition-none motion-reduce:hover:scale-100',
                      cellSize,
                      HEAT_CLASSES[getHeatLevel(secondsByDay.get(cell.key) ?? 0)],
                      isPicked && 'ring-2 ring-ink ring-offset-2 ring-offset-white',
                    )}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 text-[13px] text-ink-muted md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4">
        <p role="status" className="m-0">{pickedText}</p>
        <p className="m-0 flex items-center gap-[5px]">
          적음
          {HEAT_CLASSES.map(heat => <span key={heat} aria-hidden="true" className={cn('size-2.5 rounded-full', heat)} />)}
          많음
        </p>
      </div>
    </section>
  );
}
