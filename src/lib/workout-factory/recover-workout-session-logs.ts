import type { SupabaseClient } from '@supabase/supabase-js';
import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import type { WorkoutExercise } from '@/lib/item-metadata';
import {
  buildBlankSessionDraftLogs,
  buildGhostLogsFromHistoricalMetadata,
  type GhostSetSnapshot,
} from '@/lib/workout-factory/ghost-set-snapshot';
import {
  buildPlayerInitialLogRowsForExercise,
  buildPlayerInitialLogs,
} from '@/lib/workout-factory/resolve-player-log-row-count';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import { isSetDraftMatrix } from '@/lib/workout-factory/workout-log-matrix';

export type { GhostSetSnapshot } from '@/lib/workout-factory/ghost-set-snapshot';

/** Stable digest of session shape for draft log recovery — length-only deps miss in-place edits. */
export function buildWorkoutSessionHydrationFingerprint(
  exercises: WorkoutExercise[],
  blocks: WorkoutSessionBlockView[],
): string {
  const exercisePart = exercises
    .map((e) => {
      const reps = e.reps ?? '';
      const sets = e.sets ?? '';
      const weight = e.weight ?? '';
      return `${e.name}\t${sets}\t${reps}\t${weight}`;
    })
    .join('\n');
  const blockPart = blocks
    .map((b) => {
      const exNames = b.exercises.map((x) => x.exerciseName.trim() || 'Exercise').join(',');
      const instr = b.instructions.join('|');
      const params = JSON.stringify(b.formatParams ?? {});
      return `${b.id}\t${b.section}\t${b.name}\t${b.blockFormat ?? ''}\t${params}\t${exNames}\t${instr}`;
    })
    .join('\n');
  return `${exercisePart}::${blockPart}`;
}

export type RecoverWorkoutSessionLogsParams = {
  supabase: SupabaseClient;
  /** Bubble where workout_log rows are stored (Workout Logs channel). */
  logBubbleId: string;
  sourceTaskId: string;
  exercises: WorkoutExercise[];
  blocks: WorkoutSessionBlockView[];
  /** V1 WorkoutPlayer prefill vs V2 Active Session ghost placeholders. */
  mode?: 'v1-prefill' | 'v2-ghost';
};

export type RecoverWorkoutSessionLogsResult = {
  draftLogs: SetDraft[][];
  ghostLogs: GhostSetSnapshot[][];
  logTaskId: string | null;
};

export async function fetchLatestCompletedWorkoutLog(
  supabase: SupabaseClient,
  logBubbleId: string,
  sourceTaskId: string,
): Promise<{ metadata: unknown; created_at: string } | null> {
  const { data: historical } = await supabase
    .from('tasks')
    .select('metadata, created_at')
    .eq('bubble_id', logBubbleId)
    .eq('item_type', 'workout_log')
    .eq('status', 'completed')
    .eq('metadata->>source_task_id', sourceTaskId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const histMeta = historical?.metadata;
  if (
    !historical?.created_at ||
    !histMeta ||
    typeof histMeta !== 'object' ||
    Array.isArray(histMeta)
  ) {
    return null;
  }
  return { metadata: histMeta, created_at: historical.created_at };
}

export async function fetchLatestCompletedWorkoutLogMetadata(
  supabase: SupabaseClient,
  logBubbleId: string,
  sourceTaskId: string,
): Promise<unknown | null> {
  const row = await fetchLatestCompletedWorkoutLog(supabase, logBubbleId, sourceTaskId);
  return row?.metadata ?? null;
}

/** V2: skip resuming in_progress draft when a completed log superseded it (orphan draft). */
export function shouldRestoreInProgressDraft(
  mode: 'v1-prefill' | 'v2-ghost',
  draftCreatedAt: string,
  latestCompletedCreatedAt: string | null,
): boolean {
  if (mode === 'v1-prefill') return true;
  if (!latestCompletedCreatedAt) return true;
  return new Date(draftCreatedAt).getTime() > new Date(latestCompletedCreatedAt).getTime();
}

async function prefillFromHistoricalCompletedLog(
  supabase: SupabaseClient,
  logBubbleId: string,
  sourceTaskId: string,
  exercises: WorkoutExercise[],
  blocks: WorkoutSessionBlockView[],
): Promise<SetDraft[][]> {
  let prefilledLogs = buildPlayerInitialLogs(exercises, blocks);

  const histMeta = await fetchLatestCompletedWorkoutLogMetadata(
    supabase,
    logBubbleId,
    sourceTaskId,
  );
  if (!histMeta) {
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
  const { supabase, logBubbleId, sourceTaskId, exercises, blocks, mode = 'v2-ghost' } = params;

  const latestCompleted = await fetchLatestCompletedWorkoutLog(supabase, logBubbleId, sourceTaskId);
  const histMeta = latestCompleted?.metadata ?? null;
  const ghostLogs = buildGhostLogsFromHistoricalMetadata(histMeta, exercises, blocks);

  const { data: draft, error } = await supabase
    .from('tasks')
    .select('id, metadata, created_at')
    .eq('bubble_id', logBubbleId)
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
    const draftCreatedAt = typeof draft.created_at === 'string' ? draft.created_at : null;
    if (
      isSetDraftMatrix(raw) &&
      raw.length === exercises.length &&
      draftCreatedAt != null &&
      shouldRestoreInProgressDraft(mode, draftCreatedAt, latestCompleted?.created_at ?? null)
    ) {
      return { draftLogs: raw, ghostLogs, logTaskId: draft.id };
    }
  }

  if (mode === 'v1-prefill') {
    const draftLogs = await prefillFromHistoricalCompletedLog(
      supabase,
      logBubbleId,
      sourceTaskId,
      exercises,
      blocks,
    );
    return { draftLogs, ghostLogs, logTaskId: null };
  }

  const draftLogs = buildBlankSessionDraftLogs(exercises, blocks);
  return { draftLogs, ghostLogs, logTaskId: null };
}
