import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@/types/database';
import { metadataFieldsFromParsed, parseTaskMetadata } from '@/lib/item-metadata';
import { archiveOpenChildWorkoutsForProgram } from '@/lib/fitness/archive-program-child-workouts';

export function programHasDataFromMetadata(metadata: Json): boolean {
  const m = parseTaskMetadata(metadata) as Record<string, unknown>;
  if (m.ai_program_personalization != null) return true;
  const fields = metadataFieldsFromParsed(metadata);
  return fields.programCurrentWeek > 0;
}

export async function hasNonArchivedChildTasksForProgram(
  supabase: SupabaseClient,
  programTaskId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('program_id', programTaskId)
    .in('item_type', ['workout', 'workout_log'])
    .is('archived_at', null);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** True if metadata indicates progress/personalization or any non-archived child workouts/logs exist. */
export async function programHasAssociatedData(
  supabase: SupabaseClient,
  task: { id: string; metadata: Json },
): Promise<boolean> {
  if (programHasDataFromMetadata(task.metadata)) return true;
  return hasNonArchivedChildTasksForProgram(supabase, task.id);
}

export async function archiveProgramTaskOnly(
  supabase: SupabaseClient,
  programTaskId: string,
): Promise<{ error?: string }> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('tasks')
    .update({ archived_at: now })
    .eq('id', programTaskId)
    .is('archived_at', null);
  if (error) return { error: error.message };
  return {};
}

/** Soft-archive all program-linked workouts/logs, then the program row. */
export async function archiveProgramAndAllChildTasks(
  supabase: SupabaseClient,
  programTaskId: string,
): Promise<{ error?: string }> {
  const now = new Date().toISOString();
  const { error: cErr } = await supabase
    .from('tasks')
    .update({ archived_at: now })
    .eq('program_id', programTaskId)
    .in('item_type', ['workout', 'workout_log'])
    .is('archived_at', null);
  if (cErr) return { error: cErr.message };
  return archiveProgramTaskOnly(supabase, programTaskId);
}

/** Mark program completed, set `program_ended_at`, archive open child workouts (preserves rows for history). */
export async function endProgramKeepingHistory(
  supabase: SupabaseClient,
  programTaskId: string,
  metadata: Json,
): Promise<{ error?: string }> {
  const newMetadata = {
    ...(parseTaskMetadata(metadata) as Record<string, unknown>),
    program_ended_at: new Date().toISOString(),
  };
  const { error: updateErr } = await supabase
    .from('tasks')
    .update({ status: 'completed', metadata: newMetadata })
    .eq('id', programTaskId);
  if (updateErr) return { error: updateErr.message };
  const { error: childErr } = await archiveOpenChildWorkoutsForProgram(supabase, programTaskId);
  if (childErr) return { error: childErr };
  return {};
}
