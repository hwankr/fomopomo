import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: unknown; error: { message: string } | null };
type Query = { table: string; filters: Array<[string, string, unknown]>; columns: string; resolve: (result: Result) => void };

const mocks = vi.hoisted(() => ({
  queries: [] as Query[],
  callbacks: [] as Array<() => void>,
  from: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  holidays: vi.fn(async () => [20261009]),
}));

vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from, channel: mocks.channel, removeChannel: mocks.removeChannel } }));
vi.mock('@/actions/holidays', () => ({ getKoreanHolidays: mocks.holidays }));

import Calendar from '../Calendar';
import { useMonthPomodoros } from '../useMonthPomodoros';

const OCTOBER = new Date(2026, 9, 1);
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();

beforeEach(() => {
  mocks.queries.length = 0;
  mocks.callbacks.length = 0;
  mocks.from.mockImplementation((table: string) => {
    const query = { table, filters: [] as Query['filters'], columns: '' };
    const builder: Record<string, unknown> = {
      select: (columns: string) => { query.columns = columns; return builder; },
      eq: (column: string, value: unknown) => { query.filters.push(['eq', column, value]); return builder; },
      gte: (column: string, value: unknown) => { query.filters.push(['gte', column, value]); return builder; },
      lte: (column: string, value: unknown) => { query.filters.push(['lte', column, value]); return builder; },
      then: (onFulfilled: (result: Result) => unknown, onRejected: (reason: unknown) => unknown) =>
        new Promise<Result>((resolve) => { mocks.queries.push({ ...query, resolve }); }).then(onFulfilled, onRejected),
    };
    return builder;
  });
  mocks.channel.mockImplementation(() => {
    const channel = {
      on: (_event: string, _filter: unknown, callback: () => void) => { mocks.callbacks.push(callback); return channel; },
      subscribe: () => channel,
    };
    return channel;
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const answer = async (table: string, data: unknown[], index = 0) => {
  await waitFor(() => expect(mocks.queries.filter((query) => query.table === table).length).toBeGreaterThan(index));
  await act(async () => mocks.queries.filter((query) => query.table === table)[index].resolve({ data, error: null }));
};

describe('useMonthPomodoros', () => {
  it('counts finished batches per study day and planned beads from the month’s unfinished goals', async () => {
    const { result } = renderHook(() => useMonthPomodoros('user-1', OCTOBER));
    expect(result.current).toBeNull();

    await answer('study_sessions', [
      // 9월 30일 공부일에 시작해 10월 1일로 넘어온 배치는 이달에 넣지 않는다.
      { id: 1, mode: 'pomo', session_batch_id: 'edge', created_at: new Date(2026, 9, 1, 4, 59, 59).toISOString() },
      { id: 2, mode: 'pomo', session_batch_id: 'edge', created_at: at(1, 5, 10) },
      { id: 3, mode: 'pomo', session_batch_id: 'a', created_at: at(5, 9) },
      { id: 4, mode: 'pomo', session_batch_id: 'a', created_at: at(5, 9, 1) },
      { id: 5, mode: 'focus', session_batch_id: null, created_at: at(6, 2) }, // 5일 공부일(05:00 전)
      { id: 6, mode: 'pomo', session_batch_id: 'b', task_id: 'goal-3', created_at: at(6, 10) },
      { id: 7, mode: 'stopwatch', session_batch_id: 'c', task_id: 'goal-3', created_at: at(6, 11) },
    ]);
    await answer('tasks', [
      { id: 'goal-3', due_date: '2026-10-06', status: 'todo', estimated_pomodoros: 3 },
      { id: 'finished', due_date: '2026-10-06', status: 'done', estimated_pomodoros: 4 },
      { id: 'no-goal', due_date: '2026-10-07', status: 'in_progress', estimated_pomodoros: null },
    ]);

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(Object.fromEntries(result.current!.days)).toEqual({
      '2026-10-05': { done: 2, planned: 0 },
      '2026-10-06': { done: 1, planned: 2 },
      '2026-10-07': { done: 0, planned: 1 },
    });
    expect(result.current).toMatchObject({ done: 3, planned: 3 });

    const sessions = mocks.queries.find((query) => query.table === 'study_sessions')!;
    expect(sessions.columns).toBe('id, created_at, mode, task_id, session_batch_id, group_id');
    expect(sessions.filters).toEqual([
      ['eq', 'user_id', 'user-1'],
      ['gte', 'created_at', new Date(2026, 8, 30, 5).toISOString()],
      ['lte', 'created_at', new Date(2026, 10, 1, 4, 59, 59, 999).toISOString()],
    ]);
    expect(mocks.queries.find((query) => query.table === 'tasks')!.filters).toEqual([
      ['eq', 'user_id', 'user-1'],
      ['gte', 'due_date', '2026-10-01'],
      ['lte', 'due_date', '2026-10-31'],
    ]);
  });

  it('drops the previous owner’s data at once and ignores their late response', async () => {
    const { result, rerender } = renderHook(({ userId }) => useMonthPomodoros(userId, OCTOBER), { initialProps: { userId: 'A' } });
    await answer('study_sessions', [{ id: 1, mode: 'pomo', created_at: at(5, 9) }]);
    await answer('tasks', []);
    await waitFor(() => expect(result.current?.done).toBe(1));

    act(() => mocks.callbacks[0]());
    await new Promise((resolve) => setTimeout(resolve, 350));
    rerender({ userId: 'B' });
    expect(result.current).toBeNull();
    await answer('study_sessions', [], 2);
    await answer('tasks', [], 2);
    await waitFor(() => expect(result.current).toMatchObject({ done: 0, planned: 0 }));

    // A의 새로 고침 응답이 늦게 와도 B를 덮지 않는다.
    await act(async () => {
      mocks.queries.filter((query) => query.table === 'study_sessions')[1].resolve({ data: [{ id: 9, mode: 'pomo', created_at: at(5, 9) }], error: null });
      mocks.queries.filter((query) => query.table === 'tasks')[1].resolve({ data: [], error: null });
    });
    expect(result.current).toMatchObject({ done: 0 });

    rerender({ userId: '' });
    expect(result.current).toBeNull();
  });

  it('coalesces bursts of realtime changes into one refresh', async () => {
    renderHook(() => useMonthPomodoros('user-1', OCTOBER));
    await answer('study_sessions', []);
    await answer('tasks', []);
    act(() => { mocks.callbacks.forEach((callback) => callback()); mocks.callbacks.forEach((callback) => callback()); });
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(mocks.queries.filter((query) => query.table === 'study_sessions')).toHaveLength(2);
  });
});

describe('Calendar', () => {
  it('marks today, the selection, Sundays and holidays, with at most six beads per day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 27, 12));
    const onSelectDate = vi.fn();
    render(
      <Calendar
        month={OCTOBER}
        selectedDate={new Date(2026, 9, 27)}
        onSelectDate={onSelectDate}
        days={new Map([
          ['2026-10-27', { done: 8, planned: 2 }],
          ['2026-10-28', { done: 2, planned: 3 }],
        ])}
      />
    );

    const today = screen.getByRole('button', { name: '10월 27일 화요일, 끝낸 뽀모도로 8개, 남은 계획 2개, 오늘' });
    expect(today).toHaveAttribute('aria-current', 'date');
    expect(today).toHaveAttribute('aria-pressed', 'true');
    expect([...today.querySelectorAll('.ui-bead')].map((bead) => bead.getAttribute('data-state'))).toEqual(Array(6).fill('done'));

    const tomorrow = screen.getByRole('button', { name: '10월 28일 수요일, 끝낸 뽀모도로 2개, 남은 계획 3개' });
    expect(tomorrow).toHaveAttribute('aria-pressed', 'false');
    expect([...tomorrow.querySelectorAll('.ui-bead')].map((bead) => bead.getAttribute('data-state')))
      .toEqual(['done', 'done', 'planned', 'planned', 'planned']);

    expect(screen.getAllByRole('button')).toHaveLength(31);
    expect(screen.getByText('25')).toHaveClass('text-pomo');
    expect(screen.getByText('26')).toHaveClass('text-ink');
    expect(await screen.findByRole('button', { name: '10월 9일 금요일, 공휴일' })).toBeInTheDocument();
    expect(screen.getByText('9')).toHaveClass('text-pomo');

    tomorrow.click();
    expect(onSelectDate).toHaveBeenCalledWith(new Date(2026, 9, 28));
  });
});

describe('Calendar month motion', () => {
  // happy-dom에는 Web Animations가 없으므로 element.animate를 흉내 내 누가 무엇을 재생했는지 본다.
  const animate = vi.fn<(keyframes: Keyframe[], options?: KeyframeAnimationOptions) => Animation>(() => ({}) as Animation);
  beforeEach(() => {
    animate.mockClear();
    Object.defineProperty(Element.prototype, 'animate', { value: animate, configurable: true, writable: true });
  });
  afterEach(() => {
    delete (Element.prototype as { animate?: unknown }).animate;
    vi.restoreAllMocks();
  });

  const view = (month: Date, selectedDate = new Date(2026, 9, 5)) => (
    <Calendar month={month} selectedDate={selectedDate} onSelectDate={() => {}} />
  );

  it('slides only the new month’s days in from the side the user moved to, never on first render', () => {
    const { rerender } = render(view(OCTOBER));
    expect(animate).not.toHaveBeenCalled();

    rerender(view(new Date(2026, 10, 1)));
    expect(animate).toHaveBeenCalledTimes(1);
    const [keyframes, options] = animate.mock.calls[0];
    expect(keyframes).toEqual([{ opacity: 0, transform: 'translateX(6px)', offset: 0 }]);
    expect(options).toMatchObject({ duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    // 날짜 칸 격자만 움직이고 요일 줄은 그대로다.
    const grid = animate.mock.contexts[0] as HTMLElement;
    expect(grid).toContainElement(screen.getByRole('button', { name: '11월 1일 일요일' }));
    expect(grid).not.toHaveTextContent('월화수');

    rerender(view(OCTOBER));
    expect(animate).toHaveBeenCalledTimes(2);
    expect(animate.mock.calls[1][0]).toEqual([{ opacity: 0, transform: 'translateX(-6px)', offset: 0 }]);

    // 같은 달을 다시 그릴 때(날 고르기 등)는 움직이지 않는다.
    rerender(view(OCTOBER, new Date(2026, 9, 6)));
    expect(animate).toHaveBeenCalledTimes(2);
  });

  it('does not move with reduced motion', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'), media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }) as MediaQueryList);
    const { rerender } = render(view(OCTOBER));
    rerender(view(new Date(2026, 10, 1)));
    expect(screen.getByRole('button', { name: '11월 1일 일요일' })).toBeInTheDocument();
    expect(animate).not.toHaveBeenCalled();
  });
});
