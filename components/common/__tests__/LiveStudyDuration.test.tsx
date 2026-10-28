import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDayStart } from '@/lib/dateUtils';
import { formatHoursMinutes, getLiveSeconds, useLiveStudyDuration, useNow } from '../LiveStudyDuration';

describe('LiveStudyDuration helpers', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('formats seconds as hours:minutes', () => {
    expect(formatHoursMinutes(0)).toBe('0:00');
    expect(formatHoursMinutes(59)).toBe('0:00');
    expect(formatHoursMinutes(600)).toBe('0:10');
    expect(formatHoursMinutes(3 * 3600 + 5 * 60 + 59)).toBe('3:05');
    expect(formatHoursMinutes(25 * 3600)).toBe('25:00');
    expect(formatHoursMinutes(-30)).toBe('0:00');
  });

  it('counts live seconds from the later of the start time and the boundary', () => {
    const now = new Date(2026, 9, 28, 12, 0, 0).getTime();
    const since = new Date(2026, 9, 28, 5, 0, 0);

    expect(getLiveSeconds(new Date(2026, 9, 28, 11, 30).toISOString(), since, now)).toBe(30 * 60);
    // 경계(05:00) 전에 시작했으면 경계부터 센다.
    expect(getLiveSeconds(new Date(2026, 9, 28, 4, 0).toISOString(), since, now)).toBe(7 * 3600);
    // 시계가 어긋나 시작이 미래여도 음수가 되지 않는다.
    expect(getLiveSeconds(new Date(2026, 9, 28, 12, 5).toISOString(), since, now)).toBe(0);
  });

  it('defaults the boundary to the current study day start', () => {
    const start = new Date(getDayStart().getTime() - 60 * 60 * 1000).toISOString();
    const now = getDayStart().getTime() + 90 * 1000;
    expect(getLiveSeconds(start, undefined, now)).toBe(90);
  });

  it('ticks useNow every second only while active', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 28, 12, 0, 0));
    const { result, rerender } = renderHook(({ active }) => useNow(active), { initialProps: { active: true } });
    const first = result.current;

    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current - first).toBe(3000);

    rerender({ active: false });
    const paused = result.current;
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current).toBe(paused);
  });

  it('keeps useLiveStudyDuration adding saved seconds to the live part', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 28, 12, 0, 0));
    const start = new Date(2026, 9, 28, 11, 59, 0).toISOString();
    const { result } = renderHook(() => useLiveStudyDuration(start, 100, true));

    expect(result.current).toBe(160);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current).toBe(162);
  });
});
