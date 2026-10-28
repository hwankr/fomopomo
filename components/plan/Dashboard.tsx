'use client';

import { useState, useEffect, useId, type KeyboardEvent } from 'react';
import { Session } from '@supabase/supabase-js';
import { addMonths, format, startOfMonth } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Calendar from './Calendar';
import { cn } from '@/lib/utils';
import TaskList from './TaskList';
import Timeline from './Timeline';
import WeeklyPlan from './WeeklyPlan';
import MonthlyPlan from './MonthlyPlan';
import LongTermTasks from './LongTermTasks';
import { supabase } from '@/lib/supabase';
import { getCalendarDayStart, getCalendarDayEnd } from '@/lib/dateUtils';
import { usePersistedState } from '@/hooks/usePersistedState';
import Navbar from '../Navbar';
import MobileTopBar from '@/components/layout/MobileTopBar';
import { usePlanRequestScope } from './usePlanRequestScope';
import { useMonthPomodoros } from './useMonthPomodoros';
import { formatStudyTime } from './planUi';

interface DashboardProps {
  session: Session | null;
}

type GoalTab = 'weekly' | 'monthly' | 'longTerm';

const GOAL_TABS: Array<{ id: GoalTab; label: string }> = [
  { id: 'weekly', label: '주간 목표' },
  { id: 'monthly', label: '월간 목표' },
  { id: 'longTerm', label: '장기 과제' },
];

const signInWithGoogle = () => supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: window.location.origin,
  },
});

export default function Dashboard({ session }: DashboardProps) {
  const userId = session?.user.id ?? '';
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const month = useMonthPomodoros(userId, visibleMonth);
  const timelineTitleId = useId();
  const selectedKey = format(selectedDate, 'yyyy-MM-dd');
  const monthLabel = format(visibleMonth, 'yyyy년 M월');

  const goToday = () => {
    const today = new Date();
    setVisibleMonth(startOfMonth(today));
    setSelectedDate(today);
  };
  const showPreviousMonth = () => setVisibleMonth((current) => addMonths(current, -1));
  const showNextMonth = () => setVisibleMonth((current) => addMonths(current, 1));

  // 선택한 날이 지금 보이는 달에 있을 때만 그날 끝낸 뽀모도로 수를 안다.
  const dayPomodoros = month && selectedKey.startsWith(format(visibleMonth, 'yyyy-MM'))
    ? month.days.get(selectedKey)?.done ?? 0
    : undefined;

  let monthSummary = '';
  if (month) {
    if (month.done) monthSummary = `이달 끝낸 뽀모도로 ${month.done}개${month.planned ? `, 남은 계획 ${month.planned}개` : ''}`;
    else if (month.planned) monthSummary = `이달 남은 계획 ${month.planned}개`;
    else monthSummary = '이달 기록이 없어요';
  }

  return (
    <div className="text-ink">
      <Navbar
        session={session}
        onOpenLogin={signInWithGoogle}
        mobileTopBar={(
          <MobileTopBar
            className="px-4"
            start={(
              <MonthSwitcher
                label={monthLabel}
                onPrevious={showPreviousMonth}
                onNext={showNextMonth}
              />
            )}
            end={(
              <button
                type="button"
                onClick={goToday}
                // 보드 크기(36px)는 그대로 두고 누르는 범위만 44px로 넓힌다.
                className="ui-button-secondary relative min-h-9 rounded-[11px] px-3.5 text-sm after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']"
              >
                오늘
              </button>
            )}
          />
        )}
      />

      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-7 px-4 pt-2.5 pb-12 md:px-10 md:pt-4 md:pb-18">
        <div className="hidden flex-wrap items-center justify-between gap-4 md:flex">
          <div className="flex items-center gap-4">
            <MonthSwitcher
              label={monthLabel}
              onPrevious={showPreviousMonth}
              onNext={showNextMonth}
              large
            />
            <button
              type="button"
              onClick={goToday}
              className="ui-button-secondary min-h-10 px-4"
            >
              오늘
            </button>
          </div>
          {session ? <p className="m-0 text-ink-muted">{monthSummary}</p> : null}
        </div>

        <div className="grid grid-cols-1 gap-y-6 md:gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(380px,452px)] lg:grid-rows-[auto_1fr] lg:gap-x-14">
          <section aria-label="달력" className="min-w-0 lg:col-start-1 lg:row-start-1">
            <Calendar
              month={visibleMonth}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              days={month?.days}
            />
          </section>

          {session ? (
            <>
              <section
                aria-label="선택한 날의 계획"
                className="flex min-w-0 flex-col gap-9 max-md:px-1 md:max-w-[520px] md:gap-10 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-w-none"
              >
                <TaskList selectedDate={selectedDate} userId={userId} dayPomodoros={dayPomodoros} />

                <section aria-labelledby={timelineTitleId} className="flex min-w-0 flex-col gap-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 id={timelineTitleId} className="m-0 text-[17px] font-bold">타임라인</h3>
                    <DailyFocus
                      key={`${userId}:${selectedKey}`}
                      dateKey={selectedKey}
                      userId={userId}
                    />
                  </div>
                  <Timeline selectedDate={selectedDate} userId={userId} />
                </section>
              </section>

              <PlanGoals userId={userId} className="max-md:mt-3 lg:col-start-1 lg:row-start-2" />
            </>
          ) : (
            <GuestPrompt className="lg:col-start-2 lg:row-start-1" />
          )}
        </div>
      </div>
    </div>
  );
}

function MonthSwitcher({ label, onPrevious, onNext, large = false }: {
  label: string;
  onPrevious: () => void;
  onNext: () => void;
  large?: boolean;
}) {
  return (
    <div className={cn('flex items-center', large ? 'gap-2.5' : 'gap-1')}>
      <button
        type="button"
        aria-label="이전 달"
        onClick={onPrevious}
        className={cn('ui-icon-button-surface', large ? 'size-11' : "after:absolute after:-inset-0.5 after:rounded-full after:content-['']")}
      >
        <ChevronLeft aria-hidden="true" className="size-[18px]" strokeWidth={2.2} />
      </button>
      <h1
        aria-live="polite"
        className={cn(
          'm-0 text-center font-extrabold tracking-[-0.02em]',
          large ? 'min-w-[170px] text-[28px]' : 'min-w-32 text-lg'
        )}
      >
        {label}
      </h1>
      <button
        type="button"
        aria-label="다음 달"
        onClick={onNext}
        className={cn('ui-icon-button-surface', large ? 'size-11' : "after:absolute after:-inset-0.5 after:rounded-full after:content-['']")}
      >
        <ChevronRight aria-hidden="true" className="size-[18px]" strokeWidth={2.2} />
      </button>
    </div>
  );
}

function PlanGoals({ userId, className }: { userId: string; className?: string }) {
  const [storedTab, setTab] = usePersistedState<GoalTab>('plan_goal_tab', 'weekly');
  const baseId = useId();
  const activeTab = GOAL_TABS.some((tab) => tab.id === storedTab) ? storedTab : 'weekly';
  const tabId = (tab: GoalTab) => `${baseId}-tab-${tab}`;
  const panelId = (tab: GoalTab) => `${baseId}-panel-${tab}`;

  // 화살표·Home·End로 탭을 옮기고 바로 고른다(WAI-ARIA 탭 패턴).
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = GOAL_TABS.findIndex((tab) => tab.id === activeTab);
    const last = GOAL_TABS.length - 1;
    const next = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setTab(GOAL_TABS[next].id);
    document.getElementById(tabId(GOAL_TABS[next].id))?.focus();
  };

  return (
    <section aria-labelledby={`${baseId}-title`} className={cn('flex min-w-0 flex-col gap-4 md:gap-5', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h2 id={`${baseId}-title`} className="ui-h2">목표</h2>
        <div
          role="tablist"
          aria-label="목표 종류"
          onKeyDown={handleKeyDown}
          className="ui-segmented max-md:[&>button]:h-8 max-md:[&>button]:px-3 max-md:[&>button]:text-[13px]"
        >
          {GOAL_TABS.map((tab) => (
            <button
              key={tab.id}
              id={tabId(tab.id)}
              type="button"
              role="tab"
              aria-selected={tab.id === activeTab}
              aria-controls={panelId(tab.id)}
              tabIndex={tab.id === activeTab ? 0 : -1}
              onClick={() => setTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 모든 패널을 그대로 두어 입력 중인 초안과 실시간 구독을 탭을 바꿔도 유지한다. */}
      {GOAL_TABS.map((tab) => (
        <div
          key={tab.id}
          id={panelId(tab.id)}
          role="tabpanel"
          aria-labelledby={tabId(tab.id)}
          hidden={tab.id !== activeTab}
        >
          {tab.id === 'weekly' ? (
            <WeeklyPlan userId={userId} />
          ) : tab.id === 'monthly' ? (
            <MonthlyPlan userId={userId} />
          ) : (
            <LongTermTasks userId={userId} />
          )}
        </div>
      ))}
    </section>
  );
}

function GuestPrompt({ className }: { className?: string }) {
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className={cn('flex max-w-[452px] min-w-0 flex-col items-start gap-2', className)}>
      <h2 id={titleId} className="m-0 text-[17px] font-extrabold tracking-[-0.01em] md:text-[22px] md:tracking-[-0.02em]">
        로그인하고 계획을 세워 보세요
      </h2>
      <p className="m-0 text-sm text-ink-muted md:text-[15px]">
        할 일과 목표를 정리하면 끝낸 뽀모도로가 달력에 구슬로 쌓여요.
      </p>
      <button
        type="button"
        onClick={() => { void signInWithGoogle(); }}
        className="ui-button-primary ui-press mt-3 rounded-tile px-5"
      >
        Google로 로그인
      </button>
    </section>
  );
}

function DailyFocus({ dateKey, userId }: { dateKey: string; userId: string }) {
  const [focusTime, setFocusTime] = useState(0);
  const scopeRef = usePlanRequestScope();

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope?.active || !userId) return;

    const fetchFocusTime = async () => {
      if (!scope.active) return;
      const request = ++scope.request;
      const selectedDate = new Date(`${dateKey}T05:00:00`);
      // Use 5 AM as day boundary for the selected date
      const start = getCalendarDayStart(selectedDate);
      const end = getCalendarDayEnd(selectedDate);

      const { data } = await supabase
        .from('study_sessions')
        .select('duration')
        .eq('user_id', userId)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());

      if (!scope.active || request !== scope.request) return;
      if (data) {
        const total = data.reduce((acc: number, curr: { duration: number }) => acc + curr.duration, 0);
        setFocusTime(total);
      } else {
        setFocusTime(0);
      }
    };

    fetchFocusTime();

    // Real-time subscription
    const channel = supabase
      .channel('dashboard-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'study_sessions',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchFocusTime();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dateKey, scopeRef, userId]);

  return <p className="m-0 text-sm text-ink-muted">집중 {formatStudyTime(focusTime)}</p>;
}
