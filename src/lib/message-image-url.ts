/**
 * Signed URLs for message-attachment images. Optional Storage image transforms when
 * `NEXT_PUBLIC_STORAGE_IMAGE_TRANSFORM=1` (requires Supabase project image transformation).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export const MESSAGE_THUMB_IMAGE_WIDTH = 320;

export function isStorageImageTransformEnabled(): boolean {
  return process.env.NEXT_PUBLIC_STORAGE_IMAGE_TRANSFORM === '1';
}

type Supa = SupabaseClient<Database>;

export async function createSignedUrlForMessageImageThumb(
  supabase: Supa,
  bucket: string,
  path: string,
): Promise<string | null> {
  if (isStorageImageTransformEnabled()) {
    const withTransform = await supabase.storage.from(bucket).createSignedUrl(path, 3600, {
      transform: {
        width: MESSAGE_THUMB_IMAGE_WIDTH,
        resize: 'cover',
        quality: 80,
      },
    });
    if (!withTransform.error && withTransform.data?.signedUrl) {
      return withTransform.data.signedUrl;
    }
  }
  const plain = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (!plain.error && plain.data?.signedUrl) {
    return plain.data.signedUrl;
  }
  return null;
}
