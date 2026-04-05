import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  createSignedUrlForMessageImageThumb,
  isStorageImageTransformEnabled,
  MESSAGE_THUMB_IMAGE_WIDTH,
} from './message-image-url';

describe('isStorageImageTransformEnabled', () => {
  const original = process.env.NEXT_PUBLIC_STORAGE_IMAGE_TRANSFORM;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_STORAGE_IMAGE_TRANSFORM;
    } else {
      process.env.NEXT_PUBLIC_STORAGE_IMAGE_TRANSFORM = original;
    }
  });

  it('is true when env is 1', () => {
    process.env.NEXT_PUBLIC_STORAGE_IMAGE_TRANSFORM = '1';
    expect(isStorageImageTransformEnabled()).toBe(true);
  });

  it('is false otherwise', () => {
    delete process.env.NEXT_PUBLIC_STORAGE_IMAGE_TRANSFORM;
    expect(isStorageImageTransformEnabled()).toBe(false);
  });
});

describe('createSignedUrlForMessageImageThumb', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_STORAGE_IMAGE_TRANSFORM;
  });

  it('uses plain signed URL when transform flag is off', async () => {
    const from = vi.fn().mockReturnValue({
      createSignedUrl: vi
        .fn()
        .mockResolvedValue({ data: { signedUrl: 'https://example.com/plain' }, error: null }),
    });
    const supabase = { storage: { from } } as never;
    const url = await createSignedUrlForMessageImageThumb(
      supabase,
      'message-attachments',
      'w/m/x.jpg',
    );
    expect(url).toBe('https://example.com/plain');
    expect(from().createSignedUrl).toHaveBeenCalledWith('w/m/x.jpg', 3600);
  });

  it('requests transform when flag is on', async () => {
    process.env.NEXT_PUBLIC_STORAGE_IMAGE_TRANSFORM = '1';
    const from = vi.fn().mockReturnValue({
      createSignedUrl: vi
        .fn()
        .mockResolvedValueOnce({ data: { signedUrl: 'https://example.com/t' }, error: null }),
    });
    const supabase = { storage: { from } } as never;
    const url = await createSignedUrlForMessageImageThumb(
      supabase,
      'message-attachments',
      'w/m/x.jpg',
    );
    expect(url).toBe('https://example.com/t');
    expect(from().createSignedUrl).toHaveBeenCalledWith('w/m/x.jpg', 3600, {
      transform: {
        width: MESSAGE_THUMB_IMAGE_WIDTH,
        resize: 'cover',
        quality: 80,
      },
    });
  });

  it('falls back to plain URL when transform request fails', async () => {
    process.env.NEXT_PUBLIC_STORAGE_IMAGE_TRANSFORM = '1';
    const from = vi.fn().mockReturnValue({
      createSignedUrl: vi
        .fn()
        .mockResolvedValueOnce({ data: null, error: { message: 'no transform' } })
        .mockResolvedValueOnce({
          data: { signedUrl: 'https://example.com/fallback' },
          error: null,
        }),
    });
    const supabase = { storage: { from } } as never;
    const url = await createSignedUrlForMessageImageThumb(
      supabase,
      'message-attachments',
      'w/m/x.jpg',
    );
    expect(url).toBe('https://example.com/fallback');
    expect(from().createSignedUrl).toHaveBeenCalledTimes(2);
  });
});
