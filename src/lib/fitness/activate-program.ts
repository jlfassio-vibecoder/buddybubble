import { addDays, format, isValid, parseISO } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database';

type Client = SupabaseClient<Database>;

const DEFAULT_THEME_COLOR = 'emerald';

/** Normalize calendar start to `YYYY-MM-DD` for date-only math (no UTC midnight drift). */
export function normalizeStartYmd(startDate: Date | string): string {
  if (typeof startDate === 'string') {
    const trimmed = startDate.trim();
    const ymd = trimmed.slice(0, 10);
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(ymd)
      ? parseISO(`${ymd}T12:00:00`)
      : parseISO(trimmed);
    if (!isValid(parsed)) throw new Error('Invalid startDate.');
    return format(parsed, 'yyyy-MM-dd');
  }
  if (!isValid(startDate)) throw new Error('Invalid startDate.');
  return format(startDate, 'yyyy-MM-dd');
}

async function cleanupActivatedProgramDraft(
  supabase: Client,
  shellTaskId: string,
  workoutTaskIds: string[] = [],
): Promise<void> {
  const taskIds = [shellTaskId, ...workoutTaskIds].filter(Boolean);
  if (taskIds.length === 0) return;
  await supabase.from('task_assignees').delete().in('task_id', taskIds);
  await supabase.from('tasks').delete().in('id', taskIds);
}

/**
 * Workout calendar day = startYmd + ((scheduled_week - 1) * 7) + ((scheduled_day - 1) * 1).
 * Anchors at noon on `startYmd` then adds whole days (same pattern as `sync-program-workout-schedules`).
 */
export function computeWorkoutScheduledOnYmd(
  startYmd: string,
  scheduledWeek: number | null | undefined,
  scheduledDay: number | null | undefined,
): string {
  const anchor = parseISO(`${startYmd.trim().slice(0, 10)}T12:00:00`);
  const w =
    scheduledWeek == null || Number.isNaN(Number(scheduledWeek)) ? 1 : Number(scheduledWeek);
  const d = scheduledDay == null || Number.isNaN(Number(scheduledDay)) ? 1 : Number(scheduledDay);
  const offsetDays = (Math.max(1, w) - 1) * 7 + (Math.max(1, d) - 1);
  return format(addDays(anchor, offsetDays), 'yyyy-MM-dd');
}

/** Inclusive end date for a program of `durationWeeks` weeks from start (day-aligned). */
export function computeProgramEndYmd(
  startYmd: string,
  durationWeeks: number | null | undefined,
): string {
  const weeks =
    durationWeeks == null || Number.isNaN(Number(durationWeeks))
      ? 0
      : Math.max(0, Number(durationWeeks));
  const anchor = parseISO(`${startYmd.trim().slice(0, 10)}T12:00:00`);
  return format(addDays(anchor, Math.max(0, weeks * 7 - 1)), 'yyyy-MM-dd');
}

export type ActivateProgramParams = {
  supabase: Client;
  workspaceId: string;
  bubbleId: string;
  programId: string;
  userId: string;
  startDate: Date | string;
  trainerId?: string;
  themeColor?: string;
};

export type ActivateProgramResult = {
  shellTaskId?: string;
  workoutTaskIds?: string[];
  error?: string;
};

/**
 * Activates a Trainer Hub program: creates a program shell task and scheduled workout child tasks,
 * then assigns them to `userId` via `task_assignees` so they appear on the calendar.
 *
 * Uses `tasks.scheduled_on` (not `scheduled_date`). Shell `item_type` is `program` with `metadata.is_shell`;
 * children use `item_type` `workout` with `metadata.source === 'workout_template'`.
 */
export async function activateProgram(
  params: ActivateProgramParams,
): Promise<ActivateProgramResult> {
  const {
    supabase,
    workspaceId,
    bubbleId,
    programId,
    userId,
    startDate,
    trainerId: trainerIdParam,
    themeColor,
  } = params;

  const color = (themeColor?.trim() || DEFAULT_THEME_COLOR) as string;

  if (!workspaceId?.trim()) return { error: 'workspaceId is required' };
  if (!bubbleId?.trim()) return { error: 'bubbleId is required' };
  if (!programId?.trim()) return { error: 'programId is required' };
  if (!userId?.trim()) return { error: 'userId is required' };

  let startYmd: string;
  try {
    startYmd = normalizeStartYmd(startDate);
  } catch {
    return { error: 'startDate is invalid' };
  }

  const { data: bubble, error: bubbleErr } = await supabase
    .from('bubbles')
    .select('id, workspace_id')
    .eq('id', bubbleId)
    .maybeSingle();

  if (bubbleErr) return { error: bubbleErr.message };
  if (!bubble || bubble.workspace_id !== workspaceId) {
    return { error: 'Bubble not found or does not belong to this workspace.' };
  }

  const { data: program, error: programErr } = await supabase
    .from('programs')
    .select('id, title, duration_weeks, trainer_id')
    .eq('id', programId)
    .maybeSingle();

  if (programErr) return { error: programErr.message };
  if (!program) return { error: 'Program not found.' };

  if (trainerIdParam?.trim() && program.trainer_id !== trainerIdParam.trim()) {
    return { error: 'trainerId does not match this program.' };
  }

  const { data: workoutRows, error: workoutsErr } = await supabase
    .from('workouts')
    .select('id, title, blocks, scheduled_week, scheduled_day')
    .eq('program_id', programId)
    .order('scheduled_week', { ascending: true, nullsFirst: true })
    .order('scheduled_day', { ascending: true, nullsFirst: true })
    .order('title', { ascending: true });

  if (workoutsErr) return { error: workoutsErr.message };

  const workouts = workoutRows ?? [];
  const endYmd = computeProgramEndYmd(startYmd, program.duration_weeks);
  const totalWorkouts = workouts.length;

  const { data: posRows, error: posErr } = await supabase
    .from('tasks')
    .select('position')
    .eq('bubble_id', bubbleId)
    .order('position', { ascending: false })
    .limit(1);

  if (posErr) return { error: posErr.message };
  const basePos =
    posRows && posRows.length > 0 ? Number((posRows[0] as { position: number }).position) + 1 : 0;

  const shellTitle = `${program.title?.trim() || 'Program'} Shell`;
  const shellMetadata: Json = {
    is_shell: true,
    source_program_id: programId,
    start_date: startYmd,
    end_date: endYmd,
    color,
    total_workouts: totalWorkouts,
    trainer_id: program.trainer_id,
  } as Json;

  const { data: shellRow, error: shellErr } = await supabase
    .from('tasks')
    .insert({
      bubble_id: bubbleId,
      title: shellTitle,
      description: null,
      status: 'todo',
      priority: 'medium',
      position: basePos,
      scheduled_on: startYmd,
      item_type: 'program',
      metadata: shellMetadata,
      visibility: 'private',
      attachments: [] as Json,
    })
    .select('id')
    .single();

  if (shellErr || !shellRow?.id) {
    return { error: shellErr?.message ?? 'Failed to create program shell task.' };
  }

  const shellTaskId = shellRow.id as string;

  const { error: shellAssignErr } = await supabase.from('task_assignees').insert({
    task_id: shellTaskId,
    user_id: userId,
  });
  if (shellAssignErr) {
    await cleanupActivatedProgramDraft(supabase, shellTaskId);
    return { shellTaskId, error: shellAssignErr.message };
  }

  if (workouts.length === 0) {
    return { shellTaskId, workoutTaskIds: [] };
  }

  const workoutInserts = workouts.map((w, i) => {
    const sw = w.scheduled_week;
    const sd = w.scheduled_day;
    const scheduledOn = computeWorkoutScheduledOnYmd(startYmd, sw, sd);
    const weekNum = sw == null || Number.isNaN(Number(sw)) ? 1 : Math.max(1, Number(sw));
    const isLocked = weekNum > 1;

    const meta: Json = {
      parent_shell_id: shellTaskId,
      source_workout_id: w.id,
      source: 'workout_template',
      color,
      is_locked: isLocked,
      blocks: w.blocks ?? [],
    } as Json;

    return {
      bubble_id: bubbleId,
      title: (w.title?.trim() || 'Workout') as string,
      description: null,
      status: 'todo' as const,
      priority: 'medium' as const,
      position: basePos + 1 + i,
      scheduled_on: scheduledOn,
      item_type: 'workout' as const,
      metadata: meta,
      visibility: 'private' as const,
      attachments: [] as Json,
      program_id: shellTaskId,
      program_session_key: `workout:${w.id}`,
    };
  });

  const { data: insertedWorkouts, error: wInsErr } = await supabase
    .from('tasks')
    .insert(workoutInserts)
    .select('id');

  if (wInsErr || !insertedWorkouts?.length) {
    await cleanupActivatedProgramDraft(supabase, shellTaskId);
    return {
      shellTaskId,
      error: wInsErr?.message ?? 'Failed to create workout tasks.',
    };
  }

  const workoutTaskIds = insertedWorkouts.map((r) => (r as { id: string }).id);
  const assigneeRows = workoutTaskIds.map((task_id) => ({ task_id, user_id: userId }));

  const { error: assignBulkErr } = await supabase.from('task_assignees').insert(assigneeRows);
  if (assignBulkErr) {
    await cleanupActivatedProgramDraft(supabase, shellTaskId, workoutTaskIds);
    return { shellTaskId, workoutTaskIds, error: assignBulkErr.message };
  }

  return { shellTaskId, workoutTaskIds };
}
