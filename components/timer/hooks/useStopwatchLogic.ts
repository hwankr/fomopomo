import { useState, useRef, useEffect, useCallback } from 'react';

interface UseStopwatchLogicProps {
  playClickSound: () => void;
  updateStatus: (status: 'studying' | 'paused', task?: string, startTime?: string) => void;
}

export const useStopwatchLogic = ({
  playClickSound,
  updateStatus,
}: UseStopwatchLogicProps) => {
  const [stopwatchTime, setStopwatchTime] = useState(0);
  const [isStopwatchRunning, setIsStopwatchRunning] = useState(false);
  const stopwatchRef = useRef<NodeJS.Timeout | null>(null);
  const stopwatchStartTimeRef = useRef<number>(0);

  // Stopwatch interval
  useEffect(() => {
    if (isStopwatchRunning) {
      if (!stopwatchRef.current) {
        stopwatchRef.current = setInterval(() => {
          const now = Date.now();
          // To account for drift/pauses, logic usually relies on start time
          const elapsed = Math.floor((now - stopwatchStartTimeRef.current) / 1000);
          setStopwatchTime(elapsed);
        }, 200);
      }
    } else {
      if (stopwatchRef.current) {
        clearInterval(stopwatchRef.current);
        stopwatchRef.current = null;
      }
    }
    return () => {
      if (stopwatchRef.current) clearInterval(stopwatchRef.current);
    };
  }, [isStopwatchRunning]);

  const toggleStopwatch = useCallback(() => {
    playClickSound();

    if (isStopwatchRunning) {
      // Pause
      setIsStopwatchRunning(false);
      updateStatus('paused');
    } else {
      // Start
      // Recalculate start time based on current accumulated time
      const start = Date.now() - (stopwatchTime * 1000);
      stopwatchStartTimeRef.current = start;
      setIsStopwatchRunning(true);
      updateStatus('studying', undefined, new Date(start).toISOString());
    }
  }, [isStopwatchRunning, stopwatchTime, playClickSound, updateStatus]);

  const resetStopwatch = useCallback(() => {
    setIsStopwatchRunning(false);
    setStopwatchTime(0);
  }, []);

  return {
    stopwatchTime,
    isStopwatchRunning,
    setStopwatchTime,
    setIsStopwatchRunning,
    toggleStopwatch,
    resetStopwatch,
    stopwatchStartTimeRef,
  };
};
