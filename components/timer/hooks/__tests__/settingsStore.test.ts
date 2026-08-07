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
