import { describe, expect, it, vi } from 'vitest';

import {
  decodeVapidPublicKey,
  syncPushSubscription,
} from '../pushSubscriptionSync';

function bytesToUrlSafeBase64(bytes: Uint8Array) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createVapidKey(seed: number) {
  const key = new Uint8Array(65);
  key[0] = 0x04;

  for (let index = 1; index < key.length; index += 1) {
    key[index] = (seed + index) % 256;
  }

  return key;
}

function cloneBytes(
  value: string | ArrayBuffer | ArrayBufferView | null | undefined
) {
  if (!value || typeof value === 'string') {
    return null;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value.slice(0));
  }

  return new Uint8Array(
    value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
  );
}

function createSubscription({
  endpoint,
  key,
  unsubscribeResult = true,
}: {
  endpoint: string;
  key: ArrayBuffer | ArrayBufferView | null;
  unsubscribeResult?: boolean;
}) {
  return {
    endpoint,
    options: {
      applicationServerKey: key,
      userVisibleOnly: true,
    },
    toJSON: () => ({
      keys: {
        auth: 'auth-key',
        p256dh: 'p256dh-key',
      },
    }),
    unsubscribe: vi.fn(async () => unsubscribeResult),
  } as unknown as PushSubscription;
}

function createRegistration(initialSubscription: PushSubscription | null) {
  const state = {
    currentSubscription: initialSubscription,
  };

  const subscribe = vi.fn(async (options: PushSubscriptionOptionsInit) => {
    const nextSubscription = createSubscription({
      endpoint: 'https://push.example/new-endpoint',
      key: cloneBytes(options.applicationServerKey ?? null),
    });

    state.currentSubscription = nextSubscription;
    return nextSubscription;
  });

  const getSubscription = vi.fn(async () => state.currentSubscription);

  const registration = {
    pushManager: {
      getSubscription,
      subscribe,
    },
  } as unknown as ServiceWorkerRegistration;

  return {
    getSubscription,
    registration,
    state,
    subscribe,
  };
}

describe('pushSubscriptionSync', () => {
  it('persists an existing subscription without resubscribing when the VAPID key matches', async () => {
    const vapidKey = createVapidKey(1);
    const existingSubscription = createSubscription({
      endpoint: 'https://push.example/existing-endpoint',
      key: vapidKey.buffer.slice(0),
    });
    const { registration, subscribe } = createRegistration(existingSubscription);
    const persistSubscription = vi.fn(async () => undefined);
    const removeStoredSubscription = vi.fn(async () => undefined);
    const log = vi.fn();

    const result = await syncPushSubscription({
      getCurrentUserId: async () => 'user-1',
      log,
      persistSubscription,
      registration,
      removeStoredSubscription,
      vapidPublicKey: bytesToUrlSafeBase64(vapidKey),
    });

    expect(result.status).toBe('persisted_existing');
    expect(removeStoredSubscription).not.toHaveBeenCalled();
    expect(existingSubscription.unsubscribe).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    expect(persistSubscription).toHaveBeenCalledTimes(1);
    expect(persistSubscription).toHaveBeenCalledWith(existingSubscription);
  });

  it('cleans up, unsubscribes, resubscribes, and persists exactly once when the VAPID key changes', async () => {
    const oldKey = createVapidKey(9);
    const newKey = createVapidKey(42);
    const existingSubscription = createSubscription({
      endpoint: 'https://push.example/old-endpoint',
      key: oldKey,
    });
    const { registration, subscribe } = createRegistration(existingSubscription);
    const persistSubscription = vi.fn(async () => undefined);
    const removeStoredSubscription = vi.fn(async () => undefined);

    const result = await syncPushSubscription({
      getCurrentUserId: async () => 'user-2',
      log: vi.fn(),
      persistSubscription,
      registration,
      removeStoredSubscription,
      vapidPublicKey: bytesToUrlSafeBase64(newKey),
    });

    expect(result.status).toBe('rotated');
    expect(removeStoredSubscription).toHaveBeenCalledTimes(1);
    expect(removeStoredSubscription).toHaveBeenCalledWith({
      endpoint: 'https://push.example/old-endpoint',
      userId: 'user-2',
    });
    expect(existingSubscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(cloneBytes(subscribe.mock.calls[0][0].applicationServerKey)).toEqual(
      newKey
    );
    expect(persistSubscription).toHaveBeenCalledTimes(1);
  });

  it('does not unsubscribe or resubscribe when stored-subscription cleanup fails', async () => {
    const oldKey = createVapidKey(11);
    const newKey = createVapidKey(12);
    const existingSubscription = createSubscription({
      endpoint: 'https://push.example/old-endpoint',
      key: oldKey,
    });
    const { registration, subscribe } = createRegistration(existingSubscription);
    const persistSubscription = vi.fn(async () => undefined);
    const removeStoredSubscription = vi.fn(async () => {
      throw new Error('cleanup failed');
    });

    const result = await syncPushSubscription({
      getCurrentUserId: async () => 'user-3',
      log: vi.fn(),
      persistSubscription,
      registration,
      removeStoredSubscription,
      vapidPublicKey: bytesToUrlSafeBase64(newKey),
    });

    expect(result.status).toBe('cleanup_failed');
    expect(removeStoredSubscription).toHaveBeenCalledTimes(1);
    expect(existingSubscription.unsubscribe).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    expect(persistSubscription).not.toHaveBeenCalled();
  });

  it('retries persistence without resubscribing after a rotation persistence failure', async () => {
    const oldKey = createVapidKey(21);
    const newKey = createVapidKey(22);
    const existingSubscription = createSubscription({
      endpoint: 'https://push.example/old-endpoint',
      key: oldKey,
    });
    const { registration, subscribe } = createRegistration(existingSubscription);
    const persistSubscription = vi
      .fn<(_: PushSubscription) => Promise<void>>()
      .mockRejectedValueOnce(new Error('persist failed'))
      .mockResolvedValueOnce(undefined);
    const removeStoredSubscription = vi.fn(async () => undefined);
    const log = vi.fn();

    const firstResult = await syncPushSubscription({
      getCurrentUserId: async () => 'user-4',
      log,
      persistSubscription,
      registration,
      removeStoredSubscription,
      vapidPublicKey: bytesToUrlSafeBase64(newKey),
    });

    const secondResult = await syncPushSubscription({
      getCurrentUserId: async () => 'user-4',
      log,
      persistSubscription,
      registration,
      removeStoredSubscription,
      vapidPublicKey: bytesToUrlSafeBase64(newKey),
    });

    expect(firstResult.status).toBe('persist_failed');
    expect(secondResult.status).toBe('persisted_existing');
    expect(removeStoredSubscription).toHaveBeenCalledTimes(1);
    expect(existingSubscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(persistSubscription).toHaveBeenCalledTimes(2);
  });

  it('handles URL-safe base64 and malformed values safely', async () => {
    const key = createVapidKey(251);
    const decoded = decodeVapidPublicKey(bytesToUrlSafeBase64(key));

    expect(decoded).toEqual(key);
    expect(decodeVapidPublicKey('%%%')).toBeNull();
    expect(decodeVapidPublicKey(bytesToUrlSafeBase64(new Uint8Array([4, 1])))).toBeNull();

    const { registration, subscribe } = createRegistration(null);
    const persistSubscription = vi.fn(async () => undefined);
    const result = await syncPushSubscription({
      getCurrentUserId: async () => 'user-5',
      log: vi.fn(),
      persistSubscription,
      registration,
      removeStoredSubscription: vi.fn(async () => undefined),
      vapidPublicKey: '%%%',
    });

    expect(result.status).toBe('invalid_vapid_key');
    expect(subscribe).not.toHaveBeenCalled();
    expect(persistSubscription).not.toHaveBeenCalled();
  });

  it('rotates safely when the existing subscription is missing applicationServerKey', async () => {
    const newKey = createVapidKey(31);
    const existingSubscription = createSubscription({
      endpoint: 'https://push.example/old-endpoint',
      key: null,
    });
    const { registration, subscribe } = createRegistration(existingSubscription);
    const persistSubscription = vi.fn(async () => undefined);
    const removeStoredSubscription = vi.fn(async () => undefined);

    const result = await syncPushSubscription({
      getCurrentUserId: async () => 'user-6',
      log: vi.fn(),
      persistSubscription,
      registration,
      removeStoredSubscription,
      vapidPublicKey: bytesToUrlSafeBase64(newKey),
    });

    expect(result.status).toBe('rotated');
    expect(removeStoredSubscription).toHaveBeenCalledTimes(1);
    expect(existingSubscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(persistSubscription).toHaveBeenCalledTimes(1);
  });
});
