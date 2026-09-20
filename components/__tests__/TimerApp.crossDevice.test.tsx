import { act, render, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TimerApp from '../TimerApp';

// Keep the timer, study-session hook, interval construction and outbox real.
// Only the network/UI/settings boundaries are replaced: assertions inspect
// the actual RPC segments, not the duration passed to a mocked save hook.
const mocks = vi.hoisted(() => ({
  displayProps: [] as Record<string, unknown>[],
  stopwatchProps: [] as Record<string, unknown>[],
  profileUpdates: [] as Record<string, unknown>[],
  from: vi.fn(),
  rpc: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
  setSettings: vi.fn(),
  persistSettings: vi.fn(),
  setSelectedTask: vi.fn(),
  setSelectedTaskId: vi.fn(),
  setSelectedSubjectId: vi.fn(),
  settings: {
    pomoTime: 25, shortBreak: 5, longBreak: 15, longBreakInterval: 4,
    autoStartPomos: false, autoStartBreaks: false,
    volume: 0.5, isMuted: true, taskPopupEnabled: false,
    tasks: [], presets: [],
  },
  playAlarm: vi.fn(),
  playClickSound: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mocks.from,
    rpc: (...args: unknown[]) => ({ setHeader: () => mocks.rpc(...args) }),
    auth: { getUser: mocks.getUser, getSession: mocks.getSession },
  },
}));
vi.mock('@/components/timer/hooks/useSettings', () => ({
  useSettings: () => ({ settings: mocks.settings, setSettings: mocks.setSettings, persistSettings: mocks.persistSettings }),
}));
vi.mock('@/components/timer/hooks/settingsStore', () => ({ readSettingsSnapshot: () => mocks.settings }));
vi.mock('@/components/timer/hooks/useSound', () => ({
  useSound: () => ({ playAlarm: mocks.playAlarm, playClickSound: mocks.playClickSound }),
}));
vi.mock('@/components/timer/hooks/useTasks', () => ({
  TASK_STATE_KEY: 'fomopomo_task_state',
  useTasks: () => ({
    dbTasks: [], weeklyPlans: [], monthlyPlans: [], longTermTasks: [],
    selectedTask: '', selectedTaskId: null,
    selectedSubjectId: null,
    setSelectedTask: mocks.setSelectedTask, setSelectedTaskId: mocks.setSelectedTaskId,
    getSelectedTaskTitle: () => '',
    getSelectedTaskSubjectId: () => null,
    setSelectedSubjectId: mocks.setSelectedSubjectId,
  }),
}));
vi.mock('@/components/TaskSidebar', () => ({ default: () => null }));
vi.mock('@/components/timer/ui/TaskModal', () => ({ TaskModal: () => null }));
vi.mock('@/components/timer/ui/StopwatchDisplay', () => ({
  StopwatchDisplay: (props: Record<string, unknown>) => {
    mocks.stopwatchProps.push(props);
    return null;
  },
}));
vi.mock('@/components/timer/ui/ThemeBackground', () => ({ ThemeBackground: () => null }));
vi.mock('@/components/timer/ui/TimerDisplay', () => ({
  TimerDisplay: (props: Record<string, unknown>) => {
    mocks.displayProps.push(props);
    return null;
  },
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), {
    loading: vi.fn(() => 'saving'), success: vi.fn(), error: vi.fn(), dismiss: vi.fn(),
  }),
}));

type Profile = {
  id: string;
  status: string;
  study_start_time: string | null;
  total_stopwatch_time: number;
  timer_type: string;
  timer_mode: string;
  timer_duration: number;
  last_active_at: string;
  is_task_public: boolean;
};
type RpcParams = {
  p_batch_id: string;
  p_segments: { duration: number; ended_at: string }[];
};
const STATE_KEY = 'fomopomo_full_state::user-1';
let profile: Profile | null;
let heldProfileRead: Promise<Profile | null> | null;

const lastProps = () => mocks.displayProps.at(-1)!;
const clickTimer = (name: string) => (lastProps()[name] as () => void)();
const lastStopwatchProps = () => mocks.stopwatchProps.at(-1)!;
const clickStopwatch = (name: string) => (lastStopwatchProps()[name] as () => void)();
const persisted = () => JSON.parse(window.localStorage.getItem(STATE_KEY)!);
const lastRpc = () => mocks.rpc.mock.calls.at(-1)![1] as RpcParams;
const savedSeconds = () => lastRpc().p_segments.reduce((sum, segment) => sum + segment.duration, 0);
const mount = async () => {
  const view = render(<TimerApp settingsUpdated={0} onRecordSaved={vi.fn()} isLoggedIn={true} />);
  await act(async () => {});
  return view;
};
const pausedProfile = (overrides: Partial<Profile> = {}): Profile => ({
  id: 'user-1', status: 'paused', study_start_time: null,
  total_stopwatch_time: 600, timer_type: 'timer', timer_mode: 'focus',
  timer_duration: 1500, last_active_at: new Date().toISOString(),
  is_task_public: true, ...overrides,
});
const seedLocal = (elapsed: number, loggedSeconds: number, lastUpdated: number, duration?: number) => {
  window.localStorage.setItem(STATE_KEY, JSON.stringify({
    ownerUserId: 'user-1', activeTab: 'timer',
    timer: {
      mode: 'focus', duration, isRunning: false, timeLeft: (duration ?? 1500) - elapsed,
      targetTime: null, cycleCount: 0, loggedSeconds,
    },
    stopwatch: { isRunning: false, elapsed: 0, startTime: null },
    intervals: loggedSeconds === elapsed ? [] : [{ start: lastUpdated - (elapsed - loggedSeconds) * 1000, end: lastUpdated }],
    currentIntervalStart: null,
    configuredDurations: { focus: 1500, shortBreak: 300, longBreak: 900 },
    lastUpdated,
  }));
};

// Jump the wall clock like a suspended browser, then allow one polling tick.
// Advancing every 200ms interval for several hours hides delayed-tick bugs.
const jumpStopwatch = async (milliseconds: number) => {
  await act(async () => {
    vi.setSystemTime(Date.now() + milliseconds - 200);
    vi.advanceTimersByTime(200);
  });
};
const startFreshStopwatch = async () => {
  profile = null;
  const view = await mount();
  await act(async () => view.getByRole('button', { name: /^스톱워치$/ }).click());
  await act(async () => clickStopwatch('onToggleStopwatch'));
  return view;
};

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-06T12:00:00') });
  vi.clearAllMocks();
  mocks.settings = { ...mocks.settings, pomoTime: 25 };
  window.localStorage.clear();
  mocks.displayProps.length = 0;
  mocks.stopwatchProps.length = 0;
  mocks.profileUpdates.length = 0;
  heldProfileRead = null;
  profile = pausedProfile();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://handoff.supabase.co');
  window.localStorage.setItem('sb-handoff-auth-token', JSON.stringify({ user: { id: 'user-1' } }));
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' }, access_token: 'owner-token' } }, error: null });
  mocks.rpc.mockImplementation(async (_name: string, args: RpcParams) => ({
    data: { status: 'saved', total_seconds: args.p_segments.reduce((sum, segment) => sum + segment.duration, 0) },
    error: null,
  }));
  mocks.from.mockImplementation((table: string) => {
    expect(table).toBe('profiles');
    let patch: Partial<Profile> | null = null;
    let columns = '';
    const filters: ((row: Profile) => boolean)[] = [];
    const query = {
      select: vi.fn((value: string) => { columns = value; return query; }),
      update: vi.fn((value: Partial<Profile>) => { patch = value; mocks.profileUpdates.push(value); return query; }),
      eq: vi.fn((key: keyof Profile, value: unknown) => { filters.push(row => row[key] === value); return query; }),
      in: vi.fn((key: keyof Profile, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; }),
      is: vi.fn((key: keyof Profile, value: unknown) => { filters.push(row => row[key] === value); return query; }),
      single: vi.fn(async () => {
        if (columns === 'is_task_public') return { data: { is_task_public: true }, error: null };
        if (heldProfileRead) return { data: await heldProfileRead, error: null };
        // Let an earlier presence update commit, like a fast UPDATE preceding
        // the session SELECT, so mount-time state clobbering is observable.
        await Promise.resolve();
        return { data: profile ? { ...profile } : null, error: null };
      }),
      then: (resolve: (result: { data: null; error: null }) => void) => {
        if (profile && patch && filters.every(filter => filter(profile!))) Object.assign(profile, patch);
        resolve({ data: null, error: null });
      },
    };
    return query;
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('TimerApp stopwatch continuous-run auto-pause', () => {
  it('imports only B remaining portion after A was already recorded by a source-device handoff', async () => {
    // Source: a25min pomodoro saved A20min, then ran B1min. Its public
    // duration/start now describe only B5min; A never enters this ledger.
    profile = pausedProfile({ timer_duration: 300, total_stopwatch_time: 60 });
    await mount();
    expect(lastProps()).toMatchObject({ timeLeft: 240, isRunning: false });
    await act(async () => clickTimer('onToggleTimer'));
    await jumpStopwatch(240_000);
    expect(savedSeconds()).toBe(300);
    expect(persisted().timer).toMatchObject({ mode: 'shortBreak', cycleCount: 1 });
  });

  const maxRunSeconds = 4 * 60 * 60;
  const maxRunMilliseconds = maxRunSeconds * 1000;
  const overdueMilliseconds = maxRunMilliseconds + 3_600_000;

  it('pauses exactly at four hours and saves only through the deadline', async () => {
    const startedAt = Date.now();
    await startFreshStopwatch();

    await jumpStopwatch(maxRunMilliseconds - 1000);
    expect(lastStopwatchProps().stopwatchTime).toBe(maxRunSeconds - 1);
    expect(lastStopwatchProps().isStopwatchRunning).toBe(true);
    await jumpStopwatch(1000);

    expect(lastStopwatchProps().stopwatchTime).toBe(maxRunSeconds);
    expect(lastStopwatchProps().isStopwatchRunning).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    await act(async () => clickStopwatch('onSaveStopwatch'));
    expect(savedSeconds()).toBe(maxRunSeconds);
    expect(lastRpc().p_segments.at(-1)?.ended_at).toBe(new Date(startedAt + maxRunMilliseconds).toISOString());
  });

  it('allows more than four accumulated hours when a manual pause resets the continuous run', async () => {
    const startedAt = Date.now();
    await startFreshStopwatch();
    await jumpStopwatch(3_600_000);
    await act(async () => clickStopwatch('onToggleStopwatch'));
    await jumpStopwatch(1_800_000);
    await act(async () => clickStopwatch('onToggleStopwatch'));
    await jumpStopwatch(3_600_000);

    expect(lastStopwatchProps().stopwatchTime).toBe(7200);
    expect(lastStopwatchProps().isStopwatchRunning).toBe(true);
    await jumpStopwatch(7_200_000);
    expect(lastStopwatchProps().stopwatchTime).toBe(maxRunSeconds);
    expect(lastStopwatchProps().isStopwatchRunning).toBe(true);
    await jumpStopwatch(3_600_000);
    expect(lastStopwatchProps().stopwatchTime).toBe(3600 + maxRunSeconds);
    expect(lastStopwatchProps().isStopwatchRunning).toBe(false);
    await act(async () => clickStopwatch('onSaveStopwatch'));

    expect(savedSeconds()).toBe(3600 + maxRunSeconds);
    expect(lastRpc().p_segments).toEqual([
      expect.objectContaining({ duration: 3600, ended_at: new Date(startedAt + 3_600_000).toISOString() }),
      expect.objectContaining({ duration: maxRunSeconds, ended_at: new Date(startedAt + 5_400_000 + maxRunMilliseconds).toISOString() }),
    ]);
  });

  it('clips an overdue manual pause before the browser gets another polling tick', async () => {
    const startedAt = Date.now();
    await startFreshStopwatch();
    vi.setSystemTime(startedAt + overdueMilliseconds);
    await act(async () => clickStopwatch('onToggleStopwatch'));
    expect(lastStopwatchProps().stopwatchTime).toBe(maxRunSeconds);
    expect(lastStopwatchProps().isStopwatchRunning).toBe(false);
    await act(async () => clickStopwatch('onSaveStopwatch'));

    expect(savedSeconds()).toBe(maxRunSeconds);
    expect(lastRpc().p_segments.at(-1)?.ended_at).toBe(new Date(startedAt + maxRunMilliseconds).toISOString());
  });

  it('settles an overdue run once when browser visibility and focus return before a polling tick', async () => {
    const startedAt = Date.now();
    await startFreshStopwatch();
    vi.setSystemTime(startedAt + overdueMilliseconds);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });

    expect(lastStopwatchProps().stopwatchTime).toBe(maxRunSeconds);
    expect(lastStopwatchProps().isStopwatchRunning).toBe(false);
    expect(mocks.profileUpdates.filter(update => update.status === 'paused')).toHaveLength(1);
    await act(async () => clickStopwatch('onSaveStopwatch'));
    expect(savedSeconds()).toBe(maxRunSeconds);
    expect(lastRpc().p_segments).toEqual([
      expect.objectContaining({ duration: maxRunSeconds, ended_at: new Date(startedAt + maxRunMilliseconds).toISOString() }),
    ]);
  });

  it('can resume and save after a delayed automatic pause without counting the inactive gap', async () => {
    const startedAt = Date.now();
    await startFreshStopwatch();
    await jumpStopwatch(overdueMilliseconds);
    expect(lastStopwatchProps().stopwatchTime).toBe(maxRunSeconds);
    expect(lastStopwatchProps().isStopwatchRunning).toBe(false);
    await jumpStopwatch(1_800_000);
    await act(async () => clickStopwatch('onToggleStopwatch'));
    await jumpStopwatch(60_000);
    await act(async () => clickStopwatch('onSaveStopwatch'));

    expect(savedSeconds()).toBe(maxRunSeconds + 60);
    expect(lastRpc().p_segments).toEqual([
      expect.objectContaining({ duration: maxRunSeconds, ended_at: new Date(startedAt + maxRunMilliseconds).toISOString() }),
      expect.objectContaining({ duration: 60, ended_at: new Date(startedAt + overdueMilliseconds + 1_860_000).toISOString() }),
    ]);
  });

  it('recovers an abandoned local run after more than a day and settles it only once across reloads', async () => {
    const startedAt = Date.now();
    const firstView = await startFreshStopwatch();
    firstView.unmount();
    vi.setSystemTime(startedAt + 30 * 3_600_000);
    const restoredView = await mount();

    expect(lastStopwatchProps().stopwatchTime).toBe(maxRunSeconds);
    expect(lastStopwatchProps().isStopwatchRunning).toBe(false);
    expect(persisted().stopwatch.isRunning).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    restoredView.unmount();
    await mount();
    await jumpStopwatch(60_000);
    await act(async () => clickStopwatch('onSaveStopwatch'));

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(savedSeconds()).toBe(maxRunSeconds);
    expect(lastRpc().p_segments).toEqual([
      expect.objectContaining({ duration: maxRunSeconds, ended_at: new Date(startedAt + maxRunMilliseconds).toISOString() }),
    ]);
  });

  it('keeps the original continuous-run deadline when a running local session reloads', async () => {
    const startedAt = Date.now();
    const view = await startFreshStopwatch();
    await jumpStopwatch(maxRunMilliseconds - 1_800_000);
    view.unmount();
    await mount();
    await jumpStopwatch(1_800_000);

    expect(lastStopwatchProps().stopwatchTime).toBe(maxRunSeconds);
    expect(lastStopwatchProps().isStopwatchRunning).toBe(false);
    await act(async () => clickStopwatch('onSaveStopwatch'));
    expect(savedSeconds()).toBe(maxRunSeconds);
    expect(lastRpc().p_segments.at(-1)?.ended_at).toBe(new Date(startedAt + maxRunMilliseconds).toISOString());
  });

  it.each([
    { ledgerOrigin: 'present', continuousSeconds: maxRunSeconds - 1800 },
    { ledgerOrigin: 'missing', continuousSeconds: maxRunSeconds + 3600 },
    { ledgerOrigin: 'null', continuousSeconds: maxRunSeconds + 3600 },
  ])('restores a legacy resumed snapshot with $ledgerOrigin ledger origin after $continuousSeconds seconds', async ({ ledgerOrigin, continuousSeconds }) => {
    profile = null;
    const runStartedAt = Date.now() - continuousSeconds * 1000;
    window.localStorage.setItem(STATE_KEY, JSON.stringify({
      ownerUserId: 'user-1', activeTab: 'stopwatch',
      timer: { mode: 'focus', duration: 1500, isRunning: false, timeLeft: 1500, targetTime: null, cycleCount: 0, loggedSeconds: 0 },
      stopwatch: { isRunning: true, elapsed: 3600, startTime: runStartedAt - 3_600_000 },
      intervals: [{ start: runStartedAt - 5_400_000, end: runStartedAt - 1_800_000 }],
      ...(ledgerOrigin === 'missing' ? {} : { currentIntervalStart: ledgerOrigin === 'null' ? null : runStartedAt }),
      configuredDurations: { focus: 1500, shortBreak: 300, longBreak: 900 },
      lastUpdated: runStartedAt,
    }));
    await mount();
    expect(lastStopwatchProps().stopwatchTime).toBe(3600 + Math.min(continuousSeconds, maxRunSeconds));
    expect(lastStopwatchProps().isStopwatchRunning).toBe(continuousSeconds < maxRunSeconds);
    if (continuousSeconds < maxRunSeconds) await jumpStopwatch((maxRunSeconds - continuousSeconds) * 1000);

    expect(lastStopwatchProps().stopwatchTime).toBe(3600 + maxRunSeconds);
    expect(lastStopwatchProps().isStopwatchRunning).toBe(false);
    await act(async () => clickStopwatch('onSaveStopwatch'));
    expect(savedSeconds()).toBe(3600 + maxRunSeconds);
    expect(lastRpc().p_segments).toEqual([
      expect.objectContaining({ duration: 3600, ended_at: new Date(runStartedAt - 1_800_000).toISOString() }),
      expect.objectContaining({ duration: maxRunSeconds, ended_at: new Date(runStartedAt + maxRunMilliseconds).toISOString() }),
    ]);
  });

  it('imports a resumed remote run using its baseline and preserves the source deadline', async () => {
    const importedAt = Date.now();
    profile = pausedProfile({
      timer_type: 'stopwatch', timer_duration: 0, status: 'studying',
      // One previous hour, followed by a run that is 30 minutes from its limit.
      study_start_time: new Date(importedAt - (3_600_000 + maxRunMilliseconds - 1_800_000)).toISOString(),
      total_stopwatch_time: 3600,
    });
    await mount();
    expect(lastStopwatchProps().stopwatchTime).toBe(3600 + maxRunSeconds - 1800);
    expect(lastStopwatchProps().isStopwatchRunning).toBe(true);
    await jumpStopwatch(1_800_000);

    expect(lastStopwatchProps().stopwatchTime).toBe(3600 + maxRunSeconds);
    expect(lastStopwatchProps().isStopwatchRunning).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    await act(async () => clickStopwatch('onSaveStopwatch'));
    expect(savedSeconds()).toBe(3600 + maxRunSeconds);
    expect(lastRpc().p_segments.at(-1)?.ended_at).toBe(new Date(importedAt + 1_800_000).toISOString());
  });

  it('preserves the automatic pause deadline when another device imports the delayed paused profile', async () => {
    const startedAt = Date.now();
    profile = pausedProfile({ timer_type: 'stopwatch', timer_duration: 0, total_stopwatch_time: 0 });
    const sourceView = await mount();
    await act(async () => sourceView.getByRole('button', { name: /^스톱워치$/ }).click());
    await act(async () => clickStopwatch('onToggleStopwatch'));
    await jumpStopwatch(overdueMilliseconds);
    expect(lastStopwatchProps().isStopwatchRunning).toBe(false);

    sourceView.unmount();
    window.localStorage.removeItem(STATE_KEY);
    await mount();
    expect(lastStopwatchProps().stopwatchTime).toBe(maxRunSeconds);
    expect(lastStopwatchProps().isStopwatchRunning).toBe(false);
    await act(async () => clickStopwatch('onSaveStopwatch'));

    expect(savedSeconds()).toBe(maxRunSeconds);
    expect(lastRpc().p_segments.at(-1)?.ended_at).toBe(new Date(startedAt + maxRunMilliseconds).toISOString());
  });

  it('publishes the accumulated baseline and virtual origin on manual resume for another device', async () => {
    profile = pausedProfile({ timer_type: 'stopwatch', timer_duration: 0 });
    await mount();
    await act(async () => clickStopwatch('onToggleStopwatch'));
    await jumpStopwatch(3_600_000);
    await act(async () => clickStopwatch('onToggleStopwatch'));
    expect(profile.total_stopwatch_time).toBe(4200);
    await jumpStopwatch(1_800_000);
    const resumedAt = Date.now();
    await act(async () => clickStopwatch('onToggleStopwatch'));

    expect(mocks.profileUpdates.filter(update => update.status === 'studying').at(-1)).toEqual(expect.objectContaining({
      total_stopwatch_time: 4200,
      study_start_time: new Date(resumedAt - 4_200_000).toISOString(),
    }));
    expect(profile.total_stopwatch_time).toBe(4200);
    expect(new Date(profile.study_start_time!).getTime() + profile.total_stopwatch_time * 1000).toBe(resumedAt);
  });

  it.each([
    { previousSeconds: 3600, continuousHours: 5 },
    { previousSeconds: 0, continuousHours: 30 },
  ])('caps an overdue remote run with $previousSeconds previous seconds after $continuousHours hours', async ({ previousSeconds, continuousHours }) => {
    const importedAt = Date.now();
    const runStartedAt = importedAt - continuousHours * 3_600_000;
    profile = pausedProfile({
      timer_type: 'stopwatch', timer_duration: 0, status: 'offline',
      study_start_time: new Date(runStartedAt - previousSeconds * 1000).toISOString(),
      total_stopwatch_time: previousSeconds,
    });
    await mount();

    expect(lastStopwatchProps().stopwatchTime).toBe(previousSeconds + maxRunSeconds);
    expect(lastStopwatchProps().isStopwatchRunning).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    await act(async () => clickStopwatch('onSaveStopwatch'));
    expect(savedSeconds()).toBe(previousSeconds + maxRunSeconds);
    expect(lastRpc().p_segments.at(-1)?.ended_at).toBe(new Date(runStartedAt + maxRunMilliseconds).toISOString());
  });
});

describe('TimerApp cross-device stopwatch handoff', () => {
  it.each(['paused', 'studying', 'offline'] as const)('saves imported %s ten minutes plus one new minute', async (status) => {
    const importedAt = Date.now();
    profile = pausedProfile({
      timer_type: 'stopwatch', timer_duration: 0, status,
      ...(status !== 'paused' ? {
        study_start_time: new Date(importedAt - 600_000).toISOString(),
        total_stopwatch_time: 0,
      } : {}),
    });
    await mount();
    expect(lastStopwatchProps().stopwatchTime).toBe(600);
    expect(lastStopwatchProps().isStopwatchRunning).toBe(status !== 'paused');
    if (status === 'paused') {
      await act(async () => { vi.advanceTimersByTime(30 * 60_000); });
      await act(async () => clickStopwatch('onToggleStopwatch'));
    }
    await act(async () => { vi.advanceTimersByTime(60_000); });
    await act(async () => clickStopwatch('onSaveStopwatch'));
    expect(savedSeconds()).toBe(660);
    expect(lastRpc().p_segments.some(segment => segment.duration === 600 && new Date(segment.ended_at).getTime() === importedAt)).toBe(true);
    expect(persisted().stopwatch.elapsed).toBe(0);
  });

  it.each(['paused', 'studying'] as const)('persists imported %s stopwatch time before reload without server access', async (status) => {
    profile = pausedProfile({
      timer_type: 'stopwatch', timer_duration: 0, status,
      ...(status === 'studying' ? {
        study_start_time: new Date(Date.now() - 600_000).toISOString(), total_stopwatch_time: 0,
      } : {}),
    });
    const view = await mount();
    expect(persisted().stopwatch.elapsed).toBe(600);
    expect(persisted().intervals).toHaveLength(1);
    view.unmount();
    profile = null;
    await mount();
    expect(lastStopwatchProps().stopwatchTime).toBe(600);
    if (status === 'paused') await act(async () => clickStopwatch('onToggleStopwatch'));
    await act(async () => { vi.advanceTimersByTime(60_000); });
    await act(async () => clickStopwatch('onSaveStopwatch'));
    expect(savedSeconds()).toBe(660);
  });

  it('preserves unfinished local focus when the newer remote profile is a stopwatch', async () => {
    seedLocal(300, 0, Date.now() - 600_000);
    profile = pausedProfile({ timer_type: 'stopwatch', timer_duration: 0 });
    await mount();
    expect(lastProps().timeLeft).toBe(1200);
    expect(mocks.stopwatchProps).toHaveLength(0);
    await act(async () => clickTimer('onSaveTimer'));
    expect(savedSeconds()).toBe(300);
  });
});

describe('TimerApp cross-device focus handoff', () => {
  it('offers the unsaved paused ten minutes for immediate saving', async () => {
    await mount();
    expect(lastProps().timeLeft).toBe(900);
    expect(lastProps().showSaveButton).toBe(true);
    await act(async () => clickTimer('onSaveTimer'));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(savedSeconds()).toBe(600);
  });

  it('records imported ten minutes plus one new minute without counting the paused gap', async () => {
    const pausedAt = Date.now();
    await mount();
    await act(async () => { vi.advanceTimersByTime(30 * 60_000); });
    await act(async () => clickTimer('onToggleTimer'));
    await act(async () => { vi.advanceTimersByTime(60_000); });
    await act(async () => clickTimer('onToggleTimer'));
    await act(async () => clickTimer('onSaveTimer'));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(savedSeconds()).toBe(660);
    expect(lastRpc().p_segments.some(segment => new Date(segment.ended_at).getTime() === pausedAt && segment.duration === 600)).toBe(true);
  });

  it.each(['studying', 'offline'] as const)('continues and saves an active ten-minute session whose presence is %s', async (status) => {
    profile = pausedProfile({
      status, total_stopwatch_time: 0,
      study_start_time: new Date(Date.now() - 600_000).toISOString(),
    });
    await mount();
    expect(lastProps().isRunning).toBe(true);
    expect(lastProps().timeLeft).toBe(900);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    await act(async () => clickTimer('onToggleTimer'));
    await act(async () => clickTimer('onSaveTimer'));
    expect(savedSeconds()).toBe(660);
  });

  it.each(['paused', 'studying'] as const)('keeps imported %s time through a reload even when the server is unavailable', async (status) => {
    profile = pausedProfile(status === 'studying' ? {
      status, total_stopwatch_time: 0,
      study_start_time: new Date(Date.now() - 600_000).toISOString(),
    } : {});
    const view = await mount();
    expect(persisted().timer.loggedSeconds).toBe(0);
    view.unmount();
    profile = null;
    await mount();
    if (status === 'paused') await act(async () => clickTimer('onToggleTimer'));
    await act(async () => { vi.advanceTimersByTime(60_000); });
    await act(async () => clickTimer('onToggleTimer'));
    await act(async () => clickTimer('onSaveTimer'));
    expect(savedSeconds()).toBe(660);
  });

  it.each([3000, 2100])('keeps a remote %s-second session through reload without changing the local default', async (duration) => {
    profile = pausedProfile({ timer_duration: duration });
    const view = await mount();
    expect(lastProps().timeLeft).toBe(duration - 600);
    expect(lastProps().showSaveButton).toBe(true);
    expect(mocks.settings.pomoTime).toBe(25);
    view.unmount();
    profile = null;
    await mount();
    expect(lastProps().timeLeft).toBe(duration - 600);
    expect(lastProps().showSaveButton).toBe(true);
    await act(async () => clickTimer('onToggleTimer'));
    await act(async () => { vi.advanceTimersByTime(60_000); });
    await act(async () => clickTimer('onToggleTimer'));
    await act(async () => clickTimer('onSaveTimer'));
    expect(savedSeconds()).toBe(660);
  });

  it('imports newer progress after restoring a local session with a different duration', async () => {
    seedLocal(300, 0, Date.now() - 600_000, 3000);
    profile = pausedProfile({ timer_duration: 3000 });
    await mount();
    expect(lastProps().timeLeft).toBe(2400);
    expect(persisted().timer.duration).toBe(3000);
    await act(async () => clickTimer('onToggleTimer'));
    await act(async () => { vi.advanceTimersByTime(60_000); });
    await act(async () => clickTimer('onToggleTimer'));
    await act(async () => clickTimer('onSaveTimer'));
    expect(savedSeconds()).toBe(660);
  });

  it('preserves imported progress when remaining time matches the old default and settings change', async () => {
    profile = pausedProfile({ timer_duration: 2100 });
    const view = await mount();
    mocks.settings = { ...mocks.settings, pomoTime: 50 };
    view.rerender(<TimerApp settingsUpdated={1} onRecordSaved={vi.fn()} isLoggedIn={true} />);
    expect(lastProps().timeLeft).toBe(1500);
    expect(lastProps().showSaveButton).toBe(true);
    await act(async () => clickTimer('onSaveTimer'));
    expect(savedSeconds()).toBe(600);
  });

  it('finishes the remote read when settings hydrate while the request is pending', async () => {
    let resolve!: (value: Profile) => void;
    heldProfileRead = new Promise(done => { resolve = done; });
    const view = await mount();
    mocks.settings = { ...mocks.settings, pomoTime: 50 };
    view.rerender(<TimerApp settingsUpdated={1} onRecordSaved={vi.fn()} isLoggedIn={true} />);
    await act(async () => resolve(pausedProfile({ timer_duration: 3000 })));
    expect(lastProps().timeLeft).toBe(2400);
    expect(lastProps().showSaveButton).toBe(true);
    await act(async () => clickTimer('onSaveTimer'));
    expect(savedSeconds()).toBe(600);
  });

  it('subtracts locally consumed minutes when importing a newer continuation', async () => {
    seedLocal(600, 300, Date.now() - 120_000);
    profile = pausedProfile({ total_stopwatch_time: 900 });
    await mount();
    expect(lastProps().timeLeft).toBe(600);
    await act(async () => clickTimer('onToggleTimer'));
    await act(async () => { vi.advanceTimersByTime(60_000); });
    await act(async () => clickTimer('onToggleTimer'));
    await act(async () => clickTimer('onSaveTimer'));
    // 15 elapsed - 5 already consumed + 1 new minute.
    expect(savedSeconds()).toBe(660);
  });

  it('saves the whole imported session once when the countdown completes', async () => {
    profile = pausedProfile({
      status: 'studying', total_stopwatch_time: 0,
      study_start_time: new Date(Date.now() - 600_000).toISOString(),
    });
    await mount();
    await act(async () => { vi.advanceTimersByTime(900_000); });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(savedSeconds()).toBe(1500);
    expect(lastProps().timerMode).toBe('shortBreak');
  });

  it('keeps consumed local minutes from being offered again by a stale remote snapshot', async () => {
    seedLocal(600, 600, Date.now());
    profile = pausedProfile({ last_active_at: new Date(Date.now() - 60_000).toISOString() });
    await mount();
    expect(lastProps().showSaveButton).toBe(false);
    await act(async () => clickTimer('onToggleTimer'));
    await act(async () => { vi.advanceTimersByTime(60_000); });
    await act(async () => clickTimer('onToggleTimer'));
    await act(async () => clickTimer('onSaveTimer'));
    expect(savedSeconds()).toBe(60);
  });

  it('replaces an older unsaved five-minute snapshot with the newer remote ten minutes', async () => {
    seedLocal(300, 0, Date.now() - 600_000);
    await mount();
    await act(async () => clickTimer('onToggleTimer'));
    await act(async () => { vi.advanceTimersByTime(60_000); });
    await act(async () => clickTimer('onToggleTimer'));
    await act(async () => clickTimer('onSaveTimer'));
    expect(savedSeconds()).toBe(660);
  });

  it('does not overwrite a local timer started before the remote read finishes', async () => {
    let resolve!: (value: Profile) => void;
    heldProfileRead = new Promise(done => { resolve = done; });
    await mount();
    await act(async () => clickTimer('onToggleTimer'));
    await act(async () => { vi.advanceTimersByTime(60_000); });
    await act(async () => resolve(pausedProfile()));
    expect(lastProps().isRunning).toBe(true);
    expect(lastProps().timeLeft).toBe(1440);
    await act(async () => clickTimer('onToggleTimer'));
    await act(async () => clickTimer('onSaveTimer'));
    expect(savedSeconds()).toBe(60);
  });
});
