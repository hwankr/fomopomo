export const getDisplayCycleCount = (
  cycleCount: number,
  longBreakInterval: number
) => {
  if (cycleCount <= 0 || longBreakInterval <= 0) {
    return 0;
  }

  const remainder = cycleCount % longBreakInterval;
  return remainder === 0 ? longBreakInterval : remainder;
};
