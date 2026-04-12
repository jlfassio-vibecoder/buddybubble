import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Soft-archive program-linked workouts that are not yet in a terminal column (`done` / `completed`),
 * so the shared Kanban stays clean after a program completes. Preserves rows + `program_id` for history.
 */
export async function archiveOpenChildWorkoutsForProgram(
  supabase: SupabaseClient,
  programTaskId: string,
): Promise<{ error?: string }> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('tasks')
    .update({ archived_at: now })
    .eq('program_id', programTaskId)
    .in('item_type', ['workout', 'workout_log'])
    .is('archived_at', null)
    .not('status', 'in', '(done,completed)');
  if (error) return { error: error.message };
  return {};
}
