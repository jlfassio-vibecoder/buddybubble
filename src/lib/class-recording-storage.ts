/** Supabase Storage bucket for class instance video recordings (see migration). */
export const CLASS_RECORDINGS_BUCKET = 'class-recordings' as const;

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
