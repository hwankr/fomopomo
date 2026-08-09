import { render, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import TimerApp from '../TimerApp';

// Regression tests for the stale post-completion storage state:
// handleTimerComplete used to leave "running focus with an expired deadline
// plus the old interval start" in localStorage, so a refresh during the break
// resurrected the save button and re-saved the already-recorded session
// inflated by the break time. Completion must persist the clean break state,
// and the popup path must park the record in the outbox before the modal
// opens so a refresh cannot lose it.

const mocks = vi.hoisted(() => ({
  timerDisplayProps: [] as Record<string, unknown>[],
  playAlarm: vi.fn(),
  playClickSound: vi.fn(),
  updateStatus: vi.fn(),
  createPendingRecord: vi.fn(),
  savePendingRecord: vi.fn(),
  currentIntervalStartRef: { current: null as number | null },
  stopwatchStartTimeRef: { current: null as number | null },
  settings: {
    pomoTime: 25,
    shortBreak: 5,
    longBreak: 15,
    longBreakInterval: 4,
    autoStartPomos: false,
    autoStartBreaks: false,
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
  createPendingRecord: mocks.createPendingRecord,
  savePendingRecord: mocks.savePendingRecord,
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

const savedFullState = () =>
  JSON.parse(window.localStorage.getItem('fomopomo_full_state') as string);

const fakeRecord = (overrides: Record<string, unknown> = {}) => ({
  sessionId: 'record-1',
  ownerId: 'user-1',
  mode: 'pomo',
  duration: 25 * 60,
  forcedEndTime: 0,
  segments: [{ index: 0, duration: 25 * 60, ended_at: '2026-08-09T12:00:00.000Z' }],
  ...overrides,
});

describe('TimerApp completion persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.createPendingRecord.mockImplementation((mode: string, duration: number, forcedEndTime?: number) =>
      fakeRecord({ mode, duration, forcedEndTime })
    );
    mocks.savePendingRecord.mockResolvedValue('saved');
    mocks.timerDisplayProps.length = 0;
    mocks.currentIntervalStartRef.current = null;
    mocks.settings.taskPopupEnabled = false;
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates and saves the record once at completion, stamped with the real end time', async () => {
    seedRunningFocusTimer(3);

    render(
      <TimerApp settingsUpdated={0} onRecordSaved={vi.fn()} isLoggedIn={true} />
    );

    await act(async () => {
      vi.advanceTimersByTime(3400);
    });

    // The record was created once (freezing content + parking durably) with
    // the timer's real end time, then saved unlabeled.
    expect(mocks.createPendingRecord).toHaveBeenCalledTimes(1);
    expect(mocks.createPendingRecord).toHaveBeenCalledWith(
      'pomo',
      25 * 60,
      expect.any(Number)
    );
    expect(mocks.savePendingRecord).toHaveBeenCalledTimes(1);
    expect(mocks.savePendingRecord).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'pomo', duration: 25 * 60 }),
      '',
      null
    );

    // Storage now holds the post-completion state: a stopped break with no
    // expired deadline, no leftover interval start, and nothing loggable —
    // restoring this state cannot show a save button for the saved session.
    const saved = savedFullState();
    expect(saved.timer.mode).toBe('shortBreak');
    expect(saved.timer.isRunning).toBe(false);
    expect(saved.timer.targetTime).toBeNull();
    expect(saved.timer.timeLeft).toBe(5 * 60);
    expect(saved.timer.loggedSeconds).toBe(0);
    expect(saved.timer.cycleCount).toBe(1);
    expect(saved.intervals).toEqual([]);
    expect(saved.currentIntervalStart).toBeNull();
  });

  it('hands the created record to the task popup instead of saving immediately', async () => {
    mocks.settings.taskPopupEnabled = true;
    seedRunningFocusTimer(3);

    render(
      <TimerApp settingsUpdated={0} onRecordSaved={vi.fn()} isLoggedIn={true} />
    );

    await act(async () => {
      vi.advanceTimersByTime(3400);
    });

    // The popup path still creates (and thereby durably parks) the record,
    // but defers the labeled save to the user's answer.
    expect(mocks.createPendingRecord).toHaveBeenCalledTimes(1);
    expect(mocks.savePendingRecord).not.toHaveBeenCalled();

    // The clean break state is persisted on this path too.
    const saved = savedFullState();
    expect(saved.timer.mode).toBe('shortBreak');
    expect(saved.timer.isRunning).toBe(false);
    expect(saved.timer.targetTime).toBeNull();
  });
});
