// Per-account namespacing for persisted localStorage state.
//
// Timer/task/settings state used to live under global keys shared by every
// account on the device, so account B could restore (and then re-save) account
// A's state. Every persisted key is now scoped to a storage "owner":
//   - guest (logged out): the legacy base key, e.g. `fomopomo_full_state`
//   - logged in:          `<base>::<userId>`, e.g. `fomopomo_full_state::<uid>`
// Keeping the guest namespace on the legacy key preserves existing guest state
// and read-only consumers of it; authenticated state moves to owned keys.
//
// Values written through this module are stamped with `ownerUserId` and the
// stamp is validated again on hydration as a second line of defense.

export const GUEST_OWNER = 'guest';

type OwnerStamped = { ownerUserId?: unknown };

const getAuthTokenStorageKey = (): string | null => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const projectId = supabaseUrl.split('//')[1]?.split('.')[0];
  return projectId ? `sb-${projectId}-auth-token` : null;
};

let cachedTokenRaw: string | null | undefined;
let cachedUserId: string | null = null;

// Synchronous read of the current Supabase user id from the persisted session.
// supabase.auth.getUser()/getSession() are async, but storage-key decisions
// must be made synchronously during render and hydration.
export function getCurrentUserId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const tokenKey = getAuthTokenStorageKey();
  if (!tokenKey) {
    return null;
  }

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(tokenKey);
  } catch (error) {
    console.error('Failed to read auth session from localStorage', error);
    return null;
  }

  if (raw === cachedTokenRaw) {
    return cachedUserId;
  }

  cachedTokenRaw = raw;
  cachedUserId = null;

  if (raw) {
    try {
      const session = JSON.parse(raw) as { user?: { id?: unknown } } | null;
      const userId = session?.user?.id;
      if (typeof userId === 'string' && userId.length > 0) {
        cachedUserId = userId;
      }
    } catch (error) {
      console.error('Failed to parse auth session from localStorage', error);
    }
  }

  return cachedUserId;
}

export function getStorageOwner(): string {
  return getCurrentUserId() ?? GUEST_OWNER;
}

export function getScopedStorageKey(baseKey: string, owner: string): string {
  return owner === GUEST_OWNER ? baseKey : `${baseKey}::${owner}`;
}

const removeStoredItem = (key: string) => {
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.error(`Failed to remove ${key} from localStorage`, error);
  }
};

// Reads the owner-scoped value for `baseKey` and validates its ownerUserId
// stamp. Returns null (and drops the entry when it belongs to someone else)
// instead of ever handing one account's state to another. Unstamped data is
// accepted only in the guest namespace, for state written before namespacing.
export function readOwnedJson<T extends object>(
  baseKey: string,
  owner: string
): T | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const key = getScopedStorageKey(baseKey, owner);

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch (error) {
    console.error(`Failed to read ${key} from localStorage`, error);
    return null;
  }

  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to parse ${key} from localStorage`, error);
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const stamp = (parsed as OwnerStamped).ownerUserId;
  if (stamp !== undefined && stamp !== owner) {
    removeStoredItem(key);
    return null;
  }
  if (stamp === undefined && owner !== GUEST_OWNER) {
    removeStoredItem(key);
    return null;
  }

  return parsed as T;
}

export function writeOwnedJson(
  baseKey: string,
  owner: string,
  value: object
): void {
  if (typeof window === 'undefined') {
    return;
  }

  const key = getScopedStorageKey(baseKey, owner);
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ ...value, ownerUserId: owner })
    );
  } catch (error) {
    console.error(`Failed to write ${key} to localStorage`, error);
  }
}

// Explicit migration policy for pre-namespacing state: when an authenticated
// account hydrates, a legacy (base-key) entry of unknown or foreign ownership
// is discarded instead of being inherited; guest-stamped state is kept for the
// guest namespace.
export function clearForeignLegacyState(baseKey: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(baseKey);
  } catch (error) {
    console.error(`Failed to read ${baseKey} from localStorage`, error);
    return;
  }

  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw) as OwnerStamped | null;
    if (parsed && parsed.ownerUserId === GUEST_OWNER) {
      return;
    }
  } catch {
    // Unparseable legacy data has no provable owner either; fall through.
  }

  removeStoredItem(baseKey);
}
