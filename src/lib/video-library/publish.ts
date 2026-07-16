import type { ClassRecordingPayload } from '@/types/live-session-invite';

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
