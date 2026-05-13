import type { Json } from '@/types/database';
import type { ClassRecordingPayload } from '@/types/live-session-invite';

/** Merge or remove `metadata.class_recording` without touching other metadata keys. */
export function mergeClassRecordingIntoInstanceMetadata(
  metadata: Json | unknown,
  recording: ClassRecordingPayload | null,
): Json {
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  if (recording == null) {
    delete base.class_recording;
  } else {
    base.class_recording = { ...recording };
  }
  return base as Json;
}

export type ClassRecordingMemberCta =
  | 'queueOnly'
  | 'recording'
  | 'uploading'
  | 'editorProcessing'
  | 'ready'
  | 'failed';

/** Member-facing CTA for the async play control when `async_session` exists. */
export function classRecordingMemberCta(
  recording: ClassRecordingPayload | null,
): ClassRecordingMemberCta {
  if (!recording) return 'queueOnly';
  if (recording.status === 'failed') return 'failed';
  if (recording.status === 'ready') return 'ready';
  if (recording.status === 'recording') return 'recording';
  if (recording.status === 'uploading') return 'uploading';
  if (recording.status === 'processing') {
    return recording.provider === 'manual' ? 'editorProcessing' : 'uploading';
  }
  return 'queueOnly';
}
