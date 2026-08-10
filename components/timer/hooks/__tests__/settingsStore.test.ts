import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import {
  DEFAULT_FOMOPOMO_SETTINGS,
  DEFAULT_TASK_OPTIONS,
  SETTINGS_CHANGED_EVENT,
  SETTINGS_KEY,
  loadPersistedSettings,
  loadTaskOptions,
  normalizeSettings,
  persistSettings,
  readSettingsSnapshot,
  writeSettingsSnapshot,
  type FomopomoSettings,
} from '../settingsStore';

type UserSettingsResult = {
  data: { settings: Partial<FomopomoSettings> } | null;
  error?: { code?: string } | null;
};

describe('settingsStore', () => {
  const upsertMock = vi.fn();
  let userSettingsResult: UserSettingsResult;
  let dispatchSpy: ReturnType<typeof vi.spyOn>;
  let selectMock: ReturnType<typeof vi.fn>;
  let eqMock: ReturnType<typeof vi.fn>;
  let singleMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.localStorage.clear();

    upsertMock.mockReset();
    supabaseMock.auth.getUser.mockReset();
    supabaseMock.from.mockReset();

    userSettingsResult = { data: null, error: null };
    singleMock = vi.fn(async () => userSettingsResult);
    eqMock = vi.fn(() => ({ single: singleMock }));
    selectMock = vi.fn(() => ({ eq: eqMock }));

    supabaseMock.from.mockReturnValue({
      select: selectMock,
      upsert: upsertMock,
    });
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: null },
    });

    dispatchSpy = vi.spyOn(window, 'dispatchEvent');
  });

  it('normalizes missing seasonal effect, tasks, and presets from canonical defaults', () => {
    expect(
      normalizeSettings({
        pomoTime: 40,
        shortBreak: 8,
        tasks: [],
        presets: [],
      })
    ).toEqual({
      ...DEFAULT_FOMOPOMO_SETTINGS,
      pomoTime: 40,
      shortBreak: 8,
    });
  });

  describe('numeric validation', () => {
    it('clamps zero and negative values up to their minimums', () => {
      expect(
        normalizeSettings({
          pomoTime: 0,
          shortBreak: 0,
          longBreak: -3,
          longBreakInterval: 0,
          volume: -5,
        })
      ).toEqual({
        ...DEFAULT_FOMOPOMO_SETTINGS,
        pomoTime: 1,
        shortBreak: 1,
        longBreak: 1,
        longBreakInterval: 1,
        volume: 0,
      });
    });

    it('recovers NaN and non-numeric values to defaults', () => {
      expect(
        normalizeSettings({
          pomoTime: Number.NaN,
          shortBreak: '10' as unknown as number,
          longBreak: 'abc' as unknown as number,
          longBreakInterval: Number.POSITIVE_INFINITY,
          volume: null as unknown as number,
        })
      ).toEqual(DEFAULT_FOMOPOMO_SETTINGS);
    });

    it('rounds fractional values and clamps runaway numbers to sane caps', () => {
      expect(
        normalizeSettings({
          pomoTime: 25.6,
          shortBreak: 1e9,
          longBreakInterval: 1000,
          volume: 250,
        })
      ).toEqual({
        ...DEFAULT_FOMOPOMO_SETTINGS,
        pomoTime: 26,
        shortBreak: 999,
        longBreakInterval: 99,
        volume: 100,
      });
    });

    it('sanitizes preset minutes the same way', () => {
      expect(
        normalizeSettings({
          presets: [
            { id: '1', label: '즉시 완료', minutes: 0 },
            { id: '2', label: '깨진 값', minutes: Number.NaN },
            { id: '3', label: '정상', minutes: 50 },
          ],
        }).presets
      ).toEqual([
        { id: '1', label: '즉시 완료', minutes: 1 },
        { id: '2', label: '깨진 값', minutes: 25 },
        { id: '3', label: '정상', minutes: 50 },
      ]);
    });

    it('survives null preset entries in persisted data instead of crashing the snapshot read', () => {
      // JSON.stringify turns undefined array slots into null; this runs
      // inside useSyncExternalStore's getSnapshot, so a throw would take
      // down the whole render. Corrupt entries are dropped, not resurrected
      // as empty presets.
      window.localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({
          ...DEFAULT_FOMOPOMO_SETTINGS,
          presets: [null, { id: 'ok', label: '생존', minutes: 40 }],
        })
      );

      expect(readSettingsSnapshot().presets).toEqual([
        { id: 'ok', label: '생존', minutes: 40 },
      ]);

      // All entries corrupt → canonical defaults.
      window.localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ ...DEFAULT_FOMOPOMO_SETTINGS, presets: [null] })
      );

      expect(readSettingsSnapshot().presets).toEqual(
        DEFAULT_FOMOPOMO_SETTINGS.presets
      );
    });

    it('sanitizes corrupt remote settings on load', async () => {
      supabaseMock.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
      });
      userSettingsResult = {
        data: {
          settings: {
            ...DEFAULT_FOMOPOMO_SETTINGS,
            pomoTime: 0,
            longBreakInterval: 0,
          },
        },
        error: null,
      };

      await expect(loadPersistedSettings()).resolves.toEqual({
        ...DEFAULT_FOMOPOMO_SETTINGS,
        pomoTime: 1,
        longBreakInterval: 1,
      });
    });
  });

  it('falls back to canonical defaults when persisted JSON is invalid', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    window.localStorage.setItem(SETTINGS_KEY, 'not-json');

    expect(readSettingsSnapshot()).toEqual(DEFAULT_FOMOPOMO_SETTINGS);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('writes normalized settings locally and dispatches the shared event', () => {
    writeSettingsSnapshot({
      ...DEFAULT_FOMOPOMO_SETTINGS,
      seasonalEffectEnabled: false,
      tasks: [],
      presets: [],
    });

    expect(
      JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}')
    ).toEqual({
      ...DEFAULT_FOMOPOMO_SETTINGS,
      seasonalEffectEnabled: false,
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

  it('prefers remote persisted settings over local snapshot when authenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });
    userSettingsResult = {
      data: {
        settings: {
          ...DEFAULT_FOMOPOMO_SETTINGS,
          pomoTime: 77,
          seasonalEffectEnabled: false,
          tasks: ['원격 작업'],
        },
      },
      error: null,
    };
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_FOMOPOMO_SETTINGS,
        pomoTime: 33,
        tasks: ['로컬 작업'],
      })
    );

    await expect(loadPersistedSettings()).resolves.toEqual({
      ...DEFAULT_FOMOPOMO_SETTINGS,
      pomoTime: 77,
      seasonalEffectEnabled: false,
      tasks: ['원격 작업'],
    });
  });

  it('falls back to local snapshot when remote persisted settings are absent', async () => {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_FOMOPOMO_SETTINGS,
        pomoTime: 64,
        tasks: ['로컬 작업'],
      })
    );

    await expect(loadPersistedSettings()).resolves.toEqual({
      ...DEFAULT_FOMOPOMO_SETTINGS,
      pomoTime: 64,
      tasks: ['로컬 작업'],
    });
  });

  it('preserves remote -> local -> default precedence for task options', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_FOMOPOMO_SETTINGS,
        tasks: ['로컬 작업'],
      })
    );

    userSettingsResult = {
      data: { settings: { tasks: ['원격 작업'] } },
      error: null,
    };
    await expect(loadTaskOptions()).resolves.toEqual(['원격 작업']);

    userSettingsResult = {
      data: { settings: { tasks: [] } },
      error: null,
    };
    await expect(loadTaskOptions()).resolves.toEqual(['로컬 작업']);

    window.localStorage.removeItem(SETTINGS_KEY);
    await expect(loadTaskOptions()).resolves.toEqual(DEFAULT_TASK_OPTIONS);
  });

  describe('account-scoped storage', () => {
    const TOKEN_KEY = 'sb-testproj-auth-token';

    const signInLocally = (userId: string) => {
      window.localStorage.setItem(
        TOKEN_KEY,
        JSON.stringify({ access_token: 'token', user: { id: userId } })
      );
    };

    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://testproj.supabase.co');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('writes authenticated settings under a user-scoped key with an owner stamp', () => {
      signInLocally('user-a');

      writeSettingsSnapshot({
        ...DEFAULT_FOMOPOMO_SETTINGS,
        pomoTime: 30,
      });

      expect(window.localStorage.getItem(SETTINGS_KEY)).toBeNull();
      expect(
        JSON.parse(
          window.localStorage.getItem(`${SETTINGS_KEY}::user-a`) ?? '{}'
        )
      ).toEqual({
        ...DEFAULT_FOMOPOMO_SETTINGS,
        pomoTime: 30,
        ownerUserId: 'user-a',
      });
    });

    it('does not leak guest settings into a newly authenticated account', async () => {
      window.localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ ...DEFAULT_FOMOPOMO_SETTINGS, pomoTime: 99 })
      );

      signInLocally('user-b');

      expect(readSettingsSnapshot()).toEqual(DEFAULT_FOMOPOMO_SETTINGS);
      await expect(loadPersistedSettings()).resolves.toEqual(
        DEFAULT_FOMOPOMO_SETTINGS
      );
    });

    it('keeps settings isolated between accounts and the guest namespace', () => {
      signInLocally('user-a');
      writeSettingsSnapshot({ ...DEFAULT_FOMOPOMO_SETTINGS, pomoTime: 30 });
      expect(readSettingsSnapshot().pomoTime).toBe(30);

      signInLocally('user-b');
      expect(readSettingsSnapshot()).toEqual(DEFAULT_FOMOPOMO_SETTINGS);
      writeSettingsSnapshot({ ...DEFAULT_FOMOPOMO_SETTINGS, pomoTime: 45 });
      expect(readSettingsSnapshot().pomoTime).toBe(45);

      signInLocally('user-a');
      expect(readSettingsSnapshot().pomoTime).toBe(30);

      window.localStorage.removeItem(TOKEN_KEY);
      expect(readSettingsSnapshot()).toEqual(DEFAULT_FOMOPOMO_SETTINGS);
    });
  });

  it('writes locally before remote upsert during async persistence', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });
    upsertMock.mockImplementation(async () => {
      expect(
        JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}')
      ).toEqual(
        expect.objectContaining({
          pomoTime: 45,
          seasonalEffectEnabled: false,
        })
      );

      return { error: null };
    });

    await persistSettings({
      ...DEFAULT_FOMOPOMO_SETTINGS,
      pomoTime: 45,
      seasonalEffectEnabled: false,
    });

    expect(upsertMock).toHaveBeenCalledWith({
      user_id: 'user-1',
      settings: expect.objectContaining({
        pomoTime: 45,
        seasonalEffectEnabled: false,
      }),
    });
  });
});
