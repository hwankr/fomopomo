import { useState, useRef, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
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
  const [isRunning, setIsRunning] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);
  const [focusLoggedSeconds, setFocusLoggedSeconds] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const endTimeRef = useRef<number>(0);

  // Initialize timer based on mode
  useEffect(() => {
    // Only set initial time if not restored
    // (This might conflict with restore, handling inside restore is better or careful initialization)
  }, []);

  // Timer interval
  useEffect(() => {
    if (isRunning) {
      if (!timerRef.current) {
        timerRef.current = setInterval(() => {
          const now = Date.now();
          const diff = Math.ceil((endTimeRef.current - now) / 1000);
          if (diff <= 0) {
            setTimeLeft(0);
            setIsRunning(false);
            onTimerCompleteRef.current();
          } else {
            setTimeLeft(diff);
          }
        }, 200);
      }
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, onTimerCompleteRef]);

  const toggleTimer = useCallback((forceStart = false) => {
    playClickSound();

    // Calculate duration for the current mode
    const duration = timerMode === 'focus'
      ? settings.pomoTime * 60
      : timerMode === 'shortBreak'
        ? settings.shortBreak * 60
        : settings.longBreak * 60;

    if (!forceStart && isRunning) {
      // Pause
      setIsRunning(false);
      updateStatus('paused', undefined, undefined, duration - timeLeft, 'timer', timerMode, duration);
    } else {
      // Start
      const target = Date.now() + (timeLeft * 1000);
      endTimeRef.current = target;
      setIsRunning(true);
      // We don't store "start time" for countdown timer in the same way as stopwatch (Date.now() - elapsed),
      // but we can pass the "logical start time" if we wanted to calculate drift, 
      // OR just rely on "duration - elapsed" sync. 
      // For sync, we need: startTime = Date.now() - (duration - timeLeft)? 
      // If we want the client to calc elapsed: Date.now() - startTime.
      // So logical startTime = Date.now() - (elapsed).
      // elapsed = duration - timeLeft.
      const elapsed = duration - timeLeft;
      const logicalStart = Date.now() - (elapsed * 1000);
      
      // Only set status to 'studying' for focus mode (triggers friend notification)
      // Break modes should use 'online' to avoid sending "study started" notification
      const statusForMode = timerMode === 'focus' ? 'studying' : 'online';
      updateStatus(statusForMode, undefined, new Date(logicalStart).toISOString(), undefined, 'timer', timerMode, duration);
    }
  }, [isRunning, timeLeft, timerMode, settings, playClickSound, updateStatus]);

  const resetTimerManual = useCallback(() => {
    setIsRunning(false);
    let resetTime = 0;
    if (timerMode === "focus") resetTime = settings.pomoTime * 60;
    else if (timerMode === "shortBreak") resetTime = settings.shortBreak * 60;
    else resetTime = settings.longBreak * 60;

    setTimeLeft(resetTime);
    if (timerMode === 'focus') setFocusLoggedSeconds(0);
  }, [timerMode, settings]);

  const changeTimerMode = useCallback((mode: TimerMode) => {
    if (isRunning) setIsRunning(false);
    setTimerMode(mode);

    let newTime = 0;
    if (mode === "focus") newTime = settings.pomoTime * 60;
    else if (mode === "shortBreak") newTime = settings.shortBreak * 60;
    else newTime = settings.longBreak * 60;

    setTimeLeft(newTime);
    if (mode === 'focus') setFocusLoggedSeconds(0);
  }, [isRunning, settings]);

  return {
    timerMode,
    timeLeft,
    isRunning,
    cycleCount,
    focusLoggedSeconds,
    setTimerMode,
    setTimeLeft,
    setIsRunning,
    setCycleCount,
    setFocusLoggedSeconds,
    toggleTimer,
    resetTimerManual,
    changeTimerMode,
    endTimeRef
  };
};
