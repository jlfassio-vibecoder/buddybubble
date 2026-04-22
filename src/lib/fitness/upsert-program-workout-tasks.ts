import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkoutExercise } from '@/lib/item-metadata';
import type { PersonalizeProgramSession } from '@/lib/workout-factory/types/personalize-program';
import type { Json, TaskVisibility } from '@/types/database';
import { replaceTaskAssigneesWithUserIds } from '@/lib/task-assignees-db';

export async function resolveThirdKanbanStatusSlug(
  supabase: SupabaseClient,
  workspaceId: string,
  fallbackSlug: string,
): Promise<{ slug: string; usedFallback: boolean }> {
  const { data, error } = await supabase
    .from('board_columns')
    .select('slug')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true });

  if (error || !data || data.length < 3) {
    return { slug: fallbackSlug, usedFallback: true };
  }
  const slug = data[2]?.slug;
  return typeof slug === 'string' && slug.trim()
    ? { slug: slug.trim(), usedFallback: false }
    : { slug: fallbackSlug, usedFallback: true };
}

export async function resolveWorkoutsBubbleId(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('bubbles')
    .select('id,name')
    .eq('workspace_id', workspaceId);
  if (error || !data?.length) return null;
  const row = data.find((b) => b.name.trim().toLowerCase() === 'workouts');
  return row?.id ?? null;
}

type TaskMeta = Record<string, unknown>;

function readMeta(metadata: unknown): TaskMeta {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as TaskMeta;
  }
  return {};
}

/**
 * Creates or updates `workout` tasks in the Workouts bubble, linked via `program_id` +
 * `program_session_key` on the task row (not JSON metadata).
 */
export async function upsertProgramWorkoutTasks(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  programTaskId: string;
  sessions: PersonalizeProgramSession[];
  /** Third column slug or fallback. */
  statusSlug: string;
  visibility: TaskVisibility;
}): Promise<{ error?: string }> {
  const { supabase, workspaceId, programTaskId, sessions, statusSlug, visibility } = params;

  const workoutsBubbleId = await resolveWorkoutsBubbleId(supabase, workspaceId);
  if (!workoutsBubbleId) {
    return { error: 'No “Workouts” bubble found in this socialspace.' };
  }

  const { data: programRow, error: programErr } = await supabase
    .from('tasks')
    .select('task_assignees(user_id)')
    .eq('id', programTaskId)
    .eq('item_type', 'program')
    .maybeSingle();

  if (programErr) {
    return { error: programErr.message };
  }

  const programAssigneeUserIds = [
    ...new Set(
      (
        (programRow as { task_assignees?: { user_id: string }[] | null } | null)?.task_assignees ??
        []
      )
        .map((r) => r.user_id)
        .filter((id): id is string => Boolean(id?.trim())),
    ),
  ];

  const { data: programWorkoutRows, error: fetchErr } = await supabase
    .from('tasks')
    .select('id,metadata,position,program_id,program_session_key')
    .eq('bubble_id', workoutsBubbleId)
    .eq('item_type', 'workout')
    .eq('program_id', programTaskId);

  if (fetchErr) {
    return { error: fetchErr.message };
  }

  const { data: maxPosRow, error: maxPosErr } = await supabase
    .from('tasks')
    .select('position')
    .eq('bubble_id', workoutsBubbleId)
    .eq('item_type', 'workout')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxPosErr) {
    return { error: maxPosErr.message };
  }

  const existing = (programWorkoutRows ?? []) as {
    id: string;
    metadata: unknown;
    position: number;
    program_id: string | null;
    program_session_key: string | null;
  }[];

  const linked = (key: string) =>
    existing.find((row) => row.program_id === programTaskId && row.program_session_key === key);

  let maxPos =
    maxPosRow == null
      ? -1
      : Math.max(-1, Number((maxPosRow as { position: unknown }).position) || 0);

  for (const session of sessions) {
    const exercises: WorkoutExercise[] = session.exercises ?? [];
    const workoutType = session.title.trim() || session.key;

    const row = linked(session.key);
    if (row) {
      const prev = readMeta(row.metadata);
      const cleaned = { ...prev };
      delete cleaned.linked_program_task_id;
      delete cleaned.program_session_key;
      const meta = {
        ...cleaned,
        exercises,
        workout_type: workoutType,
      } as Json;
      const { error: uErr } = await supabase
        .from('tasks')
        .update({
          title: session.title.trim() || session.key,
          description: session.description.trim() || null,
          status: statusSlug,
          metadata: meta,
          program_id: programTaskId,
          program_session_key: session.key,
        })
        .eq('id', row.id);
      if (uErr) return { error: uErr.message };
      const { error: syncErr } = await replaceTaskAssigneesWithUserIds(
        supabase,
        row.id,
        programAssigneeUserIds,
      );
      if (syncErr) return { error: syncErr };
    } else {
      maxPos += 1;
      const meta: Json = {
        exercises,
        workout_type: workoutType,
      } as Json;
      const { data: newRow, error: iErr } = await supabase
        .from('tasks')
        .insert({
          bubble_id: workoutsBubbleId,
          title: session.title.trim() || session.key,
          description: session.description.trim() || null,
          status: statusSlug,
          position: maxPos,
          priority: 'medium',
          item_type: 'workout',
          metadata: meta,
          program_id: programTaskId,
          program_session_key: session.key,
          visibility,
          attachments: [],
        })
        .select('id')
        .maybeSingle();
      if (iErr) return { error: iErr.message };
      if (newRow?.id) {
        const { error: syncErr } = await replaceTaskAssigneesWithUserIds(
          supabase,
          newRow.id,
          programAssigneeUserIds,
        );
        if (syncErr) return { error: syncErr };
      }
    }
  }

  return {};
}
