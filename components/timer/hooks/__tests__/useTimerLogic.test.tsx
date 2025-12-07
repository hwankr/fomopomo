import { renderHook, act } from '@testing-library/react';
import { useTimerLogic } from '../useTimerLogic';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Settings } from '../useSettings';

// Mock dependencies
const mockPlayClickSound = vi.fn();
const mockUpdateStatus = vi.fn();
const mockOnTimerComplete = vi.fn();

const defaultSettings: Settings = {
  pomoTime: 25,
  shortBreak: 5,
  longBreak: 15,
  longBreakInterval: 4,
  autoStartPomos: false,
  autoStartBreaks: false,
  volume: 0.5,
  isMuted: false,
  taskPopupEnabled: true,
  presets: []
};

describe('useTimerLogic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPlayClickSound.mockClear();
    mockUpdateStatus.mockClear();
    mockOnTimerComplete.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with default states', () => {
    const { result } = renderHook(() =>
      useTimerLogic({
        settings: defaultSettings,
        onTimerCompleteRef: { current: mockOnTimerComplete },
        playClickSound: mockPlayClickSound,
        updateStatus: mockUpdateStatus,
      })
    );

    expect(result.current.timerMode).toBe('focus');
    expect(result.current.timeLeft).toBe(25 * 60);
    expect(result.current.isRunning).toBe(false);
  });

  it('should start timer and decrease time', () => {
    const { result } = renderHook(() =>
      useTimerLogic({
        settings: defaultSettings,
        onTimerCompleteRef: { current: mockOnTimerComplete },
        playClickSound: mockPlayClickSound,
        updateStatus: mockUpdateStatus,
      })
    );

    act(() => {
      result.current.toggleTimer();
    });

    expect(result.current.isRunning).toBe(true);
    expect(mockPlayClickSound).toHaveBeenCalled();

    // Advance by 1 second
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Since the logic relies on Date.now(), we need to advance system time too
    // vi.advanceTimersByTime handles this automatically if configured, or checks intervals
    // but the hook uses `Date.now()` inside the interval.
    // Vitest's fake timers should mock Date.now() as well.
    
    // The hook updates every 200ms.
    // 1000ms passed -> timeLeft should be 25*60 - 1
    
    expect(result.current.timeLeft).toBeCloseTo(25 * 60 - 1, 0);
  });

  it('should call onTimerComplete when time runs out', () => {
    const { result } = renderHook(() =>
      useTimerLogic({
        settings: { ...defaultSettings, pomoTime: 0.1 }, // 6 seconds
        onTimerCompleteRef: { current: mockOnTimerComplete },
        playClickSound: mockPlayClickSound,
        updateStatus: mockUpdateStatus,
      })
    );

    // Set time explicitly or trust init? 0.1 min = 6 sec
    expect(result.current.timeLeft).toBe(6);

    act(() => {
      result.current.toggleTimer();
    });

    act(() => {
      vi.advanceTimersByTime(6500); // 6.5s to be safe
    });

    expect(result.current.timeLeft).toBe(0);
    expect(result.current.isRunning).toBe(false);
    expect(mockOnTimerComplete).toHaveBeenCalled();
  });

  it('should pause and resume without losing time', () => {
    const { result } = renderHook(() =>
      useTimerLogic({
        settings: defaultSettings,
        onTimerCompleteRef: { current: mockOnTimerComplete },
        playClickSound: mockPlayClickSound,
        updateStatus: mockUpdateStatus,
      })
    );

    // Start
    act(() => {
      result.current.toggleTimer();
    });
    
    // Advance 10 seconds
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    
    expect(result.current.timeLeft).toBeCloseTo(25 * 60 - 10, 0);

    // Pause
    act(() => {
      result.current.toggleTimer();
    });
    expect(result.current.isRunning).toBe(false);
    expect(mockUpdateStatus).toHaveBeenCalledWith('paused');

    // Wait 5 seconds (paused)
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Time should not change
    expect(result.current.timeLeft).toBeCloseTo(25 * 60 - 10, 0);

    // Resume
    act(() => {
      result.current.toggleTimer();
    });
    expect(result.current.isRunning).toBe(true);

    // Advance 5 more seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Total elapsed should be 15 seconds
    expect(result.current.timeLeft).toBeCloseTo(25 * 60 - 15, 0);
  });

  it('should change functionality when mode switches', () => {
    const { result } = renderHook(() =>
      useTimerLogic({
        settings: defaultSettings, // Short Break is 5 min
        onTimerCompleteRef: { current: mockOnTimerComplete },
        playClickSound: mockPlayClickSound,
        updateStatus: mockUpdateStatus,
      })
    );

    act(() => {
      result.current.changeTimerMode('shortBreak');
    });

    expect(result.current.timerMode).toBe('shortBreak');
    expect(result.current.timeLeft).toBe(5 * 60);

    // Start in break mode
    act(() => {
      result.current.toggleTimer();
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.timeLeft).toBe(5 * 60 - 1);
  });

  it('should reset timer manually', () => {
    const { result } = renderHook(() =>
      useTimerLogic({
        settings: defaultSettings,
        onTimerCompleteRef: { current: mockOnTimerComplete },
        playClickSound: mockPlayClickSound,
        updateStatus: mockUpdateStatus,
      })
    );

    // Start and advance
    act(() => {
      result.current.toggleTimer();
    });
    
    act(() => {
      vi.advanceTimersByTime(60000); // 1 min
    });

    expect(result.current.timeLeft).toBe(24 * 60);

    // Reset
    act(() => {
      result.current.resetTimerManual();
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.timeLeft).toBe(25 * 60);
    expect(result.current.focusLoggedSeconds).toBe(0);
  });
});
