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
import {
  DEFAULT_FOMOPOMO_SETTINGS,
  SETTINGS_CHANGED_EVENT,
  SETTINGS_KEY,
} from '../settingsStore';

const DEFAULT_SETTINGS: Settings = DEFAULT_FOMOPOMO_SETTINGS;

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
      SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        pomoTime: 30,
        shortBreak: 10,
        longBreak: 20,
        tasks: ['집중'],
        presets: [{ id: '1', label: '집중', minutes: 30 }],
      })
    );

    const { result, rerender } = renderHook(() => useSettings(0));
    const firstSnapshot = result.current.settings;

    rerender();

    expect(result.current.settings).toBe(firstSnapshot);
  });

  it('fills missing values from canonical defaults when stored settings are partial', () => {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        pomoTime: 40,
        shortBreak: 8,
        snowEnabled: false,
        presets: [],
      })
    );

    const { result } = renderHook(() => useSettings(0));

    expect(result.current.settings).toEqual({
      ...DEFAULT_SETTINGS,
      pomoTime: 40,
      shortBreak: 8,
      snowEnabled: false,
    });
  });

  it('falls back to defaults when localStorage JSON is invalid', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    window.localStorage.setItem(SETTINGS_KEY, 'not-json');

    const { result } = renderHook(() => useSettings(0));

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('setSettings persists normalized values and dispatches the shared event', () => {
    const { result } = renderHook(() => useSettings(0));

    act(() => {
      result.current.setSettings({
        ...DEFAULT_SETTINGS,
        pomoTime: 55,
        taskPopupEnabled: false,
        snowEnabled: false,
        tasks: [],
        presets: [],
      });
    });

    const storedSettings = JSON.parse(
      window.localStorage.getItem(SETTINGS_KEY) ?? '{}'
    ) as Settings;

    expect(storedSettings).toEqual({
      ...DEFAULT_SETTINGS,
      pomoTime: 55,
      taskPopupEnabled: false,
      snowEnabled: false,
    });
    expect(
      dispatchSpy.mock.calls.some((call: unknown[]) => {
        const event = call[0] as Event | undefined;
        return event instanceof Event
          ? event.type === SETTINGS_CHANGED_EVENT
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
        window.localStorage.getItem(SETTINGS_KEY) ?? '{}'
      ) as Settings;

      expect(currentSettings.pomoTime).toBe(45);
      expect(currentSettings.taskPopupEnabled).toBe(false);
      expect(currentSettings.snowEnabled).toBe(false);
      return { error: null };
    });

    const { result } = renderHook(() => useSettings(0));

    await act(async () => {
      await result.current.persistSettings({
        ...DEFAULT_SETTINGS,
        pomoTime: 45,
        taskPopupEnabled: false,
        snowEnabled: false,
      });
    });

    expect(upsertMock).toHaveBeenCalledWith({
      user_id: 'user-1',
      settings: expect.objectContaining({
        pomoTime: 45,
        taskPopupEnabled: false,
        snowEnabled: false,
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
      window.localStorage.getItem(SETTINGS_KEY) ?? '{}'
    ) as Settings;

    expect(storedSettings.volume).toBe(25);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
