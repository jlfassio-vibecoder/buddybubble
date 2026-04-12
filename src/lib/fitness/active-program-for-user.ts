import type { SupabaseClient } from '@supabase/supabase-js';
import { metadataFieldsFromParsed, parseTaskMetadata } from '@/lib/item-metadata';
import type { Json } from '@/types/database';

/** Same “active program” predicate as `programTaskDerived` in ProgramsBoard. */
export function programTaskIsActiveForGuard(task: {
  status: string | null;
  metadata: Json;
}): boolean {
  const fields = metadataFieldsFromParsed(parseTaskMetadata(task.metadata));
  const dw = parseInt(fields.programDurationWeeks, 10) || 0;
  const cw = fields.programCurrentWeek;
  const isFinished = task.status === 'completed' || (dw > 0 && cw > dw);
  return !isFinished && (cw > 0 || task.status === 'in_progress');
}

/**
 * Returns true if another program in the workspace (any bubble) is already active for this user.
 * Used to enforce one active program per user per workspace.
 */
export async function hasOtherActiveProgramForUserInWorkspace(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
  excludeProgramId: string,
): Promise<boolean> {
  const { data: bubbleRows, error: bErr } = await supabase
    .from('bubbles')
    .select('id')
    .eq('workspace_id', workspaceId);
  if (bErr || !bubbleRows?.length) return false;

  const bubbleIds = bubbleRows.map((r) => r.id as string);
  const { data: rows, error } = await supabase
    .from('tasks')
    .select('id, status, metadata, assigned_to')
    .in('bubble_id', bubbleIds)
    .eq('item_type', 'program')
    .eq('assigned_to', userId)
    .is('archived_at', null);

  if (error || !rows?.length) return false;

  for (const row of rows as { id: string; status: string | null; metadata: Json }[]) {
    if (row.id === excludeProgramId) continue;
    if (programTaskIsActiveForGuard(row)) return true;
  }
  return false;
}
