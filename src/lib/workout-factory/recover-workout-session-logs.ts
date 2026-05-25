import type { SupabaseClient } from '@supabase/supabase-js';
import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import type { WorkoutExercise } from '@/lib/item-metadata';
import {
  buildPlayerInitialLogRowsForExercise,
  buildPlayerInitialLogs,
} from '@/lib/workout-factory/resolve-player-log-row-count';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import { isSetDraftMatrix } from '@/lib/workout-factory/workout-log-matrix';

export type RecoverWorkoutSessionLogsParams = {
  supabase: SupabaseClient;
  bubbleId: string;
  sourceTaskId: string;
  exercises: WorkoutExercise[];
  blocks: WorkoutSessionBlockView[];
};

export type RecoverWorkoutSessionLogsResult = {
  draftLogs: SetDraft[][];
  logTaskId: string | null;
};

async function prefillFromHistoricalCompletedLog(
  supabase: SupabaseClient,
  bubbleId: string,
  sourceTaskId: string,
  exercises: WorkoutExercise[],
  blocks: WorkoutSessionBlockView[],
): Promise<SetDraft[][]> {
  let prefilledLogs = buildPlayerInitialLogs(exercises, blocks);

  const { data: historical } = await supabase
    .from('tasks')
    .select('metadata')
    .eq('bubble_id', bubbleId)
    .eq('item_type', 'workout_log')
    .eq('status', 'completed')
    .eq('metadata->>source_task_id', sourceTaskId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const histMeta = historical?.metadata;
  if (!histMeta || typeof histMeta !== 'object' || Array.isArray(histMeta)) {
    return prefilledLogs;
  }

  const rawEx = (histMeta as { exercises?: unknown }).exercises;
  if (!Array.isArray(rawEx) || rawEx.length === 0) {
    return prefilledLogs;
  }

  const byName = new Map<string, WorkoutExercise>();
  for (const h of rawEx) {
    if (h == null || typeof h !== 'object' || Array.isArray(h)) continue;
    const he = h as WorkoutExercise;
    if (typeof he.name !== 'string') continue;
    const key = he.name.toLowerCase().trim();
    if (!byName.has(key)) byName.set(key, he);
  }

  prefilledLogs = exercises.map((ex, i) => {
    const base = buildPlayerInitialLogRowsForExercise(ex, i, blocks);
    const key = ex.name.toLowerCase().trim();
    const hist = byName.get(key);
    if (!hist?.set_logs || !Array.isArray(hist.set_logs)) return base;
    return base.map((cell, j) => {
      const sl = hist.set_logs![j];
      if (sl == null || typeof sl !== 'object') {
        return { ...cell, done: false };
      }
      return {
        weight: sl.weight != null ? String(sl.weight) : cell.weight,
        reps: sl.reps != null ? String(sl.reps) : cell.reps,
        rpe: sl.rpe != null ? String(sl.rpe) : cell.rpe,
        done: false,
      };
    });
  });

  return prefilledLogs;
}

export async function recoverWorkoutSessionLogs(
  params: RecoverWorkoutSessionLogsParams,
): Promise<RecoverWorkoutSessionLogsResult> {
  const { supabase, bubbleId, sourceTaskId, exercises, blocks } = params;

  const { data: draft, error } = await supabase
    .from('tasks')
    .select('id, metadata')
    .eq('bubble_id', bubbleId)
    .eq('item_type', 'workout_log')
    .eq('status', 'in_progress')
    .eq('metadata->>source_task_id', sourceTaskId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (draft?.id) {
    const meta = draft.metadata;
    const raw =
      meta && typeof meta === 'object' && !Array.isArray(meta)
        ? (meta as { draft_logs?: unknown }).draft_logs
        : undefined;
    if (isSetDraftMatrix(raw) && raw.length === exercises.length) {
      return { draftLogs: raw, logTaskId: draft.id };
    }
  }

  const draftLogs = await prefillFromHistoricalCompletedLog(
    supabase,
    bubbleId,
    sourceTaskId,
    exercises,
    blocks,
  );

  return { draftLogs, logTaskId: null };
}
