import { isRecordingReadyToPublish } from '@/lib/video-library/publish';
import { parseClassRecordingFromInstanceMetadata } from '@/types/live-session-invite';

export const PUBLIC_PLAYBACK_SIGNED_URL_TTL_SEC = 60 * 60;

export type PublicPlaybackPublicationRow = {
  unpublished_at: string | null;
  access_scope: string;
  workspace_is_public: boolean;
  class_instance_metadata: unknown;
};

export type PublicPlaybackSource =
  | { kind: 'storagePath'; storagePath: string }
  | { kind: 'playbackUrl'; playbackUrl: string };

/**
 * Hard gates for anonymous public playback. Service-role queries bypass RLS, so
 * every check must run in application code. Returns null when the publication
 * must not be playable (callers should respond 404 with a generic body).
 */
export function assertPublicPublicationPlayback(
  row: PublicPlaybackPublicationRow,
): PublicPlaybackSource | null {
  if (row.unpublished_at != null) return null;
  if (row.access_scope !== 'public_storefront') return null;
  if (row.workspace_is_public !== true) return null;

  const recording = parseClassRecordingFromInstanceMetadata(row.class_instance_metadata);
  if (!isRecordingReadyToPublish(recording) || !recording) return null;

  const storagePath = recording.storagePath?.trim();
  if (storagePath) {
    return { kind: 'storagePath', storagePath };
  }

  const playbackUrl = recording.playbackUrl?.trim();
  if (playbackUrl) {
    return { kind: 'playbackUrl', playbackUrl };
  }

  return null;
}
