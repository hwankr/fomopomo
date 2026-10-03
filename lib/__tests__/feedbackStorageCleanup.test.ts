import { describe, expect, it, vi } from 'vitest';
import type { FileObject } from '@supabase/storage-js';
import {
  cleanupUserFeedbackStorage,
  FEEDBACK_STORAGE_BUCKET,
  type OwnedStorageObject,
} from '../server/feedbackStorageCleanup';

const USER = '51000000-0000-4000-8000-000000000001';
const OTHER_USER = '51000000-0000-4000-8000-000000000002';
const object = (index: number, overrides: Partial<OwnedStorageObject> = {}): OwnedStorageObject => ({
  id: `52000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  bucket_id: FEEDBACK_STORAGE_BUCKET,
  name: `${USER}/image-${index}.png`,
  owner_id: USER,
  ...overrides,
});

function createStorage(objects: OwnedStorageObject[] = [], overrides: {
  listErrorAtCall?: number;
  listThrowAtCall?: number;
  removeErrorAtCall?: number;
  removeThrow?: boolean;
  retainOnRemove?: boolean;
  extraAfterRemove?: OwnedStorageObject;
} = {}) {
  let remaining = [...objects];
  let listCalls = 0;
  let removeCalls = 0;
  const listOwnedObjects = vi.fn(async ({ userId, afterId, limit }: {
    userId: string; afterId: string | null; limit: number;
  }) => {
    listCalls += 1;
    if (overrides.listThrowAtCall === listCalls) throw new Error('network failed');
    if (overrides.listErrorAtCall === listCalls) return { data: null, error: { message: 'list failed' } };
    return {
      data: remaining.filter(row => row.owner_id === userId && (!afterId || row.id > afterId))
        .sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit),
      error: null,
    };
  });
  // Real List V1 responses have neither owners nor recursive folder contents.
  const listPayload: FileObject[] = [{
    name: 'image-1.png', id: object(1).id, created_at: null, updated_at: null,
    last_accessed_at: null, metadata: {
      size: 10, mimetype: 'image/png', eTag: 'etag', cacheControl: '3600',
      lastModified: '2026-10-03T00:00:00Z', contentLength: 10, httpStatusCode: 200,
    },
  }, { name: 'nested', id: null, created_at: null, updated_at: null,
    last_accessed_at: null, metadata: null }];
  const list = vi.fn(async () => ({ data: listPayload, error: null }));
  const remove = vi.fn(async (paths: string[]) => {
    removeCalls += 1;
    if (overrides.removeThrow) throw new Error('network failed');
    if (overrides.removeErrorAtCall === removeCalls) return { data: null, error: { message: 'remove failed' } };
    if (!overrides.retainOnRemove) remaining = remaining.filter(row => !paths.includes(row.name));
    if (overrides.extraAfterRemove) remaining.push(overrides.extraAfterRemove);
    return { data: paths, error: null };
  });
  const storage = { from: vi.fn(() => ({ list, remove })) };
  return { storage, listOwnedObjects, list, remove, remaining: () => remaining };
}

describe('feedbackStorageCleanup', () => {
  it('uses authoritative ownership instead of ownerless Storage list, including nested legacy objects', async () => {
    const other = object(4, { name: `${USER}/other-user.png`, owner_id: OTHER_USER });
    const input = createStorage([
      object(1), object(2, { name: `${USER}/legacy/nested photo.gif` }),
      object(3, { name: `${USER}/legacy-upload.png` }), other,
    ]);
    const result = await cleanupUserFeedbackStorage({ ...input, userId: USER });
    expect(result).toMatchObject({ ok: true, counts: { eligible: 3, removed: 3, skipped: 0 } });
    expect(input.list).not.toHaveBeenCalled();
    expect(input.storage.from).toHaveBeenCalledWith(FEEDBACK_STORAGE_BUCKET);
    expect(input.remove).toHaveBeenCalledWith([
      `${USER}/image-1.png`, `${USER}/legacy/nested photo.gif`, `${USER}/legacy-upload.png`,
    ]);
    expect(input.remaining()).toEqual([other]);
    expect(input.listOwnedObjects).toHaveBeenLastCalledWith({ userId: USER, afterId: null, limit: 1 });
  });

  it('enumerates keyset pages before chunked removal, without offset skipping', async () => {
    const input = createStorage(Array.from({ length: 225 }, (_, i) => object(i + 1)));
    expect(await cleanupUserFeedbackStorage({ ...input, userId: USER })).toMatchObject({
      ok: true, counts: { eligible: 225, listed: 225, pages: 3, removeRequests: 3, removed: 225 },
    });
    expect(input.listOwnedObjects.mock.calls.slice(0, 3)).toEqual([
      [{ userId: USER, afterId: null, limit: 100 }],
      [{ userId: USER, afterId: object(100).id, limit: 100 }],
      [{ userId: USER, afterId: object(200).id, limit: 100 }],
    ]);
    expect(input.remove.mock.calls.map(([paths]) => paths.length)).toEqual([100, 100, 25]);
    expect(input.remaining()).toEqual([]);
  });

  it.each([
    { name: 'legacy-outside-user-namespace.png' },
    { name: `${OTHER_USER}/owned-but-foreign-namespace.png` },
    { name: `${USER}/../escape.png` },
    { name: `${USER}/..%2Fescape.png` },
    { name: `${USER}/nested\\path.png` },
    { name: `${USER}/folder/` },
    { bucket_id: 'different-bucket' },
  ])('fails before any removal for unresolved owned object %j', async (overrides) => {
    const input = createStorage([object(1), object(2, overrides)]);
    expect(await cleanupUserFeedbackStorage({ ...input, userId: USER })).toMatchObject({
      ok: false, retryable: false, status: 'storage_unverified_objects',
    });
    expect(input.remove).not.toHaveBeenCalled();
    expect(input.remaining()).toHaveLength(2);
  });

  it('fails closed if inventory returns a different owner under the user prefix', async () => {
    const input = createStorage();
    input.listOwnedObjects.mockResolvedValueOnce({ data: [object(1, { owner_id: OTHER_USER })], error: null });
    expect(await cleanupUserFeedbackStorage({ ...input, userId: USER })).toMatchObject({
      ok: false, retryable: false, status: 'storage_unverified_objects',
    });
    expect(input.remove).not.toHaveBeenCalled();
  });

  it.each([{ listErrorAtCall: 1 }, { listThrowAtCall: 1 }, { listErrorAtCall: 2 }])(
    'fails closed on inventory errors before removing files: %j', async (overrides) => {
      const input = createStorage(Array.from({ length: 101 }, (_, i) => object(i + 1)), overrides);
      expect(await cleanupUserFeedbackStorage({ ...input, userId: USER })).toMatchObject({
        ok: false, retryable: true, status: 'storage_list_failed',
      });
      expect(input.remove).not.toHaveBeenCalled();
    }
  );

  it('rejects a non-advancing inventory cursor rather than looping forever', async () => {
    const input = createStorage();
    input.listOwnedObjects.mockResolvedValueOnce({ data: [object(1), object(1)], error: null });
    expect(await cleanupUserFeedbackStorage({ ...input, userId: USER })).toMatchObject({ ok: false, status: 'storage_list_failed' });
    expect(input.remove).not.toHaveBeenCalled();
  });

  it('returns a retryable failure after partial deletion and succeeds on retry', async () => {
    const input = createStorage(Array.from({ length: 101 }, (_, i) => object(i + 1)), { removeErrorAtCall: 2 });
    expect(await cleanupUserFeedbackStorage({ ...input, userId: USER })).toMatchObject({
      ok: false, retryable: true, status: 'storage_remove_failed', counts: { removed: 100, removeRequests: 2 },
    });
    expect(input.remaining()).toHaveLength(1);
    expect(await cleanupUserFeedbackStorage({ ...input, userId: USER })).toMatchObject({ ok: true, counts: { removed: 1 } });
    expect(input.remaining()).toEqual([]);
  });

  it('reports a thrown Storage removal failure', async () => {
    const input = createStorage([object(1)], { removeThrow: true });
    expect(await cleanupUserFeedbackStorage({ ...input, userId: USER })).toMatchObject({ ok: false, retryable: true, status: 'storage_remove_failed' });
  });

  it.each([{ retainOnRemove: true }, { extraAfterRemove: object(2) }])(
    'rejects false success when removal leaves objects or another upload arrives: %j', async (overrides) => {
      const input = createStorage([object(1)], overrides);
      expect(await cleanupUserFeedbackStorage({ ...input, userId: USER })).toMatchObject({ ok: false, retryable: true, status: 'storage_objects_remaining' });
    }
  );

  it('fails if final verification is unavailable', async () => {
    const input = createStorage([object(1)], { listErrorAtCall: 2 });
    expect(await cleanupUserFeedbackStorage({ ...input, userId: USER })).toMatchObject({ ok: false, retryable: true, status: 'storage_list_failed' });
  });

  it('verifies an empty account without issuing removal', async () => {
    const input = createStorage();
    expect(await cleanupUserFeedbackStorage({ ...input, userId: USER })).toMatchObject({ ok: true, counts: { removed: 0 } });
    expect(input.remove).not.toHaveBeenCalled();
  });
});
