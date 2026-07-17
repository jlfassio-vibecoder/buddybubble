import { isVideoAggregationMetadata } from '@/lib/video-library/provision-aggregation-parent';
import {
  parseClassRecordingFromInstanceMetadata,
  type ClassRecordingPayload,
} from '@/types/live-session-invite';

export type VideoLibraryAccessScope = 'workspace' | 'bubble_members' | 'public_storefront';

/** True when a class recording can be published to the Video Library. */
export function isRecordingReadyToPublish(
  recording: ClassRecordingPayload | null | undefined,
): boolean {
  if (!recording || recording.status !== 'ready') return false;
  const path = recording.storagePath?.trim();
  const url = recording.playbackUrl?.trim();
  return Boolean(path || url);
}

/**
 * True when a class instance can be published: ready single-VOD recording, or a video aggregation
 * parent (media lives on child links).
 */
export function canPublishClassInstanceToLibrary(
  metadata: unknown,
  recording: ClassRecordingPayload | null | undefined = parseClassRecordingFromInstanceMetadata(
    metadata,
  ),
): boolean {
  if (isVideoAggregationMetadata(metadata)) return true;
  return isRecordingReadyToPublish(recording);
}
