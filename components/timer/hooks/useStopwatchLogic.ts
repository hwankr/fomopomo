import { useState, useRef, useEffect, useEffectEvent, useCallback } from 'react';
import { getStopwatchSnapshot, type StopwatchSnapshot } from './stopwatchUtils';

interface UseStopwatchLogicProps {
  playClickSound: () => void;
  updateStatus: (status: 'studying' | 'paused', task?: string, startTime?: string, elapsedTime?: number, activityTime?: number) => void;
  onAutoPauseRef: React.MutableRefObject<(snapshot: StopwatchSnapshot) => void>;
}

export const useStopwatchLogic = ({
  playClickSound,
  updateStatus,
  onAutoPauseRef,
}: UseStopwatchLogicProps) => {
  const [stopwatchTime, setStopwatchTime] = useState(0);
  const [isStopwatchRunning, setIsStopwatchRunning] = useState(false);
  const stopwatchRef = useRef<NodeJS.Timeout | null>(null);
  const stopwatchStartTimeRef = useRef<number>(0);
  const stopwatchRunStartTimeRef = useRef<number | null>(null);

  const clearStopwatchInterval = useCallback(() => {
    if (stopwatchRef.current !== null) {
      clearInterval(stopwatchRef.current);
      stopwatchRef.current = null;
    }
  }, []);

  const tick = useEffectEvent(() => {
    const runStart = stopwatchRunStartTimeRef.current;
    if (runStart === null) return;
    const snapshot = getStopwatchSnapshot(stopwatchStartTimeRef.current, runStart, Date.now());
    setStopwatchTime(snapshot.elapsed);
    if (snapshot.autoPaused) {
      // Clear both guards synchronously: delayed ticks/focus events must not
      // close the same interval or update presence twice.
      clearStopwatchInterval();
      stopwatchRunStartTimeRef.current = null;
      setIsStopwatchRunning(false);
      updateStatus('paused', undefined, undefined, snapshot.elapsed, snapshot.endTime);
      onAutoPauseRef.current(snapshot);
    }
  });

  useEffect(() => {
    if (!isStopwatchRunning) return;
    const refresh = () => tick();
    refresh();
    if (stopwatchRunStartTimeRef.current !== null) {
      stopwatchRef.current = setInterval(refresh, 200);
    }
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearStopwatchInterval();
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [isStopwatchRunning, clearStopwatchInterval]);

  const toggleStopwatch = useCallback(() => {
    playClickSound();
    const now = Date.now();

    if (isStopwatchRunning) {
      const runStart = stopwatchRunStartTimeRef.current;
      // A queued user event may still see the previous render after the
      // deadline callback already settled this run.
      if (runStart === null) return null;
      const snapshot = getStopwatchSnapshot(
        stopwatchStartTimeRef.current,
        runStart,
        now
      );
      clearStopwatchInterval();
      stopwatchRunStartTimeRef.current = null;
      setStopwatchTime(snapshot.elapsed);
      setIsStopwatchRunning(false);
      updateStatus('paused', undefined, undefined, snapshot.elapsed, snapshot.endTime);
      return { ...snapshot, isRunning: false };
    }

    const start = now - stopwatchTime * 1000;
    stopwatchStartTimeRef.current = start;
    stopwatchRunStartTimeRef.current = now;
    setIsStopwatchRunning(true);
    // Publish the accumulated baseline too, so another device can recover
    // this run's actual start from the virtual start without a schema change.
    updateStatus('studying', undefined, new Date(start).toISOString(), stopwatchTime);
    return { elapsed: stopwatchTime, endTime: now, autoPaused: false, isRunning: true };
  }, [isStopwatchRunning, stopwatchTime, playClickSound, updateStatus, clearStopwatchInterval]);

  const resetStopwatch = useCallback(() => {
    clearStopwatchInterval();
    stopwatchStartTimeRef.current = 0;
    stopwatchRunStartTimeRef.current = null;
    setIsStopwatchRunning(false);
    setStopwatchTime(0);
  }, [clearStopwatchInterval]);

  return {
    stopwatchTime,
    isStopwatchRunning,
    setStopwatchTime,
    setIsStopwatchRunning,
    toggleStopwatch,
    resetStopwatch,
    stopwatchStartTimeRef,
    stopwatchRunStartTimeRef,
  };
};
