import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createFeedbackImageAttachment,
  createFeedbackImageSignedUrl,
  FEEDBACK_IMAGE_BUCKET,
  FEEDBACK_IMAGE_MAX_BYTES,
  uploadFeedbackImage,
} from '../feedbackImages';

describe('feedbackImages', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates canonical attachment metadata without reusing the original filename', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('uuid-1234');

    const attachment = createFeedbackImageAttachment({
      file: { size: 1024, type: 'image/png' },
      userId: 'user-1',
    });

    expect(attachment).toEqual({
      bucketId: FEEDBACK_IMAGE_BUCKET,
      objectPath: 'user-1/uuid-1234.png',
      mimeType: 'image/png',
      size: 1024,
    });
  });

  it('rejects unsupported mime types and oversized images', () => {
    expect(() =>
      createFeedbackImageAttachment({
        file: { size: 1, type: 'image/svg+xml' },
        userId: 'user-1',
      })
    ).toThrow('Only JPEG, PNG, WebP, and GIF images are allowed.');

    expect(() =>
      createFeedbackImageAttachment({
        file: { size: FEEDBACK_IMAGE_MAX_BYTES + 1, type: 'image/jpeg' },
        userId: 'user-1',
      })
    ).toThrow('Feedback images must be 5 MiB or smaller.');
  });

  it('uploads with a trusted extension and upsert disabled', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('uuid-5678');
    const upload = vi.fn(async () => ({ data: { path: 'ignored' }, error: null }));
    const storage = {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(),
        upload,
      })),
    };

    const attachment = await uploadFeedbackImage({
      file: { size: 2048, type: 'image/webp' },
      storage,
      userId: 'user-1',
    });

    expect(upload).toHaveBeenCalledWith(
      'user-1/uuid-5678.webp',
      { size: 2048, type: 'image/webp' },
      { contentType: 'image/webp', upsert: false }
    );
    expect(attachment.objectPath).toBe('user-1/uuid-5678.webp');
  });

  it('creates signed display urls from canonical storage paths', async () => {
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: 'https://signed.example/object' },
      error: null,
    }));
    const storage = {
      from: vi.fn(() => ({
        createSignedUrl,
        upload: vi.fn(),
      })),
    };

    const signedUrl = await createFeedbackImageSignedUrl({
      objectPath: 'user-1/uuid-1234.jpg',
      storage,
    });

    expect(createSignedUrl).toHaveBeenCalledWith('user-1/uuid-1234.jpg', 3600);
    expect(signedUrl).toBe('https://signed.example/object');
  });

  it('rejects unsafe object paths before signing', async () => {
    const storage = {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(),
        upload: vi.fn(),
      })),
    };

    await expect(
      createFeedbackImageSignedUrl({
        objectPath: 'user-1/..%2Fother-user.png',
        storage,
      })
    ).rejects.toThrow('Feedback image path is invalid.');
  });
});
