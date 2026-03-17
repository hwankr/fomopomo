import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

import { useSettings, type Settings } from '../useSettings';

const DEFAULT_SETTINGS: Settings = {
  pomoTime: 25,
  shortBreak: 5,
  longBreak: 15,
  autoStartBreaks: false,
  autoStartPomos: false,
  longBreakInterval: 4,
  volume: 50,
  isMuted: false,
  taskPopupEnabled: true,
  presets: [
    { id: '1', label: '작업1', minutes: 25 },
    { id: '2', label: '작업2', minutes: 50 },
    { id: '3', label: '작업3', minutes: 90 },
  ],
};

describe('useSettings', () => {
  const upsertMock = vi.fn();
  let dispatchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.localStorage.clear();

    supabaseMock.auth.getUser.mockReset();
    supabaseMock.from.mockReset();
    upsertMock.mockReset();

    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: null },
    });
    supabaseMock.from.mockReturnValue({
      upsert: upsertMock,
    });

    dispatchSpy = vi.spyOn(window, 'dispatchEvent');
  });

  it('returns a stable snapshot reference when settings have not changed', () => {
    window.localStorage.setItem(
      'fomopomo_settings',
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        pomoTime: 30,
        shortBreak: 10,
        longBreak: 20,
        presets: [{ id: '1', label: '집중', minutes: 30 }],
      })
    );

    const { result, rerender } = renderHook(() => useSettings(0));
    const firstSnapshot = result.current.settings;

    rerender();

    expect(result.current.settings).toBe(firstSnapshot);
  });

  it('fills missing values from defaults when stored settings are partial', () => {
    window.localStorage.setItem(
      'fomopomo_settings',
      JSON.stringify({
        pomoTime: 40,
        shortBreak: 8,
        presets: [],
      })
    );

    const { result } = renderHook(() => useSettings(0));

    expect(result.current.settings).toEqual({
      ...DEFAULT_SETTINGS,
      pomoTime: 40,
      shortBreak: 8,
    });
  });

  it('falls back to defaults when localStorage JSON is invalid', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    window.localStorage.setItem('fomopomo_settings', 'not-json');

    const { result } = renderHook(() => useSettings(0));

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('setSettings persists normalized values and dispatches settingsChanged', () => {
    const { result } = renderHook(() => useSettings(0));

    act(() => {
      result.current.setSettings({
        ...DEFAULT_SETTINGS,
        pomoTime: 55,
        taskPopupEnabled: false,
        presets: [],
      });
    });

    const storedSettings = JSON.parse(
      window.localStorage.getItem('fomopomo_settings') ?? '{}'
    ) as Settings;

    expect(storedSettings).toEqual({
      ...DEFAULT_SETTINGS,
      pomoTime: 55,
      taskPopupEnabled: false,
    });
    expect(
      dispatchSpy.mock.calls.some((call: unknown[]) => {
        const event = call[0] as Event | undefined;
        return event instanceof Event
          ? event.type === 'settingsChanged'
          : false;
      })
    ).toBe(true);
  });

  it('persistSettings writes locally before remote upsert when a user exists', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });
    upsertMock.mockImplementation(async () => {
      const currentSettings = JSON.parse(
        window.localStorage.getItem('fomopomo_settings') ?? '{}'
      ) as Settings;
      expect(currentSettings.pomoTime).toBe(45);
      expect(currentSettings.taskPopupEnabled).toBe(false);
      return { error: null };
    });

    const { result } = renderHook(() => useSettings(0));

    await act(async () => {
      await result.current.persistSettings({
        ...DEFAULT_SETTINGS,
        pomoTime: 45,
        taskPopupEnabled: false,
      });
    });

    expect(upsertMock).toHaveBeenCalledWith({
      user_id: 'user-1',
      settings: expect.objectContaining({
        pomoTime: 45,
        taskPopupEnabled: false,
      }),
    });
  });

  it('persistSettings skips remote upsert when there is no authenticated user', async () => {
    const { result } = renderHook(() => useSettings(0));

    await act(async () => {
      await result.current.persistSettings({
        ...DEFAULT_SETTINGS,
        volume: 25,
      });
    });

    const storedSettings = JSON.parse(
      window.localStorage.getItem('fomopomo_settings') ?? '{}'
    ) as Settings;

    expect(storedSettings.volume).toBe(25);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
