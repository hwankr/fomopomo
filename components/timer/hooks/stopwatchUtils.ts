export const STOPWATCH_MAX_RUN_SECONDS = 4 * 60 * 60;

export type StopwatchSnapshot = {
  elapsed: number;
  endTime: number;
  autoPaused: boolean;
};

// The virtual start includes earlier runs; the real run start only changes
// when the user explicitly starts or resumes the stopwatch.
export const getStopwatchSnapshot = (
  startTime: number,
  runStartTime: number,
  now: number
): StopwatchSnapshot => {
  const deadline = runStartTime + STOPWATCH_MAX_RUN_SECONDS * 1000;
  const endTime = Math.max(runStartTime, Math.min(now, deadline));
  return {
    elapsed: Math.max(0, Math.floor((endTime - startTime) / 1000)),
    endTime,
    autoPaused: now >= deadline,
  };
};
