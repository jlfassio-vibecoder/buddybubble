export const TASK_ATTACHMENTS_BUCKET = 'task-attachments';

/** Matches RLS: {workspace_id}/{task_id}/{filename} */
export function buildTaskAttachmentObjectPath(
  workspaceId: string,
  taskId: string,
  fileName: string,
): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${workspaceId}/${taskId}/${crypto.randomUUID()}_${safe}`;
}
