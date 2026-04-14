/**
 * Signed URLs for task-attachment images. Optional Storage image transforms when
 * `NEXT_PUBLIC_STORAGE_IMAGE_TRANSFORM=1` (same as message attachments).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { TASK_ATTACHMENTS_BUCKET } from '@/lib/task-storage';
import { isStorageImageTransformEnabled, MESSAGE_THUMB_IMAGE_WIDTH } from '@/lib/message-image-url';

/** Hero / card cover — wider than list thumbnails. */
export const TASK_CARD_COVER_IMAGE_WIDTH = 720;

type Supa = SupabaseClient<Database>;

export function isLikelyTaskAttachmentImageFileName(fileName: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fileName);
}

export async function createSignedUrlForTaskAttachmentThumb(
  supabase: Supa,
  path: string,
): Promise<string | null> {
  if (isStorageImageTransformEnabled()) {
    const withTransform = await supabase.storage
      .from(TASK_ATTACHMENTS_BUCKET)
      .createSignedUrl(path, 3600, {
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
  const plain = await supabase.storage.from(TASK_ATTACHMENTS_BUCKET).createSignedUrl(path, 3600);
  if (!plain.error && plain.data?.signedUrl) {
    return plain.data.signedUrl;
  }
  return null;
}

export async function createSignedUrlForTaskCardCover(
  supabase: Supa,
  path: string,
): Promise<string | null> {
  if (isStorageImageTransformEnabled()) {
    const withTransform = await supabase.storage
      .from(TASK_ATTACHMENTS_BUCKET)
      .createSignedUrl(path, 3600, {
        transform: {
          width: TASK_CARD_COVER_IMAGE_WIDTH,
          resize: 'cover',
          quality: 82,
        },
      });
    if (!withTransform.error && withTransform.data?.signedUrl) {
      return withTransform.data.signedUrl;
    }
  }
  const plain = await supabase.storage.from(TASK_ATTACHMENTS_BUCKET).createSignedUrl(path, 3600);
  if (!plain.error && plain.data?.signedUrl) {
    return plain.data.signedUrl;
  }
  return null;
}
