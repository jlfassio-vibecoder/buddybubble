import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

type Client = SupabaseClient<Database>;

/**
 * Replaces all `task_assignees` rows for a task with the given user ids (deduped, order preserved).
 * Call after inserting or updating a `tasks` row when the UI models assignees as `user_id[]`.
 */
export async function replaceTaskAssigneesWithUserIds(
  supabase: Client,
  taskId: string,
  userIds: string[],
): Promise<{ error: string | null }> {
  const { error: delErr } = await supabase.from('task_assignees').delete().eq('task_id', taskId);
  if (delErr) return { error: delErr.message };
  const unique = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return { error: null };
  const { error: insErr } = await supabase
    .from('task_assignees')
    .insert(unique.map((user_id) => ({ task_id: taskId, user_id })));
  return { error: insErr?.message ?? null };
}
