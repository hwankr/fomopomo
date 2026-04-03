import { describe, expect, it } from 'vitest';

import { getDisplayCycleCount } from '../timerDisplayUtils';

describe('getDisplayCycleCount', () => {
  it('returns 0 for an empty cycle count', () => {
    expect(getDisplayCycleCount(0, 4)).toBe(0);
  });

  it('returns the raw count while still within the interval', () => {
    expect(getDisplayCycleCount(1, 4)).toBe(1);
    expect(getDisplayCycleCount(3, 4)).toBe(3);
  });

  it('returns the full interval for exact multiples', () => {
    expect(getDisplayCycleCount(4, 4)).toBe(4);
    expect(getDisplayCycleCount(8, 4)).toBe(4);
  });

  it('wraps back to the first visible slot after skipping a long break', () => {
    expect(getDisplayCycleCount(5, 4)).toBe(1);
  });

  it('returns 0 for invalid intervals', () => {
    expect(getDisplayCycleCount(5, 0)).toBe(0);
  });
});
