export const FEEDBACK_IMAGE_BUCKET = 'feedback-uploads';
export const FEEDBACK_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const FEEDBACK_IMAGE_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const;

const ENCODED_SEPARATOR_PATTERN = /%(2f|5c)/i;

export type FeedbackImageMimeType = keyof typeof FEEDBACK_IMAGE_EXTENSIONS;

export type FeedbackImageFileLike = {
  size: number;
  type: string;
};

export type FeedbackImageAttachment = {
  bucketId: typeof FEEDBACK_IMAGE_BUCKET;
  objectPath: string;
  mimeType: FeedbackImageMimeType;
  size: number;
};

type FeedbackImageStorageClient = {
  from(bucketId: string): {
    createSignedUrl(
      path: string,
      expiresIn: number
    ): Promise<{
      data: { signedUrl: string } | null;
      error: { message?: string } | null;
    }>;
    upload(
      path: string,
      fileBody: FeedbackImageFileLike,
      options: {
        contentType: FeedbackImageMimeType;
        upsert: false;
      }
    ): Promise<{
      data: { path: string } | null;
      error: { message?: string } | null;
    }>;
  };
};

const getFeedbackImageExtension = (mimeType: string) => {
  if (mimeType in FEEDBACK_IMAGE_EXTENSIONS) {
    return FEEDBACK_IMAGE_EXTENSIONS[mimeType as FeedbackImageMimeType];
  }

  return null;
};

const isSafePathComponent = (component: string) => {
  if (!component) return false;
  if (component === '.' || component === '..') return false;
  if (component.includes('/')) return false;
  if (component.includes('\\')) return false;
  if (ENCODED_SEPARATOR_PATTERN.test(component)) return false;
  if (component.trim().length === 0) return false;
  return !/[\u0000-\u001F]/.test(component);
};

const assertSafeObjectPath = (objectPath: string) => {
  const components = objectPath.split('/');
  if (components.length < 2) {
    throw new Error('Feedback image path must stay inside a user namespace.');
  }

  if (components.some((component) => !isSafePathComponent(component))) {
    throw new Error('Feedback image path is invalid.');
  }
};

const getRandomUuid = () => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (!uuid) {
    throw new Error('Secure random UUID generation is unavailable.');
  }

  return uuid;
};

export const validateFeedbackImageFile = (file: FeedbackImageFileLike) => {
  const extension = getFeedbackImageExtension(file.type);
  if (!extension) {
    throw new Error('Only JPEG, PNG, WebP, and GIF images are allowed.');
  }

  if (file.size > FEEDBACK_IMAGE_MAX_BYTES) {
    throw new Error('Feedback images must be 5 MiB or smaller.');
  }

  return {
    extension,
    mimeType: file.type as FeedbackImageMimeType,
  };
};

export const createFeedbackImageAttachment = ({
  file,
  userId,
}: {
  file: FeedbackImageFileLike;
  userId: string;
}): FeedbackImageAttachment => {
  if (!isSafePathComponent(userId)) {
    throw new Error('Feedback image user namespace is invalid.');
  }

  const { extension, mimeType } = validateFeedbackImageFile(file);
  const objectPath = `${userId}/${getRandomUuid()}.${extension}`;

  return {
    bucketId: FEEDBACK_IMAGE_BUCKET,
    objectPath,
    mimeType,
    size: file.size,
  };
};

export const uploadFeedbackImage = async ({
  file,
  storage,
  userId,
}: {
  file: FeedbackImageFileLike;
  storage: FeedbackImageStorageClient;
  userId: string;
}) => {
  const attachment = createFeedbackImageAttachment({ file, userId });
  const { error } = await storage
    .from(attachment.bucketId)
    .upload(attachment.objectPath, file, {
      contentType: attachment.mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error('Feedback image upload failed.');
  }

  return attachment;
};

export const createFeedbackImageSignedUrl = async ({
  expiresIn = 3600,
  objectPath,
  storage,
}: {
  expiresIn?: number;
  objectPath: string;
  storage: FeedbackImageStorageClient;
}) => {
  assertSafeObjectPath(objectPath);

  const { data, error } = await storage
    .from(FEEDBACK_IMAGE_BUCKET)
    .createSignedUrl(objectPath, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error('Failed to create feedback image signed URL.');
  }

  return data.signedUrl;
};
