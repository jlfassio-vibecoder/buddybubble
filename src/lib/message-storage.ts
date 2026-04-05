import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { MessageAttachment } from '@/types/message-attachment';
import { parseMessageAttachments } from '@/types/message-attachment';

export const MESSAGE_ATTACHMENTS_BUCKET = 'message-attachments';

/** Matches RLS: {workspace_id}/{message_id}/{filename} */
export function buildMessageAttachmentObjectPath(
  workspaceId: string,
  messageId: string,
  fileName: string,
): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${workspaceId}/${messageId}/${crypto.randomUUID()}_${safe}`;
}

type Supa = SupabaseClient<Database>;

/**
 * Remove all storage objects for paths listed in attachment metadata (for use before/after message row delete).
 */
export async function removeMessageAttachmentObjects(
  supabase: Supa,
  attachments: MessageAttachment[],
): Promise<void> {
  const paths = new Set<string>();
  for (const a of attachments) {
    paths.add(a.path);
    if (a.thumb_path) paths.add(a.thumb_path);
  }
  const list = [...paths];
  if (list.length === 0) return;
  await supabase.storage.from(MESSAGE_ATTACHMENTS_BUCKET).remove(list);
}

/** Call when deleting a message row (or from a future delete-message action). */
export async function deleteMessageStorageObjects(
  supabase: Supa,
  _workspaceId: string,
  _messageId: string,
  attachmentsJson: unknown,
): Promise<void> {
  const arr = parseMessageAttachments(attachmentsJson as unknown);
  await removeMessageAttachmentObjects(supabase, arr);
}

/**
 * Delete every object under `{workspaceId}/{messageId}/` (catch-all for failed uploads or full folder wipe).
 */
export async function removeMessageAttachmentPrefix(
  supabase: Supa,
  workspaceId: string,
  messageId: string,
): Promise<void> {
  const folder = `${workspaceId}/${messageId}`;
  const paths: string[] = [];
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage
      .from(MESSAGE_ATTACHMENTS_BUCKET)
      .list(folder, { limit: pageSize, offset });
    if (error) {
      console.error('[message-storage] list prefix', error);
      return;
    }
    if (!data?.length) break;
    for (const item of data) {
      paths.push(`${folder}/${item.name}`);
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  if (paths.length === 0) return;
  await supabase.storage.from(MESSAGE_ATTACHMENTS_BUCKET).remove(paths);
}
