import { render, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import TimerApp from '../TimerApp';

// Regression test for the auto-start expired-deadline loop:
// completing a session and auto-starting the next one must recompute the
// deadline before isRunning flips, otherwise the first interval tick sees
// the stale endTimeRef and completes again instantly (looping alarms,
// notifications, cycle changes and fabricated saves).

// Every mocked hook must return render-stable references (like the real
// hooks' useState setters / useRef objects do) — fresh vi.fn() identities on
// each render would re-trigger TimerApp effects that depend on them.
const mocks = vi.hoisted(() => ({
  timerDisplayProps: [] as Record<string, unknown>[],
  playAlarm: vi.fn(),
  playClickSound: vi.fn(),
  updateStatus: vi.fn(),
  currentIntervalStartRef: { current: null as number | null },
  stopwatchStartTimeRef: { current: null as number | null },
  settings: {
    pomoTime: 25,
    shortBreak: 5,
    longBreak: 15,
    longBreakInterval: 4,
    autoStartPomos: false,
    autoStartBreaks: true,
    volume: 0.5,
    isMuted: true,
    taskPopupEnabled: false,
    seasonalEffectEnabled: false,
    tasks: [] as string[],
    presets: [],
  },
  useSettingsResult: null as Record<string, unknown> | null,
  useSoundResult: null as Record<string, unknown> | null,
  useTasksResult: null as Record<string, unknown> | null,
  useStudySessionResult: null as Record<string, unknown> | null,
  useStopwatchLogicResult: null as Record<string, unknown> | null,
}));

mocks.useSettingsResult = {
  settings: mocks.settings,
  setSettings: vi.fn(),
  persistSettings: vi.fn(),
};

mocks.useSoundResult = {
  playAlarm: mocks.playAlarm,
  playClickSound: mocks.playClickSound,
};

mocks.useTasksResult = {
  dbTasks: [],
  weeklyPlans: [],
  monthlyPlans: [],
  selectedTask: '',
  selectedTaskId: null,
  setSelectedTask: vi.fn(),
  setSelectedTaskId: vi.fn(),
  getSelectedTaskTitle: () => '',
};

mocks.useStudySessionResult = {
  isSaving: false,
  intervals: [],
  setIntervals: vi.fn(),
  currentIntervalStartRef: mocks.currentIntervalStartRef,
  updateStatus: mocks.updateStatus,
  saveRecord: vi.fn(),
  checkActiveSession: vi.fn(),
};

mocks.useStopwatchLogicResult = {
  stopwatchTime: 0,
  isStopwatchRunning: false,
  setIsStopwatchRunning: vi.fn(),
  setStopwatchTime: vi.fn(),
  toggleStopwatch: vi.fn(),
  resetStopwatch: vi.fn(),
  stopwatchStartTimeRef: mocks.stopwatchStartTimeRef,
};

vi.mock('@/components/timer/hooks/useSettings', () => ({
  useSettings: () => mocks.useSettingsResult,
}));

vi.mock('@/components/timer/hooks/useSound', () => ({
  useSound: () => mocks.useSoundResult,
}));

vi.mock('@/components/timer/hooks/useTasks', () => ({
  useTasks: () => mocks.useTasksResult,
}));

vi.mock('@/components/timer/hooks/useStudySession', () => ({
  useStudySession: () => mocks.useStudySessionResult,
}));

vi.mock('@/components/timer/hooks/useStopwatchLogic', () => ({
  useStopwatchLogic: () => mocks.useStopwatchLogicResult,
}));

vi.mock('@/components/TaskSidebar', () => ({
  default: () => null,
}));

vi.mock('@/components/timer/ui/TaskModal', () => ({
  TaskModal: () => null,
}));

vi.mock('@/components/timer/ui/TimerDisplay', () => ({
  TimerDisplay: (props: Record<string, unknown>) => {
    mocks.timerDisplayProps.push(props);
    return null;
  },
}));

vi.mock('@/components/timer/ui/StopwatchDisplay', () => ({
  StopwatchDisplay: () => null,
}));

vi.mock('@/components/timer/ui/ThemeBackground', () => ({
  ThemeBackground: () => null,
}));

vi.mock('react-hot-toast', () => {
  const toastFn = Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
  });
  return { default: toastFn };
});

const lastTimerProps = () =>
  mocks.timerDisplayProps[mocks.timerDisplayProps.length - 1];

const seedRunningFocusTimer = (secondsLeft: number) => {
  const now = Date.now();
  window.localStorage.setItem(
    'fomopomo_full_state',
    JSON.stringify({
      activeTab: 'timer',
      timer: {
        mode: 'focus',
        isRunning: true,
        timeLeft: secondsLeft,
        targetTime: now + secondsLeft * 1000,
        cycleCount: 0,
        loggedSeconds: 0,
      },
      stopwatch: { isRunning: false, elapsed: 0, startTime: null },
      intervals: [],
      currentIntervalStart: now,
      lastUpdated: now,
    })
  );
};

describe('TimerApp auto-start (regression: expired deadline loop)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.playAlarm.mockClear();
    mocks.updateStatus.mockClear();
    mocks.timerDisplayProps.length = 0;
    mocks.currentIntervalStartRef.current = null;
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-started break runs on a fresh deadline instead of completing instantly', async () => {
    seedRunningFocusTimer(3);

    render(
      <TimerApp settingsUpdated={0} onRecordSaved={vi.fn()} isLoggedIn={false} />
    );

    // Restore effect picked up the running focus timer
    expect(lastTimerProps().isRunning).toBe(true);
    expect(lastTimerProps().timerMode).toBe('focus');

    // Let the focus session complete
    await act(async () => {
      vi.advanceTimersByTime(3400);
    });
    expect(mocks.playAlarm).toHaveBeenCalledTimes(1);
    expect(lastTimerProps().isRunning).toBe(false);
    expect(lastTimerProps().timerMode).toBe('shortBreak');

    // Auto-start fires 1s after completion
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(lastTimerProps().isRunning).toBe(true);

    // Regression window: with the old bare setIsRunning(true) the first
    // 200ms tick still saw the expired endTimeRef and completed the break
    // instantly (second alarm, mode flip, fabricated save).
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(mocks.playAlarm).toHaveBeenCalledTimes(1);
    expect(lastTimerProps().isRunning).toBe(true);
    expect(lastTimerProps().timerMode).toBe('shortBreak');
    expect(lastTimerProps().timeLeft as number).toBeGreaterThan(5 * 60 - 5);

    // Auto-start persisted a running break with a future deadline
    const saved = JSON.parse(
      window.localStorage.getItem('fomopomo_full_state') as string
    );
    expect(saved.timer.isRunning).toBe(true);
    expect(saved.timer.mode).toBe('shortBreak');
    expect(saved.timer.targetTime).toBeGreaterThan(Date.now());

    // Auto-start reports break status like a manual start would
    expect(mocks.updateStatus).toHaveBeenCalledWith(
      'online',
      undefined,
      expect.any(String),
      undefined,
      'timer',
      'shortBreak',
      5 * 60
    );

    // The break completes exactly once, at its real duration
    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });
    expect(mocks.playAlarm).toHaveBeenCalledTimes(2);
    expect(lastTimerProps().timerMode).toBe('focus');
    expect(lastTimerProps().isRunning).toBe(false); // autoStartPomos is off
  });
});
