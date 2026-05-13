/** Supabase Storage bucket for class instance video recordings (see migration). */
export const CLASS_RECORDINGS_BUCKET = 'class-recordings' as const;

/** Agora `fileNamePrefix` segments are hyphen-stripped lowercase hex (see `agora-recording-start`). */
export function agoraRecordingFolderSegment(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

/** Hyphenated UUID string form (versions 1–5 per RFC shape). */
const UUID_PATH_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * If `storagePath` starts with hyphenated workspace/instance UUIDs, return the key layout
 * Agora's uploader uses (stripped first two segments). Otherwise return the path unchanged
 * (already Agora layout, or legacy manual layout — callers should try the original path first).
 */
export function storagePathAsAgoraUploadKey(storagePath: string): string {
  const trimmed = storagePath.trim().replace(/^\/+/, '');
  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length < 3) return trimmed;
  const seg0 = parts[0] ?? '';
  const seg1 = parts[1] ?? '';
  const tail = parts.slice(2).join('/');
  if (UUID_PATH_SEGMENT.test(seg0) && UUID_PATH_SEGMENT.test(seg1)) {
    return `${agoraRecordingFolderSegment(seg0)}/${agoraRecordingFolderSegment(seg1)}/${tail}`;
  }
  return trimmed;
}

/**
 * Path convention: `{workspace_id}/{class_instance_id}/{filename}`
 * Must match storage RLS policies.
 */
export function buildClassRecordingObjectPath(
  workspaceId: string,
  classInstanceId: string,
  fileName: string,
): string {
  const base = fileName.replace(/^.*[/\\]/, '').replace(/[^\w.\-]+/g, '_');
  const safe = base.length > 0 ? base : 'recording.mp4';
  return `${workspaceId.trim()}/${classInstanceId.trim()}/${safe}`;
}
