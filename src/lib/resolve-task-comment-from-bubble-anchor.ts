import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Maps a bubble-thread coach message (with `attached_task_id` = task) to the matching
 * task-scoped root `messages.id` so TaskModal can deep-link the comment thread.
 *
 * Heuristic: same `user_id`, `target_task_id` = task, `parent_id` null, `created_at` <= anchor
 * (agent seed comment is inserted just before the bubble reply).
 */
export async function resolveTaskCommentMessageIdFromBubbleAnchor(
  supabase: SupabaseClient,
  taskId: string,
  anchorBubbleMessageId: string,
): Promise<string | null> {
  const { data: anchor, error: anchorErr } = await supabase
    .from('messages')
    .select('user_id, created_at, attached_task_id')
    .eq('id', anchorBubbleMessageId)
    .maybeSingle();

  if (anchorErr || !anchor) return null;

  const row = anchor as {
    user_id?: string | null;
    created_at?: string | null;
    attached_task_id?: string | null;
  };
  const authorId = row.user_id;
  if (!authorId) return null;
  const attached = row.attached_task_id ?? null;
  if (!attached || attached !== taskId) return null;

  const createdAt = row.created_at;
  if (!createdAt) return null;

  const { data: match, error: matchErr } = await supabase
    .from('messages')
    .select('id')
    .eq('target_task_id', taskId)
    .is('parent_id', null)
    .eq('user_id', authorId)
    .lte('created_at', createdAt)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (matchErr || !match) return null;
  const id = (match as { id?: string }).id;
  return typeof id === 'string' && id.trim() !== '' ? id : null;
}
