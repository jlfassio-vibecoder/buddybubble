/**
 * Merge `metadata.class_recording` without clobbering other metadata keys (parity with
 * `src/lib/class-recording-metadata.ts`).
 */

export type ClassRecordingStatus = 'processing' | 'ready' | 'failed';

export type ClassRecordingPayload = {
  type: 'class_recording';
  status: ClassRecordingStatus;
  storagePath?: string;
  playbackUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  errorMessage?: string;
  /** Track 1 automated capture vs Track 2 manual upload */
  provider?: 'agora' | 'manual';
};

export function mergeClassRecordingIntoInstanceMetadata(
  metadata: unknown,
  recording: ClassRecordingPayload | null,
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  if (recording == null) {
    delete base.class_recording;
  } else {
    base.class_recording = { ...recording };
  }
  return base;
}
