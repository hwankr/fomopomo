export const FEEDBACK_STORAGE_BUCKET = 'feedback-uploads';

const LIST_PAGE_SIZE = 100;
const REMOVE_CHUNK_SIZE = 100;
const ENCODED_SEPARATOR_PATTERN = /%(2f|5c)/i;
const CANONICAL_OBJECT_NAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(gif|jpe?g|png|webp)$/i;

type StorageErrorLike = {
  message?: string;
};

type StorageListItem = {
  metadata?: Record<string, unknown> | null;
  name: string;
  owner?: string | null;
  owner_id?: string | null;
};

type FeedbackStorageBucketClient = {
  list(
    path?: string,
    options?: {
      limit?: number;
      offset?: number;
      sortBy?: {
        column?: string;
        order?: string;
      };
    }
  ): Promise<{
    data: StorageListItem[] | null;
    error: StorageErrorLike | null;
  }>;
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
  status: 'success' | 'storage_list_failed' | 'storage_remove_failed';
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

const getObjectOwner = (object: StorageListItem) => {
  const metadata = object.metadata ?? {};
  const candidates = [
    object.owner,
    object.owner_id,
    typeof metadata.owner === 'string' ? metadata.owner : null,
    typeof metadata.owner_id === 'string' ? metadata.owner_id : null,
  ];

  return candidates.find((candidate): candidate is string => !!candidate) ?? null;
};

const classifyObjectPath = ({
  name,
  userId,
}: {
  name: string;
  userId: string;
}) => {
  const components = name.split('/');
  if (components.some((component) => !isSafePathComponent(component))) {
    return null;
  }

  const objectPath = `${userId}/${components.join('/')}`;
  return {
    objectPath,
    type: CANONICAL_OBJECT_NAME_PATTERN.test(name) ? 'canonical' : 'legacy',
  } as const;
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
}: {
  storage: FeedbackStorageClient;
  userId: string;
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

  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await bucket.list(userId, {
      limit: LIST_PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error) {
      return {
        counts,
        ok: false,
        retryable: true,
        status: 'storage_list_failed',
      };
    }

    const page = data ?? [];
    counts.pages += 1;
    counts.listed += page.length;

    for (const object of page) {
      const owner = getObjectOwner(object);
      const classified = classifyObjectPath({ name: object.name, userId });

      if (!owner || owner !== userId || !classified) {
        counts.skipped += 1;
        continue;
      }

      removablePaths.add(classified.objectPath);
    }

    if (page.length < LIST_PAGE_SIZE) {
      break;
    }
  }

  const paths = Array.from(removablePaths);
  counts.eligible = paths.length;

  for (let index = 0; index < paths.length; index += REMOVE_CHUNK_SIZE) {
    const chunk = paths.slice(index, index + REMOVE_CHUNK_SIZE);
    if (chunk.length === 0) {
      continue;
    }

    const { error } = await bucket.remove(chunk);
    counts.removeRequests += 1;

    if (error) {
      return {
        counts,
        ok: false,
        retryable: true,
        status: 'storage_remove_failed',
      };
    }

    counts.removed += chunk.length;
  }

  return {
    counts,
    ok: true,
    retryable: false,
    status: 'success',
  };
}
