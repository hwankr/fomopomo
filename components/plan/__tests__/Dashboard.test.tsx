import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { format } from 'date-fns';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { pending, callbacks, supabaseMock } = vi.hoisted(() => {
  const pending: Array<{ resolve: (value: unknown) => void }> = [];
  const callbacks: Array<() => void> = [];
  const supabaseMock = {
    from: vi.fn(() => {
      const query: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'gte', 'lte']) query[method] = () => query;
      query.then = (onFulfilled: (value: unknown) => unknown) =>
        new Promise((resolve) => pending.push({ resolve })).then(onFulfilled);
      return query;
    }),
    channel: vi.fn(() => {
      const channel = {
        on: (_event: string, _filter: unknown, callback: () => void) => {
          callbacks.push(callback);
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    }),
    removeChannel: vi.fn(),
  };
  return { pending, callbacks, supabaseMock };
});

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));
vi.mock('@/lib/pushSubscriptionLifecycle', () => ({ signOutWithPushCleanup: vi.fn() }));
vi.mock('@/components/Navbar', () => ({ default: () => null }));
vi.mock('../TaskList', () => ({
  default: ({ dayPomodoros }: { dayPomodoros?: number }) => <p>day pomodoros: {String(dayPomodoros)}</p>,
}));
vi.mock('../Timeline', () => ({ default: () => null }));
vi.mock('../WeeklyPlan', () => ({ default: ({ userId }: { userId: string }) => <p>weekly panel {userId}</p> }));
vi.mock('../MonthlyPlan', () => ({ default: ({ userId }: { userId: string }) => <p>monthly panel {userId}</p> }));
vi.mock('../LongTermTasks', () => ({ default: ({ userId }: { userId: string }) => <p>long-term panel {userId}</p> }));
const monthMock = vi.hoisted(() => ({
  value: null as null | { days: Map<string, { done: number; planned: number }>; done: number; planned: number },
}));
vi.mock('../useMonthPomodoros', () => ({ useMonthPomodoros: () => monthMock.value }));
vi.mock('../Calendar', () => ({
  default: ({ onSelectDate }: { onSelectDate: (date: Date) => void }) => (
    <button onClick={() => {
      const previousDay = new Date();
      previousDay.setDate(previousDay.getDate() - 1);
      onSelectDate(previousDay);
    }}>Select previous day</button>
  ),
}));

import Dashboard from '../Dashboard';

const session = (id: string) => ({ user: { id } }) as Session;
async function reply(index: number, duration: number) {
  await waitFor(() => expect(pending.length).toBeGreaterThan(index));
  await act(async () => pending[index].resolve({ data: [{ duration }], error: null }));
}

beforeEach(() => {
  pending.length = 0;
  callbacks.length = 0;
  supabaseMock.from.mockClear();
  window.localStorage.clear();
  monthMock.value = null;
});
afterEach(cleanup);

describe('Dashboard focus time isolation', () => {
  it('clears focus time synchronously on logout', async () => {
    const { rerender } = render(<Dashboard session={session('A')} />);
    await reply(0, 3600);
    expect(screen.getByText('집중 1시간')).toBeInTheDocument();
    rerender(<Dashboard session={null} />);
    expect(screen.queryByText(/^집중/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '로그인하고 계획을 세워 보세요' })).toBeInTheDocument();
  });

  it('does not apply the previous account response after the new account loads', async () => {
    const { rerender } = render(<Dashboard session={session('A')} />);
    await waitFor(() => expect(pending).toHaveLength(1));
    const oldRefresh = callbacks[0];
    rerender(<Dashboard session={session('B')} />);
    await reply(1, 7200);
    await reply(0, 3600);
    expect(screen.getByText('집중 2시간')).toBeInTheDocument();
    expect(screen.queryByText('집중 1시간')).not.toBeInTheDocument();
    const queryCount = supabaseMock.from.mock.calls.length;
    act(() => oldRefresh());
    expect(supabaseMock.from).toHaveBeenCalledTimes(queryCount);
  });

  it('ignores a previous date response that arrives after the selected date', async () => {
    render(<Dashboard session={session('A')} />);
    await waitFor(() => expect(pending).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Select previous day' }));
    await reply(1, 7200);
    await reply(0, 3600);
    expect(screen.getByText('집중 2시간')).toBeInTheDocument();
    expect(screen.queryByText('집중 1시간')).not.toBeInTheDocument();
  });

  it('keeps the latest refresh when requests for the same date overlap', async () => {
    render(<Dashboard session={session('A')} />);
    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => callbacks[0]());
    await reply(1, 7200);
    await reply(0, 3600);
    expect(screen.getByText('집중 2시간')).toBeInTheDocument();
  });
});

describe('Dashboard layout', () => {
  it('shows a login prompt instead of private sections for guests', () => {
    render(<Dashboard session={null} />);
    expect(screen.getByRole('heading', { name: '로그인하고 계획을 세워 보세요' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Google로 로그인' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: '목표 종류' })).not.toBeInTheDocument();
    expect(screen.queryByText(/^day pomodoros/)).not.toBeInTheDocument();
    expect(pending).toHaveLength(0);
  });

  it('switches goal tabs with the mouse and arrow keys while keeping every panel mounted', () => {
    render(<Dashboard session={session('A')} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(tab => tab.textContent)).toEqual(['주간 목표', '월간 목표', '장기 과제']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('weekly panel A');
    // 숨긴 패널도 그대로 마운트해 초안과 구독을 지킨다.
    expect(screen.getByText('monthly panel A').closest('[role="tabpanel"]')).toHaveAttribute('hidden');

    fireEvent.click(tabs[2]);
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('long-term panel A');
    expect(window.localStorage.getItem('plan_goal_tab')).toBe('"longTerm"');

    fireEvent.keyDown(tabs[2], { key: 'ArrowRight' });
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveFocus();
    fireEvent.keyDown(tabs[0], { key: 'End' });
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tabs[2], { key: 'ArrowLeft' });
    expect(screen.getByRole('tabpanel')).toHaveTextContent('monthly panel A');
  });

  it('summarizes the visible month and passes the selected day’s pomodoros only when that month is loaded', () => {
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    monthMock.value = { days: new Map([[todayKey, { done: 3, planned: 1 }]]), done: 12, planned: 5 };
    const { rerender } = render(<Dashboard session={session('A')} />);
    expect(screen.getByText('이달 끝낸 뽀모도로 12개, 남은 계획 5개')).toBeInTheDocument();
    expect(screen.getByText('day pomodoros: 3')).toBeInTheDocument();

    monthMock.value = { days: new Map(), done: 0, planned: 0 };
    rerender(<Dashboard session={session('A')} />);
    expect(screen.getByText('이달 기록이 없어요')).toBeInTheDocument();
    expect(screen.getByText('day pomodoros: 0')).toBeInTheDocument();

    // 다른 달로 넘기면 선택한 날의 수는 모른다.
    fireEvent.click(screen.getAllByRole('button', { name: '다음 달' })[0]);
    expect(screen.getByText('day pomodoros: undefined')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '오늘' })[0]);
    expect(screen.getByText('day pomodoros: 0')).toBeInTheDocument();
  });
});

describe('Dashboard motion', () => {
  // happy-dom에는 Web Animations가 없으므로 element.animate를 흉내 낸다.
  const animate = vi.fn<(keyframes: Keyframe[], options?: KeyframeAnimationOptions) => Animation>(() => ({}) as Animation);
  beforeEach(() => {
    animate.mockClear();
    Object.defineProperty(Element.prototype, 'animate', { value: animate, configurable: true, writable: true });
  });
  afterEach(() => {
    delete (Element.prototype as { animate?: unknown }).animate;
  });
  const targets = () => animate.mock.contexts as HTMLElement[];

  it('fades the day plan in only when the user picks another day, and the month name when the month changes', () => {
    render(<Dashboard session={session('A')} />);
    expect(animate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Select previous day' }));
    expect(targets()).toEqual([screen.getByRole('region', { name: '선택한 날의 계획' })]);
    expect(animate.mock.calls[0][0]).toEqual([{ opacity: 0, offset: 0 }]);

    const label = screen.getByRole('heading', { level: 1 });
    fireEvent.click(screen.getAllByRole('button', { name: '다음 달' })[0]);
    expect(targets()).toEqual([screen.getByRole('region', { name: '선택한 날의 계획' }), label]);
    expect(animate.mock.calls[1][0]).toEqual([{ opacity: 0, offset: 0 }]);
  });

  it('fades a goal panel in only after the user switches tabs', () => {
    window.localStorage.setItem('plan_goal_tab', '"monthly"');
    render(<Dashboard session={session('A')} />);
    // 저장된 탭을 불러와 처음 보여 줄 때는 움직이지 않는다.
    expect(screen.getByRole('tabpanel')).toHaveTextContent('monthly panel A');
    expect(screen.getByRole('tabpanel')).not.toHaveClass('animate-fade-in');

    fireEvent.click(screen.getByRole('tab', { name: '장기 과제' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('long-term panel A');
    // hidden이 풀리면 CSS 애니메이션이 처음부터 다시 돈다.
    expect(screen.getByRole('tabpanel')).toHaveClass('animate-fade-in');
    fireEvent.keyDown(screen.getByRole('tab', { name: '장기 과제' }), { key: 'Home' });
    expect(screen.getByRole('tabpanel')).toHaveTextContent('weekly panel A');
    expect(screen.getByRole('tabpanel')).toHaveClass('animate-fade-in');
  });
});
