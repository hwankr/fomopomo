export const FEEDBACK_STORAGE_BUCKET = 'feedback-uploads';

const LIST_PAGE_SIZE = 100;
const REMOVE_CHUNK_SIZE = 100;
const ENCODED_SEPARATOR_PATTERN = /%(2f|5c)/i;
type StorageErrorLike = {
  message?: string;
};

export type OwnedStorageObject = {
  id: string;
  bucket_id: string;
  name: string;
  owner_id: string;
};

type ListOwnedObjects = (input: {
  userId: string;
  afterId: string | null;
  limit: number;
}) => PromiseLike<{
  data: OwnedStorageObject[] | null;
  error: StorageErrorLike | null;
}>;

type FeedbackStorageBucketClient = {
  remove(paths: string[]): Promise<{
    data?: unknown;
    error: StorageErrorLike | null;
  }>;
};

type FeedbackStorageClient = {
  from(bucketId: string): FeedbackStorageBucketClient;
};

export type FeedbackStorageCleanupResult = {
  counts: {
    eligible: number;
    listed: number;
    pages: number;
    removeRequests: number;
    removed: number;
    skipped: number;
  };
  ok: boolean;
  retryable: boolean;
  status: 'success' | 'storage_list_failed' | 'storage_remove_failed'
    | 'storage_unverified_objects' | 'storage_objects_remaining';
};

const isSafePathComponent = (component: string) => {
  if (!component) return false;
  if (component === '.' || component === '..') return false;
  if (component.includes('\\')) return false;
  if (component.includes('/')) return false;
  if (component.trim().length === 0) return false;
  if (ENCODED_SEPARATOR_PATTERN.test(component)) return false;
  return !/[\u0000-\u001F]/.test(component);
};

const isRemovableObject = (object: OwnedStorageObject, userId: string) => {
  if (object.owner_id !== userId || object.bucket_id !== FEEDBACK_STORAGE_BUCKET ||
      typeof object.name !== 'string') return false;
  const components = object.name.split('/');
  return components.length >= 2 && components[0] === userId &&
    components.every(isSafePathComponent);
};

const emptyCounts = () => ({
  eligible: 0,
  listed: 0,
  pages: 0,
  removeRequests: 0,
  removed: 0,
  skipped: 0,
});

export async function cleanupUserFeedbackStorage({
  storage,
  userId,
  listOwnedObjects,
}: {
  storage: FeedbackStorageClient;
  userId: string;
  listOwnedObjects: ListOwnedObjects;
}): Promise<FeedbackStorageCleanupResult> {
  if (!isSafePathComponent(userId)) {
    return {
      counts: emptyCounts(),
      ok: false,
      retryable: false,
      status: 'storage_list_failed',
    };
  }

  const bucket = storage.from(FEEDBACK_STORAGE_BUCKET);
  const counts = emptyCounts();
  const removablePaths = new Set<string>();
  const fail = (
    status: FeedbackStorageCleanupResult['status'],
    retryable = true
  ): FeedbackStorageCleanupResult => ({ counts, ok: false, retryable, status });

  // Storage list() has neither owner fields nor recursive folder contents.
  // The service-only RPC reads actual object ownership, including legacy owner,
  // across all buckets. Never infer ownership from a URL, prefix, or metadata.
  let afterId: string | null = null;
  try {
    for (;;) {
      const { data, error } = await listOwnedObjects({ userId, afterId, limit: LIST_PAGE_SIZE });

      if (error || !Array.isArray(data)) return fail('storage_list_failed');

      counts.pages += 1;
      counts.listed += data.length;

      for (const object of data) {
        if (!object || typeof object.id !== 'string' || !object.id ||
            (afterId !== null && object.id <= afterId)) return fail('storage_list_failed');
        afterId = object.id;

        if (!isRemovableObject(object, userId)) {
          counts.skipped += 1;
          return fail('storage_unverified_objects', false);
        }
        removablePaths.add(object.name);
      }

      if (data.length < LIST_PAGE_SIZE) break;
    }
  } catch {
    return fail('storage_list_failed');
  }

  const paths = Array.from(removablePaths);
  counts.eligible = paths.length;

  for (let index = 0; index < paths.length; index += REMOVE_CHUNK_SIZE) {
    const chunk = paths.slice(index, index + REMOVE_CHUNK_SIZE);
    if (chunk.length === 0) {
      continue;
    }

    counts.removeRequests += 1;
    try {
      const { error } = await bucket.remove(chunk);
      if (error) return fail('storage_remove_failed');
    } catch {
      return fail('storage_remove_failed');
    }

    counts.removed += chunk.length;
  }

  // remove() can report no error while removing zero rows. Also catch files
  // added during cleanup instead of falsely confirming account reset/deletion.
  try {
    const { data, error } = await listOwnedObjects({ userId, afterId: null, limit: 1 });
    if (error || !Array.isArray(data)) return fail('storage_list_failed');
    if (data.length > 0) return fail('storage_objects_remaining');
  } catch {
    return fail('storage_list_failed');
  }

  return {
    counts,
    ok: true,
    retryable: false,
    status: 'success',
  };
}
