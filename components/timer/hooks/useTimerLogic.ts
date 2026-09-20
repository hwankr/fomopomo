import { useState, useRef, useEffect, useCallback } from 'react';
import { Settings } from './useSettings';

export type TimerMode = 'focus' | 'shortBreak' | 'longBreak';

interface UseTimerLogicProps {
  settings: Settings;
  onTimerCompleteRef: React.MutableRefObject<() => void>;
  playClickSound: () => void;
  updateStatus: (status: 'studying' | 'paused' | 'online', task?: string, startTime?: string, elapsed?: number, timerType?: 'timer' | 'stopwatch', timerMode?: 'focus' | 'shortBreak' | 'longBreak', timerDuration?: number) => void;
}

export const useTimerLogic = ({
  settings,
  onTimerCompleteRef,
  playClickSound,
  updateStatus,
}: UseTimerLogicProps) => {
  const [timerMode, setTimerMode] = useState<TimerMode>('focus');
  const [timeLeft, setTimeLeft] = useState(settings.pomoTime * 60);
  // The active session may have been started on a device with different
  // settings. Its elapsed time must use its own original duration.
  const [timerDuration, setTimerDuration] = useState(settings.pomoTime * 60);
  const [isRunning, setIsRunningState] = useState(false);
  // Restart polling even if a pause/resume is batched back to isRunning=true.
  const [runVersion, setRunVersion] = useState(0);
  const [cycleCount, setCycleCount] = useState(0);
  const [focusLoggedSeconds, setFocusLoggedSeconds] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const endTimeRef = useRef<number>(0);
  const runningRef = useRef(false);

  // Browser wakeup events can arrive before React commits a pause/reset.
  // Keep the guard synchronous, including the setter used by session restore.
  const setIsRunning = useCallback((next: React.SetStateAction<boolean>) => {
    const running = typeof next === 'function' ? next(runningRef.current) : next;
    if (running && !runningRef.current) setRunVersion(version => version + 1);
    runningRef.current = running;
    if (!running && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRunningState(running);
  }, []);

  // Re-sync an idle timer when the configured durations change (e.g. the
  // settings modal saves pomoTime 25 -> 50), adjusting state during render —
  // the same idiom as TimerApp's storage-owner reset. Only a timer still
  // sitting at the PREVIOUS settings' full duration for its mode is
  // re-synced: a running or paused session, and partial progress restored
  // from storage, keep their real remaining time — overwriting them would
  // fabricate or destroy elapsed time. TimerApp's restore effect commits
  // after this render, so a restored snapshot always wins over the re-sync.
  const configuredDurations: Record<TimerMode, number> = {
    focus: settings.pomoTime * 60,
    shortBreak: settings.shortBreak * 60,
    longBreak: settings.longBreak * 60,
  };
  const [prevDurations, setPrevDurations] = useState(configuredDurations);
  if (
    prevDurations.focus !== configuredDurations.focus ||
    prevDurations.shortBreak !== configuredDurations.shortBreak ||
    prevDurations.longBreak !== configuredDurations.longBreak
  ) {
    // Consume the change unconditionally: a duration change that arrives
    // mid-session must not be re-applied later against a stale baseline.
    setPrevDurations(configuredDurations);
    if (
      !isRunning &&
      focusLoggedSeconds === 0 &&
      timerDuration === prevDurations[timerMode] &&
      timeLeft === prevDurations[timerMode]
    ) {
      setTimeLeft(configuredDurations[timerMode]);
      setTimerDuration(configuredDurations[timerMode]);
    }
  }

  // Reconcile against the deadline both during normal polling and as soon as
  // a suspended/throttled page returns. This cannot run while the browser is
  // suspended, but it avoids waiting for its next throttled interval on return.
  useEffect(() => {
    if (!isRunning) return;
    let active = true;
    const syncTimer = () => {
      if (!active || !runningRef.current) return;
      const diff = Math.ceil((endTimeRef.current - Date.now()) / 1000);
      if (diff <= 0) {
        // Claim completion before notifying TimerApp: focus, visibility and
        // an already queued interval can all arrive in the same event burst.
        setIsRunning(false);
        setTimeLeft(0);
        onTimerCompleteRef.current();
      } else {
        setTimeLeft(diff);
      }
    };
    const onWake = () => {
      if (document.visibilityState === 'visible') syncTimer();
    };

    timerRef.current = setInterval(syncTimer, 200);
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('pageshow', onWake);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('pageshow', onWake);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRunning, runVersion, onTimerCompleteRef, setIsRunning]);

  // Atomic start transition shared by manual toggles and auto-starts.
  // The fresh deadline MUST be computed before isRunning flips to true:
  // starting with a stale endTimeRef from a completed cycle would make the
  // first interval tick see diff <= 0 and complete the timer instantly.
  // Callers firing from stale closures (e.g. delayed auto-start) pass the
  // intended mode/remaining explicitly instead of relying on current state.
  const startTimer = useCallback((options?: { mode?: TimerMode; remainingSeconds?: number; durationSeconds?: number; task?: string }) => {
    const mode = options?.mode ?? timerMode;
    const duration = options?.durationSeconds ?? (options?.mode === undefined
      ? timerDuration
      : mode === 'focus'
        ? settings.pomoTime * 60
        : mode === 'shortBreak'
          ? settings.shortBreak * 60
          : settings.longBreak * 60);
    const remaining = options?.remainingSeconds ?? timeLeft;

    endTimeRef.current = Date.now() + (remaining * 1000);
    if (options?.mode !== undefined) setTimerMode(options.mode);
    setTimerDuration(duration);
    if (options?.remainingSeconds !== undefined) setTimeLeft(options.remainingSeconds);
    setIsRunning(true);

    // We don't store "start time" for countdown timer in the same way as stopwatch (Date.now() - elapsed),
    // but we can pass the "logical start time" if we wanted to calculate drift,
    // OR just rely on "duration - elapsed" sync.
    // For sync, we need: startTime = Date.now() - (duration - timeLeft)?
    // If we want the client to calc elapsed: Date.now() - startTime.
    // So logical startTime = Date.now() - (elapsed).
    // elapsed = duration - timeLeft.
    const logged = mode === 'focus' ? focusLoggedSeconds : 0;
    const elapsed = Math.max(0, duration - remaining - logged);
    const logicalStart = Date.now() - (elapsed * 1000);

    // Only set status to 'studying' for focus mode (triggers friend notification)
    // Break modes should use 'online' to avoid sending "study started" notification
    const statusForMode = mode === 'focus' ? 'studying' : 'online';
    updateStatus(statusForMode, options?.task, new Date(logicalStart).toISOString(), undefined, 'timer', mode, duration - logged);
  }, [timerMode, timeLeft, timerDuration, focusLoggedSeconds, settings, updateStatus, setIsRunning]);

  // Read the deadline at the interaction itself, not the last 200ms tick.
  // Clear the interval synchronously so a queued completion cannot race a
  // task handoff before React commits its paused state.
  const pauseTimer = useCallback((now = Date.now()) => {
    const remaining = runningRef.current
      ? Math.max(0, Math.ceil((endTimeRef.current - now) / 1000))
      : timeLeft;
    setIsRunning(false);
    setTimeLeft(remaining);
    return remaining;
  }, [timeLeft, setIsRunning]);

  const toggleTimer = useCallback((forceStart = false) => {
    playClickSound();

    if (!forceStart && isRunning) {
      // Pause
      const remaining = pauseTimer();
      const logged = timerMode === 'focus' ? focusLoggedSeconds : 0;
      updateStatus('paused', undefined, undefined, Math.max(0, timerDuration - remaining - logged), 'timer', timerMode, timerDuration - logged);
    } else {
      startTimer();
    }
  }, [isRunning, timerMode, timerDuration, focusLoggedSeconds, playClickSound, updateStatus, startTimer, pauseTimer]);

  const resetTimerManual = useCallback(() => {
    setIsRunning(false);
    let resetTime = 0;
    if (timerMode === "focus") resetTime = settings.pomoTime * 60;
    else if (timerMode === "shortBreak") resetTime = settings.shortBreak * 60;
    else resetTime = settings.longBreak * 60;

    setTimeLeft(resetTime);
    setTimerDuration(resetTime);
    if (timerMode === 'focus') setFocusLoggedSeconds(0);
    return resetTime;
  }, [timerMode, settings, setIsRunning]);

  const changeTimerMode = useCallback((mode: TimerMode) => {
    setIsRunning(false);
    setTimerMode(mode);

    let newTime = 0;
    if (mode === "focus") newTime = settings.pomoTime * 60;
    else if (mode === "shortBreak") newTime = settings.shortBreak * 60;
    else newTime = settings.longBreak * 60;

    setTimeLeft(newTime);
    setTimerDuration(newTime);
    if (mode === 'focus') setFocusLoggedSeconds(0);
    return newTime;
  }, [settings, setIsRunning]);

  return {
    timerMode,
    timeLeft,
    timerDuration,
    isRunning,
    cycleCount,
    focusLoggedSeconds,
    setTimerMode,
    setTimeLeft,
    setTimerDuration,
    setIsRunning,
    setCycleCount,
    setFocusLoggedSeconds,
    startTimer,
    pauseTimer,
    toggleTimer,
    resetTimerManual,
    changeTimerMode,
    endTimeRef
  };
};
