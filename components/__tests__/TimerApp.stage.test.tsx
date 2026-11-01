import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import toast from 'react-hot-toast';
import HomeClient from '@/app/home-client';
import TimerApp, { type TimerStage } from '../TimerApp';

// The timer stage: mode tabs, the global Space shortcut, the ended banner, the
// quick settings dialog and the stage colour reported to the page. Display
// components are mocked and drive TimerApp through their props; the mode tabs
// and the settings dialog are real.

// Every mocked hook must return render-stable references (like the real
// hooks' useState setters / useRef objects do).
const mocks = vi.hoisted(() => ({
  timerDisplayProps: [] as Record<string, unknown>[],
  stopwatchProps: [] as Record<string, unknown>[],
  playAlarm: vi.fn(),
  playClickSound: vi.fn(),
  playMotion: vi.fn(),
  updateStatus: vi.fn(),
  persistSettings: vi.fn(),
  currentIntervalStartRef: { current: null as number | null },
  stopwatchStartTimeRef: { current: null as number | null },
  stopwatchRunStartTimeRef: { current: null as number | null },
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
    tasks: [] as string[],
    presets: [] as { id: string; label: string; minutes: number }[],
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
  persistSettings: mocks.persistSettings,
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
  selectedSubjectId: null,
  setSelectedTask: vi.fn(),
  setSelectedTaskId: vi.fn(),
  setSelectedSubjectId: vi.fn(),
  getSelectedTaskSubjectId: () => null,
  getSelectedTaskTitle: () => '',
  fetchDbTasks: vi.fn(),
};

mocks.useStudySessionResult = {
  isSaving: false,
  intervals: [],
  setIntervals: vi.fn(),
  currentIntervalStartRef: mocks.currentIntervalStartRef,
  updateStatus: mocks.updateStatus,
  createPendingRecord: vi.fn(),
  savePendingRecord: vi.fn(),
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
  stopwatchRunStartTimeRef: mocks.stopwatchRunStartTimeRef,
};

vi.mock('@/components/timer/hooks/useSettings', () => ({
  useSettings: () => mocks.useSettingsResult,
}));
vi.mock('@/components/timer/hooks/settingsStore', () => ({
  readSettingsSnapshot: () => mocks.settings,
}));
vi.mock('@/components/timer/hooks/useSound', () => ({
  useSound: () => mocks.useSoundResult,
}));
vi.mock('@/components/timer/hooks/useTasks', () => ({
  useTasks: () => mocks.useTasksResult,
  TASK_STATE_KEY: 'fomopomo_task_state',
}));
vi.mock('@/components/timer/hooks/useStudySession', () => ({
  useStudySession: () => mocks.useStudySessionResult,
  MIN_SAVABLE_SECONDS: 10,
}));
vi.mock('@/components/timer/hooks/useStopwatchLogic', () => ({
  useStopwatchLogic: () => mocks.useStopwatchLogicResult,
}));
vi.mock('@/hooks/useStudySubjects', () => ({
  useStudySubjects: () => ({ subjects: [], loading: false, error: null, createSubject: vi.fn() }),
}));
vi.mock('@/components/TaskSidebar', () => ({ default: () => null }));
// 패널·숫자의 한 번 나타남은 Web Animation(playMotion)이다. 무엇을 언제 움직였는지만 본다.
vi.mock('@/components/ui/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/motion')>()),
  playMotion: mocks.playMotion,
}));
vi.mock('@/components/timer/ui/TaskModal', () => ({ TaskModal: () => null }));
vi.mock('@/components/timer/ui/TimerDisplay', () => ({
  TimerDisplay: (props: Record<string, unknown>) => {
    mocks.timerDisplayProps.push(props);
    return <span role="timer" />;
  },
}));
vi.mock('@/components/timer/ui/StopwatchDisplay', () => ({
  StopwatchDisplay: (props: Record<string, unknown>) => {
    mocks.stopwatchProps.push(props);
    return null;
  },
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));
// HomeClient (page container) dependencies. HistoryList is T1b's; this stand-in only
// exposes the sheet collapse contract (collapsed / onToggleCollapsed).
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signInWithOAuth: vi.fn() } } }));
vi.mock('@/hooks/useAuthSession', () => ({ useAuthSession: () => ({ session: null, loading: false }) }));
vi.mock('@/components/Navbar', () => ({ default: () => null }));
vi.mock('@/components/LoginModal', () => ({ default: () => null }));
vi.mock('@/components/HistoryList', () => ({
  default: ({ collapsed, onToggleCollapsed }: { collapsed?: boolean; onToggleCollapsed?: () => void }) => (
    <button type="button" aria-expanded={!collapsed} onClick={onToggleCollapsed}>최근 활동</button>
  ),
}));

const lastTimerProps = () => mocks.timerDisplayProps.at(-1)!;
const call = (name: string) => (lastTimerProps()[name] as () => void)();

const seedRunningFocusTimer = (secondsLeft: number) => {
  const now = Date.now();
  window.localStorage.setItem('fomopomo_full_state', JSON.stringify({
    activeTab: 'timer',
    timer: { mode: 'focus', isRunning: true, timeLeft: secondsLeft, targetTime: now + secondsLeft * 1000, cycleCount: 0, loggedSeconds: 0 },
    stopwatch: { isRunning: false, elapsed: 0, startTime: null },
    intervals: [],
    currentIntervalStart: now,
    lastUpdated: now,
  }));
};

// keydown that bubbles to window like a real key press, so preventDefault is observable.
const pressSpace = (target: Element) => {
  const event = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
  act(() => { target.dispatchEvent(event); });
  return event;
};

const seedEndedFocusTimer = () => {
  const now = Date.now();
  window.localStorage.setItem('fomopomo_full_state', JSON.stringify({
    activeTab: 'timer',
    timer: { mode: 'focus', isRunning: true, timeLeft: 0, targetTime: now - 60_000, cycleCount: 0, loggedSeconds: 0 },
    stopwatch: { isRunning: false, elapsed: 0, startTime: null },
    intervals: [],
    currentIntervalStart: now - 120_000,
    lastUpdated: now - 60_000,
  }));
};

// --- 페이지 무대(HomeClient) 관찰 ---
// 지켜보는 값: 루트(바탕색·전환), 무대(높이 클래스·전환), 최근 활동 시트의 펼침.
type StageFrame = { root: string | null; stage: string | null; expanded: string | null };
const stageElements = (container: Element) => {
  const root = container.firstElementChild!;
  return {
    root: [root, 'class'],
    stage: [root.firstElementChild!, 'class'],
    expanded: [screen.getByRole('button', { name: '최근 활동' }), 'aria-expanded'],
  } as Record<keyof StageFrame, [Element, string]>;
};
// MutationObserver 기록으로, 붙은 뒤 바뀐 순서대로 그 순간의 값을 처음 값부터 되살린다.
const replayStageFrames = (records: MutationRecord[], container: Element): StageFrame[] => {
  const tracked = stageElements(container);
  const keys = Object.keys(tracked) as (keyof StageFrame)[];
  const keyOf = (record: MutationRecord) =>
    keys.find((key) => tracked[key][0] === record.target && tracked[key][1] === record.attributeName);
  const changes = records.filter((record) => record.type === 'attributes' && keyOf(record));
  const frame = {} as StageFrame;
  for (const key of keys) {
    const first = changes.find((record) => keyOf(record) === key);
    frame[key] = first ? first.oldValue : tracked[key][0].getAttribute(tracked[key][1]);
  }
  const frames = [{ ...frame }];
  changes.forEach((record, index) => {
    const key = keyOf(record)!;
    const next = changes.slice(index + 1).find((later) => keyOf(later) === key);
    frame[key] = next ? next.oldValue : tracked[key][0].getAttribute(tracked[key][1]);
    frames.push({ ...frame });
  });
  return frames;
};
const tokens = (className: string | null) => (className ?? '').split(/\s+/);
// 움직일 수 있는 값만: 바탕색, 무대 높이, 시트 펼침.
const stageValues = (frame: StageFrame) => ({
  background: tokens(frame.root).filter((token) => token.startsWith('bg-')),
  minHeight: tokens(frame.stage).filter((token) => token.includes('min-h-')),
  expanded: frame.expanded,
});
const motionOn = (frame: StageFrame) => tokens(frame.root).includes('transition-colors');
const observeAttributes = (target: Element) => {
  const observer = new MutationObserver(() => {});
  observer.observe(target, { subtree: true, childList: true, attributes: true, attributeOldValue: true });
  return observer;
};
// 지금 이 순간의 값(MutationObserver 기록이 아니라 DOM에서 바로 읽는다).
const currentStageFrame = (container: Element): StageFrame => {
  const root = container.firstElementChild;
  const sheet = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '최근 활동');
  return {
    root: root?.getAttribute('class') ?? null,
    stage: root?.firstElementChild?.getAttribute('class') ?? null,
    expanded: sheet?.getAttribute('aria-expanded') ?? null,
  };
};
const gateTokens = ['transition-none!', '[&_*]:transition-none!'];
const gated = (frame: StageFrame) => gateTokens.every((token) => tokens(frame.root).includes(token));
// 화면이 붙는 동기 작업(커밋·레이아웃 효과와 거기서 생긴 동기 다시 그리기)만 마친 순간 = 브라우저가 처음 그릴 수 있는 때.
// act는 효과와 예약된 다시 그리기까지 모두 비우므로, act 밖에서 flushSync로 붙이고 바로 본다.
// rootReads: 그동안 루트의 레이아웃을 읽은(getBoundingClientRect) 순간의 값. 브라우저는 레이아웃을 읽을 때 그때의 값을 계산해 두고
// 그 값이 다음 전환의 출발점이 된다. happy-dom은 스타일을 계산하지 않으므로 읽은 순간의 클래스로 본다.
const mountAtFirstPaint = () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const observer = observeAttributes(container);
  const root = createRoot(container);
  const rootReads: StageFrame[] = [];
  const readLayout = Element.prototype.getBoundingClientRect;
  const layoutSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this === container.firstElementChild) rootReads.push(currentStageFrame(container));
    return readLayout.call(this);
  });
  const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const actEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    flushSync(() => root.render(<HomeClient />));
  } finally {
    env.IS_REACT_ACT_ENVIRONMENT = actEnvironment;
    layoutSpy.mockRestore();
  }
  const frames = replayStageFrames(observer.takeRecords(), container);
  observer.disconnect();
  return { frames, rootReads, unmount: () => act(() => root.unmount()) };
};

const renderTimer = (props: Partial<Parameters<typeof TimerApp>[0]> = {}) =>
  render(<TimerApp onRecordSaved={vi.fn()} isLoggedIn={false} {...props} />);

const tab = (name: string) => screen.getByRole('tab', { name });
const savedState = () => JSON.parse(window.localStorage.getItem('fomopomo_full_state') ?? 'null');
const remount = (view: ReturnType<typeof render>) => {
  view.unmount();
  mocks.timerDisplayProps.length = 0;
  mocks.stopwatchProps.length = 0;
  return renderTimer();
};

describe('TimerApp stage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.timerDisplayProps.length = 0;
    mocks.stopwatchProps.length = 0;
    mocks.currentIntervalStartRef.current = null;
    mocks.settings.pomoTime = 25;
    mocks.settings.autoStartBreaks = false;
    mocks.settings.presets = [];
    mocks.persistSettings.mockResolvedValue(true);
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  describe('Space shortcut', () => {
    it('starts and pauses the timer when focus is on the page', () => {
      renderTimer();
      expect(pressSpace(document.body).defaultPrevented).toBe(true);
      expect(lastTimerProps().isRunning).toBe(true);
      pressSpace(document.body);
      expect(lastTimerProps().isRunning).toBe(false);
    });

    it.each([
      ['a button', () => Object.assign(document.createElement('button'), { textContent: '알림' })],
      ['a link', () => Object.assign(document.createElement('a'), { href: '/plan', textContent: '계획' })],
      ['an element inside a button', () => {
        const button = document.createElement('button');
        button.append(document.createElement('span'));
        return button;
      }],
      ['a text field', () => document.createElement('input')],
      ['a role=checkbox control', () => {
        const checkbox = Object.assign(document.createElement('div'), { tabIndex: 0 });
        checkbox.setAttribute('role', 'checkbox');
        return checkbox;
      }],
      ['a contenteditable region', () => Object.assign(document.createElement('div'), { contentEditable: 'true' })],
    ])('leaves Space to %s', (_label, create) => {
      renderTimer();
      const control = create();
      document.body.append(control);
      const target = control.firstElementChild ?? control;

      const event = pressSpace(target);

      expect(event.defaultPrevented).toBe(false);
      expect(lastTimerProps().isRunning).toBe(false);
    });

    it('leaves Space to the focused mode tab', () => {
      renderTimer();
      const tab = screen.getByRole('tab', { name: '짧은 휴식' });
      tab.focus();
      expect(pressSpace(tab).defaultPrevented).toBe(false);
      expect(lastTimerProps().isRunning).toBe(false);
    });

    it('does nothing while a dialog or popover is open', () => {
      renderTimer();
      act(() => call('onOpenSettings'));
      expect(screen.getByRole('dialog', { name: '타이머 설정' })).toBeInTheDocument();
      expect(pressSpace(document.body).defaultPrevented).toBe(false);
      expect(lastTimerProps().isRunning).toBe(false);

      fireEvent.click(screen.getByRole('button', { name: '취소' }));
      const popover = document.createElement('div');
      popover.setAttribute('data-radix-popper-content-wrapper', '');
      document.body.append(popover);
      expect(pressSpace(document.body).defaultPrevented).toBe(false);
      expect(lastTimerProps().isRunning).toBe(false);
    });

    it('works again while a closed popover is still fading out', () => {
      renderTimer();
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-radix-popper-content-wrapper', '');
      const content = document.createElement('div');
      content.setAttribute('data-state', 'open');
      wrapper.append(content);
      document.body.append(wrapper);
      expect(pressSpace(document.body).defaultPrevented).toBe(false);

      // 닫혀서 퇴장 애니메이션만 남은 팝오버는 열린 층이 아니다.
      content.setAttribute('data-state', 'closed');
      expect(pressSpace(document.body).defaultPrevented).toBe(true);
      expect(lastTimerProps().isRunning).toBe(true);
    });
  });

  describe('mode tabs', () => {
    it('switches timer modes and the stopwatch view from one tablist', () => {
      renderTimer();
      expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('뽀모도로');

      fireEvent.click(screen.getByRole('tab', { name: '짧은 휴식' }));
      expect(lastTimerProps()).toMatchObject({ timerMode: 'shortBreak', timeLeft: 5 * 60 });
      expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('짧은 휴식');
      expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', screen.getByRole('tab', { selected: true }).id);

      fireEvent.click(screen.getByRole('tab', { name: '스톱워치' }));
      expect(mocks.stopwatchProps).not.toHaveLength(0);
      expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('스톱워치');

      fireEvent.click(screen.getByRole('tab', { name: '긴 휴식' }));
      expect(lastTimerProps()).toMatchObject({ timerMode: 'longBreak', timeLeft: 15 * 60 });
    });

    it('does not reset progress when the selected tab is clicked again', () => {
      renderTimer();
      act(() => call('onToggleTimer'));
      act(() => { vi.advanceTimersByTime(30_000); });
      act(() => call('onToggleTimer'));
      const paused = lastTimerProps().timeLeft;
      expect(paused).toBeLessThan(25 * 60);

      fireEvent.click(screen.getByRole('tab', { name: '뽀모도로' }));
      expect(lastTimerProps().timeLeft).toBe(paused);
    });

    // Regression: the stopwatch → timer switch happens in the same event as the
    // save, so the stale render's `tab` used to be persisted.
    it('persists the timer view when a mode is chosen from an empty stopwatch', () => {
      const view = renderTimer();
      fireEvent.click(tab('스톱워치'));
      fireEvent.click(tab('짧은 휴식'));

      expect(savedState()).toMatchObject({ activeTab: 'timer', timer: { mode: 'shortBreak', timeLeft: 5 * 60, isRunning: false } });
      remount(view);
      expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('짧은 휴식');
      expect(lastTimerProps()).toMatchObject({ timerMode: 'shortBreak', timeLeft: 5 * 60 });
      expect(mocks.stopwatchProps).toHaveLength(0);
    });

    it('persists the timer view when a preset is applied from the stopwatch', () => {
      mocks.settings.presets = [{ id: 'preset-50', label: '집중', minutes: 50 }];
      const view = renderTimer();
      fireEvent.click(tab('스톱워치'));
      act(() => { (mocks.stopwatchProps.at(-1)!.onOpenSettings as () => void)(); });
      fireEvent.click(screen.getByRole('button', { name: '집중 50분' }));

      expect(lastTimerProps()).toMatchObject({ timerMode: 'focus', timeLeft: 50 * 60 });
      expect(savedState()).toMatchObject({ activeTab: 'timer', timer: { mode: 'focus', timeLeft: 50 * 60 } });
      remount(view);
      expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('뽀모도로');
      expect(lastTimerProps()).toMatchObject({ timerMode: 'focus', timeLeft: 50 * 60 });
      expect(mocks.stopwatchProps).toHaveLength(0);
    });
  });

  describe('ended banner', () => {
    it('stages the break after a focus session and can keep focusing instead', async () => {
      seedRunningFocusTimer(2);
      renderTimer();
      await act(async () => { vi.advanceTimersByTime(2400); });

      // The break is staged underneath; the screen shows the finished focus phase.
      expect(lastTimerProps()).toMatchObject({
        ended: { mode: 'focus', duration: 25 * 60, cycleCount: 0 },
        timerMode: 'shortBreak', isRunning: false,
      });
      expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('뽀모도로');

      act(() => call('onEndedSecondary'));
      expect(lastTimerProps()).toMatchObject({ ended: null, timerMode: 'focus', isRunning: true, timeLeft: 25 * 60 });
      expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('뽀모도로');
      expect(mocks.playClickSound).toHaveBeenCalled();
    });

    it('starts the staged break from the banner', async () => {
      seedRunningFocusTimer(2);
      renderTimer();
      await act(async () => { vi.advanceTimersByTime(2400); });

      act(() => call('onEndedPrimary'));
      expect(lastTimerProps()).toMatchObject({ ended: null, timerMode: 'shortBreak', isRunning: true });
      expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('짧은 휴식');
    });

    it('shows the staged phase at rest when its tab or the reset button is chosen', async () => {
      seedRunningFocusTimer(2);
      renderTimer();
      await act(async () => { vi.advanceTimersByTime(2400); });

      fireEvent.click(tab('짧은 휴식'));
      expect(lastTimerProps()).toMatchObject({ ended: null, timerMode: 'shortBreak', timeLeft: 5 * 60, isRunning: false });
      expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('짧은 휴식');
    });

    it('offers reset while ended and returns to the staged phase', async () => {
      seedRunningFocusTimer(2);
      renderTimer();
      await act(async () => { vi.advanceTimersByTime(2400); });
      expect(lastTimerProps().showResetButton).toBe(true);

      act(() => call('onResetTimer'));
      expect(lastTimerProps()).toMatchObject({ ended: null, timerMode: 'shortBreak', timeLeft: 5 * 60, isRunning: false });
    });

    it('skips the banner when the next phase starts automatically', async () => {
      mocks.settings.autoStartBreaks = true;
      seedRunningFocusTimer(2);
      renderTimer();
      await act(async () => { vi.advanceTimersByTime(2400); });
      expect(lastTimerProps().ended).toBeNull();
    });

    it('clears the banner when another mode is chosen', async () => {
      seedRunningFocusTimer(2);
      renderTimer();
      await act(async () => { vi.advanceTimersByTime(2400); });
      fireEvent.click(screen.getByRole('tab', { name: '뽀모도로' }));
      expect(lastTimerProps()).toMatchObject({ ended: null, timerMode: 'focus' });
    });
  });

  describe('motion', () => {
    const fadeIn = [{ opacity: 0, offset: 0 }];

    it('lets the new panel fade in once when the user switches modes', () => {
      renderTimer();
      expect(mocks.playMotion).not.toHaveBeenCalled();

      fireEvent.click(tab('짧은 휴식'));
      expect(mocks.playMotion).toHaveBeenCalledTimes(1);
      expect(mocks.playMotion).toHaveBeenLastCalledWith(screen.getByRole('tabpanel'), fadeIn);

      // 이미 고른 탭을 다시 누르면 아무것도 바뀌지 않으므로 움직이지 않는다.
      fireEvent.click(tab('짧은 휴식'));
      expect(mocks.playMotion).toHaveBeenCalledTimes(1);

      fireEvent.click(tab('스톱워치'));
      expect(mocks.playMotion).toHaveBeenCalledTimes(2);
    });

    it('does not move on restore, ticks or a phase that starts by itself', async () => {
      mocks.settings.autoStartBreaks = true;
      seedRunningFocusTimer(2);
      renderTimer();
      await act(async () => { vi.advanceTimersByTime(2400); });
      await act(async () => { vi.advanceTimersByTime(1200); });
      expect(lastTimerProps()).toMatchObject({ timerMode: 'shortBreak', isRunning: true });
      await act(async () => { vi.advanceTimersByTime(3000); });
      expect(mocks.playMotion).not.toHaveBeenCalled();
    });

    it('fades only the digits when the clock is reset', async () => {
      renderTimer();
      act(() => call('onToggleTimer'));
      await act(async () => { vi.advanceTimersByTime(3000); });
      act(() => call('onToggleTimer'));
      expect(mocks.playMotion).not.toHaveBeenCalled();

      act(() => call('onResetTimer'));
      expect(mocks.playMotion).toHaveBeenCalledTimes(1);
      expect(mocks.playMotion).toHaveBeenLastCalledWith(screen.getByRole('timer'), fadeIn);
    });

    it('fades the panel, not the digits, when reset leaves the ended phase for the staged one', async () => {
      seedRunningFocusTimer(2);
      renderTimer();
      await act(async () => { vi.advanceTimersByTime(2400); });
      expect(mocks.playMotion).not.toHaveBeenCalled();

      act(() => call('onResetTimer'));
      expect(mocks.playMotion).toHaveBeenCalledTimes(1);
      expect(mocks.playMotion).toHaveBeenLastCalledWith(screen.getByRole('tabpanel'), fadeIn);
    });

    it('marks a phase that ended on screen as live, but not one restored after the tab was closed', async () => {
      seedRunningFocusTimer(2);
      const view = renderTimer();
      await act(async () => { vi.advanceTimersByTime(2400); });
      expect(lastTimerProps().ended).toMatchObject({ mode: 'focus', live: true });
      view.unmount();

      mocks.timerDisplayProps.length = 0;
      const now = Date.now();
      window.localStorage.setItem('fomopomo_full_state', JSON.stringify({
        activeTab: 'timer',
        timer: { mode: 'focus', isRunning: true, timeLeft: 0, targetTime: now - 60_000, cycleCount: 0, loggedSeconds: 0 },
        stopwatch: { isRunning: false, elapsed: 0, startTime: null },
        intervals: [],
        currentIntervalStart: now - 120_000,
        lastUpdated: now - 60_000,
      }));
      renderTimer();
      await act(async () => {});
      expect(lastTimerProps().ended).toMatchObject({ mode: 'focus' });
      expect((lastTimerProps().ended as { live?: boolean }).live).toBeUndefined();
    });
  });

  it('reports the running tone, busy state and every new start to the page', async () => {
    const onStageChange = vi.fn<(stage: TimerStage) => void>();
    seedRunningFocusTimer(2);
    renderTimer({ onStageChange });
    expect(onStageChange).toHaveBeenLastCalledWith({ tone: 'pomo', busy: true, startCount: 1 });

    await act(async () => { vi.advanceTimersByTime(2400); });
    // Ended is still busy but no new start.
    expect(onStageChange).toHaveBeenLastCalledWith({ tone: null, busy: true, startCount: 1 });

    act(() => call('onEndedPrimary'));
    expect(onStageChange).toHaveBeenLastCalledWith({ tone: 'rest', busy: true, startCount: 2 });

    act(() => call('onToggleTimer'));
    expect(onStageChange).toHaveBeenLastCalledWith({ tone: null, busy: false, startCount: 2 });
    act(() => call('onToggleTimer'));
    expect(onStageChange).toHaveBeenLastCalledWith({ tone: 'rest', busy: true, startCount: 3 });
  });

  it('reports the restored stage first, never the resting one drawn before the restore', () => {
    const onStageChange = vi.fn<(stage: TimerStage) => void>();
    seedRunningFocusTimer(600);
    renderTimer({ onStageChange });
    expect(onStageChange).toHaveBeenNthCalledWith(1, { tone: 'pomo', busy: true, startCount: 1 });
  });

  describe('HomeClient stage when the timer screen mounts', () => {
    // 화면을 옮겨 왔다가 돌아오거나 새로고침할 때: 첫 그림부터 되살린 무대이고, 쉬는 무대에서 바뀌어 가는 전환이 없다.
    it.each([
      { name: 'a running focus timer', seed: () => seedRunningFocusTimer(600), background: ['bg-pomo-tint'] },
      { name: 'a phase that ended while away', seed: seedEndedFocusTimer, background: ['bg-surface'] },
    ])('draws the restored stage of $name from the first paint without moving', ({ seed, background }) => {
      seed();
      const { frames, rootReads, unmount } = mountAtFirstPaint();
      const first = frames.at(-1)!;
      expect(stageValues(first)).toEqual({ background, minHeight: expect.arrayContaining(['md:min-h-[calc(100dvh-72px)]']), expanded: 'false' });
      // 값이 바뀌는 동안에는 전환이 꺼져 있다: 전환이 켜진 모든 순간의 값은 되살린 값과 같다.
      for (const frame of frames.filter(motionOn)) expect(stageValues(frame)).toEqual(stageValues(first));
      // 꺼져 있는 모든 순간에는 루트와 안쪽(무대·시트·타이머) 전환을 함께 끈다. 시트 접힘(.ui-collapse) 같은 안쪽 전환은
      // 루트만 꺼서는 멈추지 않는다.
      const motionOff = frames.filter((frame) => !motionOn(frame));
      expect(motionOff.length).toBeGreaterThan(0);
      for (const frame of motionOff) expect(tokens(frame.root)).toEqual(expect.arrayContaining(gateTokens));
      // 전환을 켜기 전, 되살린 값이 적용되고 전환이 꺼진 채로 루트의 레이아웃을 한 번 읽는다. 그래야 그 값이 전환의 출발점이 되어
      // 켜는 순간 쉬는 무대 값에서 되살린 값으로 가는 전환이 돌지 않는다(home-client.tsx의 강제 레이아웃).
      expect(rootReads.map((read) => ({ gated: gated(read), values: stageValues(read) }))).toContainEqual({
        gated: true,
        values: stageValues(first),
      });
      // 그 뒤 사용자가 할 동작을 위해 전환은 켜 둔다.
      expect(motionOn(first)).toBe(true);
      expect(tokens(first.stage)).toContain('transition-[min-height]');
      unmount();
    });

    it('keeps the resting stage as it was', () => {
      const { frames, unmount } = mountAtFirstPaint();
      const first = frames.at(-1)!;
      expect(stageValues(first)).toEqual({ background: ['bg-surface'], minHeight: expect.arrayContaining(['md:min-h-0']), expanded: 'true' });
      for (const frame of frames) expect(stageValues(frame)).toEqual(stageValues(first));
      expect(motionOn(first)).toBe(true);
      unmount();
    });

    it('still moves the stage, colour and sheet when the user starts the timer', () => {
      const view = render(<HomeClient />);
      const observer = observeAttributes(view.container);
      act(() => call('onToggleTimer'));
      const frames = replayStageFrames(observer.takeRecords(), view.container);
      observer.disconnect();
      expect(stageValues(frames[0])).toMatchObject({ background: ['bg-surface'], expanded: 'true' });
      expect(stageValues(frames.at(-1)!)).toMatchObject({ background: ['bg-pomo-tint'], expanded: 'false' });
      expect(tokens(frames.at(-1)!.stage)).toContain('md:min-h-[calc(100dvh-72px)]');
      expect(frames.every(motionOn)).toBe(true);
      expect(frames.every((frame) => tokens(frame.stage).includes('transition-[min-height]'))).toBe(true);
    });
  });

  describe('quick settings', () => {
    it('saves stepped durations over the stored settings', async () => {
      renderTimer();
      act(() => call('onOpenSettings'));
      fireEvent.click(screen.getByRole('button', { name: '뽀모도로 늘리기' }));
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '저장' })); });

      expect(mocks.persistSettings).toHaveBeenCalledWith(expect.objectContaining({ pomoTime: 26, shortBreak: 5, longBreakInterval: 4 }));
      expect(toast.success).toHaveBeenCalled();
      expect(screen.queryByRole('dialog', { name: '타이머 설정' })).not.toBeInTheDocument();
    });

    it('keeps the dialog open and explains when saving fails', async () => {
      mocks.persistSettings.mockResolvedValue(false);
      renderTimer();
      act(() => call('onOpenSettings'));
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '저장' })); });

      expect(toast.error).toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: '타이머 설정' })).toBeInTheDocument();
    });

    it('can be controlled by the page (mobile top bar)', () => {
      const onSettingsOpenChange = vi.fn();
      const view = renderTimer({ settingsOpen: false, onSettingsOpenChange });
      act(() => call('onOpenSettings'));
      expect(onSettingsOpenChange).toHaveBeenCalledWith(true);

      view.rerender(<TimerApp onRecordSaved={vi.fn()} isLoggedIn={false} settingsOpen onSettingsOpenChange={onSettingsOpenChange} />);
      fireEvent.click(screen.getByRole('button', { name: '취소' }));
      expect(onSettingsOpenChange).toHaveBeenLastCalledWith(false);
    });
  });

  describe('HomeClient activity sheet', () => {
    const sheetToggle = () => screen.getByRole('button', { name: '최근 활동' });

    it('collapses a peeked sheet again when the next phase starts after the ended banner', async () => {
      seedRunningFocusTimer(2);
      render(<HomeClient />);
      expect(sheetToggle()).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(sheetToggle());
      expect(sheetToggle()).toHaveAttribute('aria-expanded', 'true');

      await act(async () => { vi.advanceTimersByTime(2400); });
      expect(lastTimerProps().ended).toMatchObject({ mode: 'focus' });
      // Ended is busy too: the peek the user opened stays open.
      expect(sheetToggle()).toHaveAttribute('aria-expanded', 'true');

      act(() => call('onEndedPrimary'));
      expect(lastTimerProps()).toMatchObject({ timerMode: 'shortBreak', isRunning: true });
      expect(sheetToggle()).toHaveAttribute('aria-expanded', 'false');
    });

    it('collapses a peeked sheet when an ended break is repeated', async () => {
      seedRunningFocusTimer(2);
      render(<HomeClient />);
      await act(async () => { vi.advanceTimersByTime(2400); });
      act(() => call('onEndedPrimary'));
      await act(async () => { vi.advanceTimersByTime(5 * 60 * 1000 + 400); });
      expect(lastTimerProps().ended).toMatchObject({ mode: 'shortBreak' });

      fireEvent.click(sheetToggle());
      expect(sheetToggle()).toHaveAttribute('aria-expanded', 'true');
      act(() => call('onEndedSecondary'));
      expect(lastTimerProps()).toMatchObject({ timerMode: 'shortBreak', isRunning: true });
      expect(sheetToggle()).toHaveAttribute('aria-expanded', 'false');
    });

    it('keeps the sheet open at rest and lets the user hide it', () => {
      render(<HomeClient />);
      expect(sheetToggle()).toHaveAttribute('aria-expanded', 'true');
      fireEvent.click(sheetToggle());
      expect(sheetToggle()).toHaveAttribute('aria-expanded', 'false');
      act(() => call('onToggleTimer'));
      act(() => call('onToggleTimer'));
      // Back at rest the user's choice to hide it still holds.
      expect(sheetToggle()).toHaveAttribute('aria-expanded', 'false');
    });
  });
});
