import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CLASS_RECORDINGS_BUCKET,
  storagePathAsAgoraUploadKey,
} from '@/lib/class-recording-storage';
import { formatUserFacingError } from '@/lib/format-error';
import type { ClassRecordingPayload } from '@/types/live-session-invite';
import type { Database } from '@/types/database';

export type ResolveClassRecordingUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Resolve a playable URL for a ready class recording (direct playbackUrl or 4h signed storage URL).
 */
export async function resolveClassRecordingPlaybackUrl(
  supabase: SupabaseClient<Database>,
  recording: ClassRecordingPayload | null | undefined,
): Promise<ResolveClassRecordingUrlResult> {
  if (!recording || recording.status !== 'ready') {
    return { ok: false, error: 'Recording is not ready for playback.' };
  }

  const direct = recording.playbackUrl?.trim() ?? '';
  if (direct) return { ok: true, url: direct };

  const path = recording.storagePath?.trim() ?? '';
  if (!path) {
    return { ok: false, error: 'Recording playback URL is missing.' };
  }

  const altPath = storagePathAsAgoraUploadKey(path);
  const candidates = path === altPath ? [path] : [path, altPath];
  let lastErr: string | null = null;

  for (const candidate of candidates) {
    const { data, error } = await supabase.storage
      .from(CLASS_RECORDINGS_BUCKET)
      .createSignedUrl(candidate, 60 * 60 * 4);
    if (error) lastErr = formatUserFacingError(error);
    if (!error && data?.signedUrl) {
      return { ok: true, url: data.signedUrl };
    }
  }

  return {
    ok: false,
    error: lastErr ?? 'Could not create a playback link for this recording.',
  };
}
