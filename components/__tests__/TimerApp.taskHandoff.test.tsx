import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TimerApp from '../TimerApp';
import type { TaskItem } from '../timer/hooks/useTasks';

// Keep the countdown, interval ledger, outbox and RPC serialization real.
const mocks = vi.hoisted(() => ({
  display: {} as Record<string, unknown>,
  sidebar: {} as Record<string, unknown>,
  rpc: vi.fn(), from: vi.fn(), completeTask: vi.fn(), toggleTaskStatus: vi.fn(),
  toggleSubtask: vi.fn(), selectSubtask: vi.fn(), fetchTasks: vi.fn(),
  getUser: vi.fn(), getSession: vi.fn(), errorToast: vi.fn(),
  tasks: [] as TaskItem[],
  updates: [] as Record<string, unknown>[],
  settings: {
    pomoTime: 25, shortBreak: 5, longBreak: 15, longBreakInterval: 4,
    autoStartPomos: false, autoStartBreaks: false, volume: 0.5,
    isMuted: true, taskPopupEnabled: true, tasks: [], presets: [],
  },
}));

vi.mock('@/lib/supabase', () => ({ supabase: {
  from: mocks.from, rpc: (...args: unknown[]) => ({ setHeader: () => mocks.rpc(...args) }),
  auth: { getUser: mocks.getUser, getSession: mocks.getSession },
} }));
vi.mock('@/components/timer/hooks/useSettings', () => ({
  useSettings: () => ({ settings: mocks.settings, setSettings: vi.fn(), persistSettings: vi.fn() }),
}));
vi.mock('@/components/timer/hooks/settingsStore', () => ({ readSettingsSnapshot: () => mocks.settings }));
vi.mock('@/components/timer/hooks/useSound', () => ({
  useSound: () => ({ playAlarm: vi.fn(), playClickSound: vi.fn() }),
}));
vi.mock('@/components/timer/hooks/useTasks', async () => {
  const { useState } = await import('react');
  return {
    TASK_STATE_KEY: 'fomopomo_task_state',
    useTasks: () => {
      const saved = JSON.parse(localStorage.getItem('fomopomo_task_state::user-1') ?? '{}');
      const [selectedTask, setSelectedTask] = useState(saved.taskTitle ?? 'A');
      const [selectedTaskId, setSelectedTaskId] = useState<string | null>(saved.taskId ?? 'a');
      const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(saved.subjectId ?? 'subject-a');
      return {
        dbTasks: mocks.tasks.filter(task => task.kind === 'daily'),
        weeklyPlans: mocks.tasks.filter(task => task.kind === 'weekly'),
        monthlyPlans: mocks.tasks.filter(task => task.kind === 'monthly'), longTermTasks: [],
        selectedTask, setSelectedTask, selectedTaskId, setSelectedTaskId, selectedSubjectId, setSelectedSubjectId,
        getSelectedTaskTitle: () => mocks.tasks.find(task => task.id === selectedTaskId)?.title ?? selectedTask,
        getSelectedTaskSubjectId: () => mocks.tasks.find(task => task.id === selectedTaskId)?.subjectId ?? selectedSubjectId,
        completeTask: mocks.completeTask, toggleTaskStatus: mocks.toggleTaskStatus,
        fetchDbTasks: mocks.fetchTasks, toggleSubtask: mocks.toggleSubtask,
        selectSubtaskForTimer: mocks.selectSubtask, pendingSubtaskIds: new Set(),
      };
    },
  };
});
vi.mock('@/components/TaskSidebar', () => ({
  default: (props: Record<string, unknown>) => { mocks.sidebar = props; return null; },
}));
vi.mock('@/components/timer/ui/TimerDisplay', () => ({
  TimerDisplay: (props: Record<string, unknown>) => { mocks.display = props; return null; },
}));
vi.mock('@/components/timer/ui/TaskModal', () => ({ TaskModal: () => null }));
vi.mock('@/components/timer/ui/StopwatchDisplay', () => ({ StopwatchDisplay: () => null }));
vi.mock('@/components/timer/ui/ThemeBackground', () => ({ ThemeBackground: () => null }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), {
  loading: vi.fn(() => 'save'), success: vi.fn(), error: mocks.errorToast, dismiss: vi.fn(),
}) }));

type Payload = { p_batch_id: string; p_task: string; p_task_id: string; p_subject_id: string; p_segments: { duration: number }[] };
const stateKey = 'fomopomo_full_state::user-1';
const state = () => JSON.parse(localStorage.getItem(stateKey)!);
const payloads = () => mocks.rpc.mock.calls.map(call => call[1] as Payload);
const seconds = (payload: Payload) => payload.p_segments.reduce((sum, segment) => sum + segment.duration, 0);
const click = (name: string) => (mocks.display[name] as () => void)();
const choose = (task: TaskItem | null) => (mocks.sidebar.onSelectTask as (task: TaskItem | null) => void)(task);
const mount = async () => {
  const view = render(<TimerApp settingsUpdated={0} onRecordSaved={vi.fn()} isLoggedIn />);
  await act(async () => {});
  return view;
};
const jump = async (seconds: number) => {
  await act(async () => { vi.setSystemTime(Date.now() + seconds * 1000 - 200); vi.advanceTimersByTime(200); });
};
const pauseAt = (elapsed: number) => {
  localStorage.setItem(stateKey, JSON.stringify({
    ownerUserId: 'user-1', activeTab: 'timer',
    timer: { mode: 'focus', duration: 1500, isRunning: false, timeLeft: 1500 - elapsed, targetTime: null, cycleCount: 0, loggedSeconds: 0 },
    stopwatch: { isRunning: false, elapsed: 0, startTime: null },
    intervals: [{ start: Date.now() - elapsed * 1000, end: Date.now() }], currentIntervalStart: null,
    configuredDurations: { focus: 1500, shortBreak: 300, longBreak: 900 }, lastUpdated: Date.now(),
  }));
};

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-20T12:00:00Z') });
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://handoff.supabase.co');
  localStorage.setItem('sb-handoff-auth-token', JSON.stringify({ user: { id: 'user-1' } }));
  mocks.tasks = [
    { id: 'a', title: 'A', status: 'todo', durationSeconds: 0, kind: 'daily', subjectId: 'subject-a' },
    { id: 'b', title: 'B', status: 'todo', durationSeconds: 0, kind: 'daily', subjectId: 'subject-b' },
  ];
  mocks.updates = [];
  mocks.completeTask.mockResolvedValue(true);
  mocks.fetchTasks.mockResolvedValue(undefined);
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' }, access_token: 'token' } }, error: null });
  mocks.rpc.mockImplementation(async (_: string, args: Payload) => ({
    data: { status: 'saved', total_seconds: seconds(args) }, error: null,
  }));
  mocks.from.mockImplementation(() => {
    let columns = '';
    const query = {
      select: vi.fn((value: string) => { columns = value; return query; }),
      update: vi.fn((patch: Record<string, unknown>) => { mocks.updates.push(patch); return query; }),
      eq: vi.fn(() => query), in: vi.fn(() => query), is: vi.fn(() => query),
      single: vi.fn(async () => ({ data: columns === 'is_task_public' ? { is_task_public: true } : null, error: null })),
      then: (resolve: (result: { data: null; error: null }) => void) => resolve({ data: null, error: null }),
    };
    return query;
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('complete a task and continue the same pomodoro', () => {
  it('records A20 + B5 with their own subjects, pauses selection time and advances one cycle', async () => {
    await mount();
    await act(async () => click('onToggleTimer'));
    await jump(1200);
    await act(async () => click('onCompleteTask'));
    expect(mocks.display.timeLeft).toBe(300);
    expect(mocks.display.isRunning).toBe(false);
    expect(mocks.sidebar.choosingNextTask).toBe(true);
    expect(mocks.completeTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    expect(payloads()[0]).toMatchObject({ p_task: 'A', p_task_id: 'a', p_subject_id: 'subject-a' });
    expect(seconds(payloads()[0])).toBe(1200);
    await jump(120);
    expect(mocks.display.timeLeft).toBe(300);
    await act(async () => choose(mocks.tasks[1]));
    expect(mocks.display.isRunning).toBe(true);
    expect(mocks.display.timeLeft).toBe(300);
    const resumed = mocks.updates.findLast(update => update.status === 'studying')!;
    expect(resumed.timer_duration).toBe(300);
    expect(resumed.current_task).toBe('B');
    expect(new Date(resumed.study_start_time as string).getTime()).toBe(Date.now());
    await jump(300);
    expect(payloads()).toHaveLength(2);
    expect(payloads()[1]).toMatchObject({ p_task: 'B', p_task_id: 'b', p_subject_id: 'subject-b' });
    expect(seconds(payloads()[1])).toBe(300);
    expect(state().timer).toMatchObject({ mode: 'shortBreak', cycleCount: 1, timeLeft: 300, loggedSeconds: 0 });
    expect(state().taskHandoff).toBeNull();
  });

  it('retains paused handoff and A label through closing, waiting and refresh', async () => {
    pauseAt(1200);
    const view = await mount();
    await act(async () => click('onCompleteTask'));
    await act(async () => (mocks.sidebar.onClose as () => void)());
    expect(mocks.sidebar.isOpen).toBe(false);
    await jump(60);
    view.unmount();
    await mount();
    expect(mocks.display).toMatchObject({ timeLeft: 300, isRunning: false, isChoosingNextTask: true, selectedTaskTitle: 'A' });
    await act(async () => click('onToggleTimer'));
    expect(mocks.sidebar.isOpen).toBe(true);
    expect(mocks.display.isRunning).toBe(false);
    await act(async () => choose(mocks.tasks[1]));
    await jump(300);
    expect(payloads().map(seconds)).toEqual([1200, 300]);
  });

  it('freezes failed A save labels, allows B and never recreates A on rapid clicks', async () => {
    pauseAt(1200);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await mount();
    await act(async () => { click('onCompleteTask'); click('onCompleteTask'); });
    expect(payloads()).toHaveLength(1);
    expect(mocks.completeTask).toHaveBeenCalledTimes(1);
    expect(mocks.sidebar.selectionDisabled).toBe(false);
    const drafts = Object.values(JSON.parse(localStorage.getItem('fomopomo_pending_sessions')!));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ task: 'A', taskId: 'a', subjectId: 'subject-a' });
    await act(async () => choose(mocks.tasks[1]));
    await jump(300);
    expect(payloads().map(seconds)).toEqual([1200, 300]);
    expect(payloads()[1].p_task_id).toBe('b');
  });

  it('holds B until explicit task completion succeeds, and retries without another record', async () => {
    pauseAt(1200);
    mocks.completeTask.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await mount();
    await act(async () => click('onCompleteTask'));
    expect(state().taskHandoff.completionPending).toBe(true);
    await act(async () => choose(mocks.tasks[1]));
    expect(mocks.display.isRunning).toBe(false);
    await act(async () => click('onToggleTimer'));
    expect(state().taskHandoff.completionPending).toBe(false);
    expect(payloads()).toHaveLength(1);
    await act(async () => choose(mocks.tasks[1]));
    expect(mocks.display.isRunning).toBe(true);
  });

  it('does not restore a handoff after reset while completion is in flight', async () => {
    pauseAt(1200);
    let resolve!: (value: boolean) => void;
    mocks.completeTask.mockReturnValue(new Promise<boolean>(done => { resolve = done; }));
    await mount();
    await act(async () => click('onCompleteTask'));
    await act(async () => click('onResetTimer'));
    await act(async () => resolve(true));
    expect(state().taskHandoff).toBeNull();
    expect(mocks.display).toMatchObject({ timeLeft: 1500, isRunning: false, isChoosingNextTask: false });
  });

  it('keeps the timer paused if the chooser closes while a new subtask materializes', async () => {
    pauseAt(1200);
    let resolve!: (value: TaskItem) => void;
    mocks.selectSubtask.mockReturnValue(new Promise<TaskItem>(done => { resolve = done; }));
    await mount();
    await act(async () => click('onCompleteTask'));
    let selection!: Promise<TaskItem | null>;
    await act(async () => {
      selection = (mocks.sidebar.onSelectSubtask as (subtask: unknown) => Promise<TaskItem | null>)({ id: 'sub-b', title: 'B' });
    });
    await act(async () => (mocks.sidebar.onClose as () => void)());
    await act(async () => resolve({ ...mocks.tasks[1], sourceSubtaskId: 'sub-b' }));
    expect(await selection).toBeNull();
    expect(mocks.display).toMatchObject({ timeLeft: 300, isRunning: false, isChoosingNextTask: true, selectedTaskTitle: 'A' });
    expect(state().timer.isRunning).toBe(false);
    expect(mocks.sidebar.isOpen).toBe(false);
  });

  it('retries a persisted pending task completion after refresh without recording A again', async () => {
    pauseAt(1200);
    mocks.completeTask.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const view = await mount();
    await act(async () => click('onCompleteTask'));
    view.unmount();
    await mount();
    expect(mocks.completeTask).toHaveBeenCalledTimes(2);
    expect(state().taskHandoff.completionPending).toBe(false);
    expect(payloads()).toHaveLength(1);
    expect(mocks.display).toMatchObject({ timeLeft: 300, isRunning: false });
  });

  it('keeps an offline expired B record labeled when the app reopens after its deadline', async () => {
    pauseAt(1200);
    const view = await mount();
    await act(async () => click('onCompleteTask'));
    await act(async () => choose(mocks.tasks[1]));
    view.unmount();
    vi.setSystemTime(Date.now() + 400_000);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await mount();
    expect(payloads().map(seconds)).toEqual([1200, 300]);
    expect(payloads()[1]).toMatchObject({ p_task: 'B', p_task_id: 'b', p_subject_id: 'subject-b' });
    const drafts = Object.values(JSON.parse(localStorage.getItem('fomopomo_pending_sessions')!));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ task: 'B', taskId: 'b', subjectId: 'subject-b' });
    expect(state().timer).toMatchObject({ mode: 'shortBreak', cycleCount: 1 });
  });

  it.each([0, 60])('keeps ordinary checkbox behavior on an untouched timer with %i stopwatch seconds', async elapsed => {
    pauseAt(0);
    if (elapsed) {
      const saved = state();
      saved.stopwatch.elapsed = elapsed;
      localStorage.setItem(stateKey, JSON.stringify(saved));
    }
    await mount();
    expect(mocks.display.canCompleteTask).toBe(false);
    await act(async () => (mocks.sidebar.onToggleTask as (task: TaskItem) => void)(mocks.tasks[0]));
    expect(mocks.toggleTaskStatus).toHaveBeenCalledWith(mocks.tasks[0]);
    expect(mocks.completeTask).not.toHaveBeenCalled();
    expect(mocks.display.isChoosingNextTask).toBe(false);
  });

  it.each(['daily', 'weekly', 'monthly'] as const)('uses the same handoff for the active %s checkbox', async kind => {
    mocks.tasks[0].kind = kind;
    pauseAt(1200);
    await mount();
    await act(async () => (mocks.sidebar.onToggleTask as (task: TaskItem) => void)(mocks.tasks[0]));
    expect(mocks.completeTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', kind }));
    expect(mocks.toggleTaskStatus).not.toHaveBeenCalled();
    expect(seconds(payloads()[0])).toBe(1200);
  });

  it('routes the active materialized subtask checkbox through handoff', async () => {
    mocks.tasks[0].sourceSubtaskId = 'sub-a';
    pauseAt(1200);
    await mount();
    await act(async () => (mocks.sidebar.onToggleSubtask as (subtask: unknown) => void)({ id: 'sub-a', title: 'A', completed_at: null }));
    expect(mocks.completeTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', sourceSubtaskId: 'sub-a' }));
    expect(mocks.toggleSubtask).not.toHaveBeenCalled();
  });

  it.each([5, 1495])('preserves the running work when a segment would be below ten seconds (%i elapsed)', async elapsed => {
    pauseAt(elapsed);
    await mount();
    await act(async () => click('onCompleteTask'));
    expect(payloads()).toHaveLength(0);
    expect(mocks.completeTask).not.toHaveBeenCalled();
    expect(mocks.display.timeLeft).toBe(1500 - elapsed);
    expect(mocks.errorToast).toHaveBeenCalledWith(expect.stringContaining('10초'));
  });
});
