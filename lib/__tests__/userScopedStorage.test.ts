import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GUEST_OWNER,
  clearForeignLegacyState,
  getCurrentUserId,
  getScopedStorageKey,
  getStorageOwner,
  readOwnedJson,
  writeOwnedJson,
} from '../userScopedStorage';

const TOKEN_KEY = 'sb-testproj-auth-token';
const FULL_STATE_KEY = 'fomopomo_full_state';

const signInLocally = (userId: string) => {
  window.localStorage.setItem(
    TOKEN_KEY,
    JSON.stringify({ access_token: 'token', user: { id: userId } })
  );
};

describe('userScopedStorage', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://testproj.supabase.co');
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves the guest owner when no auth session is persisted', () => {
    expect(getCurrentUserId()).toBeNull();
    expect(getStorageOwner()).toBe(GUEST_OWNER);
  });

  it('resolves the authenticated user id synchronously from the persisted session', () => {
    signInLocally('user-a');
    expect(getCurrentUserId()).toBe('user-a');
    expect(getStorageOwner()).toBe('user-a');
  });

  it('falls back to the guest owner when the persisted session is malformed', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    window.localStorage.setItem(TOKEN_KEY, 'not-json');
    expect(getStorageOwner()).toBe(GUEST_OWNER);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('keeps the legacy key for guests and namespaces keys per user id', () => {
    expect(getScopedStorageKey(FULL_STATE_KEY, GUEST_OWNER)).toBe(
      FULL_STATE_KEY
    );
    expect(getScopedStorageKey(FULL_STATE_KEY, 'user-a')).toBe(
      `${FULL_STATE_KEY}::user-a`
    );
  });

  it('stamps writes with ownerUserId and reads them back for the same owner', () => {
    writeOwnedJson(FULL_STATE_KEY, 'user-a', { activeTab: 'timer' });

    expect(
      JSON.parse(
        window.localStorage.getItem(`${FULL_STATE_KEY}::user-a`) ?? '{}'
      )
    ).toEqual({ activeTab: 'timer', ownerUserId: 'user-a' });
    expect(readOwnedJson(FULL_STATE_KEY, 'user-a')).toEqual({
      activeTab: 'timer',
      ownerUserId: 'user-a',
    });
  });

  it('never hands one account state persisted by another account', () => {
    writeOwnedJson(FULL_STATE_KEY, 'user-a', { timer: { timeLeft: 42 } });
    writeOwnedJson(FULL_STATE_KEY, GUEST_OWNER, { timer: { timeLeft: 7 } });

    expect(readOwnedJson(FULL_STATE_KEY, 'user-b')).toBeNull();

    // Other owners' entries stay intact for their own hydration.
    expect(
      window.localStorage.getItem(`${FULL_STATE_KEY}::user-a`)
    ).not.toBeNull();
    expect(window.localStorage.getItem(FULL_STATE_KEY)).not.toBeNull();
  });

  it('rejects and removes data stamped for a different owner under the read key', () => {
    window.localStorage.setItem(
      FULL_STATE_KEY,
      JSON.stringify({ activeTab: 'timer', ownerUserId: 'user-a' })
    );

    expect(readOwnedJson(FULL_STATE_KEY, GUEST_OWNER)).toBeNull();
    expect(window.localStorage.getItem(FULL_STATE_KEY)).toBeNull();
  });

  it('accepts unstamped legacy data only in the guest namespace', () => {
    window.localStorage.setItem(
      FULL_STATE_KEY,
      JSON.stringify({ activeTab: 'timer' })
    );
    expect(readOwnedJson(FULL_STATE_KEY, GUEST_OWNER)).toEqual({
      activeTab: 'timer',
    });

    window.localStorage.setItem(
      `${FULL_STATE_KEY}::user-a`,
      JSON.stringify({ activeTab: 'timer' })
    );
    expect(readOwnedJson(FULL_STATE_KEY, 'user-a')).toBeNull();
    expect(
      window.localStorage.getItem(`${FULL_STATE_KEY}::user-a`)
    ).toBeNull();
  });

  it('discards legacy state of unknown or foreign ownership but keeps guest-stamped state', () => {
    window.localStorage.setItem(
      FULL_STATE_KEY,
      JSON.stringify({ activeTab: 'timer' })
    );
    clearForeignLegacyState(FULL_STATE_KEY);
    expect(window.localStorage.getItem(FULL_STATE_KEY)).toBeNull();

    window.localStorage.setItem(
      FULL_STATE_KEY,
      JSON.stringify({ activeTab: 'timer', ownerUserId: 'user-a' })
    );
    clearForeignLegacyState(FULL_STATE_KEY);
    expect(window.localStorage.getItem(FULL_STATE_KEY)).toBeNull();

    writeOwnedJson(FULL_STATE_KEY, GUEST_OWNER, { activeTab: 'timer' });
    clearForeignLegacyState(FULL_STATE_KEY);
    expect(window.localStorage.getItem(FULL_STATE_KEY)).not.toBeNull();
  });
});
