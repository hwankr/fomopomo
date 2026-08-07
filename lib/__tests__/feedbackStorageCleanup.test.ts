import { describe, expect, it, vi } from 'vitest';

import {
  cleanupUserFeedbackStorage,
  FEEDBACK_STORAGE_BUCKET,
} from '../server/feedbackStorageCleanup';

type StorageObject = {
  metadata?: Record<string, unknown> | null;
  name: string;
  owner?: string | null;
  owner_id?: string | null;
};

function createStorage(overrides: {
  pages?: StorageObject[][];
  listErrorAtCall?: number;
  removeErrorAtCall?: number;
} = {}) {
  const pages = overrides.pages ?? [[]];
  let listCallCount = 0;
  let removeCallCount = 0;

  const list = vi.fn(async () => {
    listCallCount += 1;
    if (overrides.listErrorAtCall === listCallCount) {
      return { data: null, error: { message: 'list failed' } };
    }

    return {
      data: pages[listCallCount - 1] ?? [],
      error: null,
    };
  });

  const remove = vi.fn(async (paths: string[]) => {
    removeCallCount += 1;
    if (overrides.removeErrorAtCall === removeCallCount) {
      return { data: null, error: { message: 'remove failed' } };
    }

    return { data: paths, error: null };
  });

  return {
    bucket: { list, remove },
    storage: {
      from: vi.fn((bucketId: string) => {
        expect(bucketId).toBe(FEEDBACK_STORAGE_BUCKET);
        return { list, remove };
      }),
    },
  };
}

describe('feedbackStorageCleanup', () => {
  it('removes only verified user-owned canonical and safe legacy paths', async () => {
    const { storage, bucket } = createStorage({
      pages: [[
        { name: '123e4567-e89b-42d3-a456-426614174000.png', owner: 'user-1' },
        { name: 'legacy-image.png', owner_id: 'user-1' },
        { name: 'legacy-image.png', owner: 'user-1' },
        { name: 'other-user.png', owner: 'user-2' },
        { name: '..%2Fescape.png', owner: 'user-1' },
        { name: 'nested\\\\path.png', owner: 'user-1' },
      ]],
    });

    const result = await cleanupUserFeedbackStorage({
      storage,
      userId: 'user-1',
    });

    expect(result).toEqual({
      counts: {
        eligible: 2,
        listed: 6,
        pages: 1,
        removeRequests: 1,
        removed: 2,
        skipped: 3,
      },
      ok: true,
      retryable: false,
      status: 'success',
    });
    expect(bucket.remove).toHaveBeenCalledWith([
      'user-1/123e4567-e89b-42d3-a456-426614174000.png',
      'user-1/legacy-image.png',
    ]);
  });

  it('chunks deletes into batches of 100', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      name: `image-${index}.png`,
      owner: 'user-1',
    }));
    const secondPage = Array.from({ length: 25 }, (_, index) => ({
      name: `image-${index + 100}.png`,
      owner: 'user-1',
    }));
    const { storage, bucket } = createStorage({
      pages: [firstPage, secondPage],
    });

    const result = await cleanupUserFeedbackStorage({
      storage,
      userId: 'user-1',
    });

    expect(result.counts).toMatchObject({
      eligible: 125,
      listed: 125,
      pages: 2,
      removeRequests: 2,
      removed: 125,
      skipped: 0,
    });
    expect(bucket.remove).toHaveBeenNthCalledWith(
      1,
      Array.from({ length: 100 }, (_, index) => `user-1/image-${index}.png`)
    );
    expect(bucket.remove).toHaveBeenNthCalledWith(
      2,
      Array.from({ length: 25 }, (_, index) => `user-1/image-${index + 100}.png`)
    );
  });

  it('returns a retryable failure when listing fails', async () => {
    const { storage, bucket } = createStorage({
      pages: [[{ name: 'image-1.png', owner: 'user-1' }]],
      listErrorAtCall: 1,
    });

    const result = await cleanupUserFeedbackStorage({
      storage,
      userId: 'user-1',
    });

    expect(result).toEqual({
      counts: {
        eligible: 0,
        listed: 0,
        pages: 0,
        removeRequests: 0,
        removed: 0,
        skipped: 0,
      },
      ok: false,
      retryable: true,
      status: 'storage_list_failed',
    });
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it('returns a retryable failure when removal fails after partial progress', async () => {
    const { storage } = createStorage({
      pages: [
        Array.from({ length: 100 }, (_, index) => ({
          name: `image-${index}.png`,
          owner: 'user-1',
        })),
        [{ name: 'image-100.png', owner: 'user-1' }],
      ],
      removeErrorAtCall: 2,
    });

    const result = await cleanupUserFeedbackStorage({
      storage,
      userId: 'user-1',
    });

    expect(result).toEqual({
      counts: {
        eligible: 101,
        listed: 101,
        pages: 2,
        removeRequests: 2,
        removed: 100,
        skipped: 0,
      },
      ok: false,
      retryable: true,
      status: 'storage_remove_failed',
    });
  });
});
