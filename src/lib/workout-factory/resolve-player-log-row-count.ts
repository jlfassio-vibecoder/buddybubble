/**
 * Block-aware log row counts for WorkoutPlayer (Step 6 M6.1).
 * Must stay aligned with M6.2 live_set_counts on the Coach rail.
 */

import type { WorkoutExercise } from '@/lib/item-metadata';
import {
  blockContextForGlobalIndex,
  buildPlayerExerciseIndexLookup,
  type PlayerLogRowBlockContext,
} from '@/lib/workout-factory/workout-player-exercise-index';
import { resolveEmomTotalRounds } from '@/lib/workout-factory/interval-timer/resolve-emom-total-rounds';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';

export type { PlayerLogRowBlockContext };

export type PlayerLogSetDraft = {
  weight: string;
  reps: string;
  rpe: string;
  done: boolean;
};

/** Main-block formats where formatParams.rounds drives fillable log rows. */
const ROUND_DRIVEN_BLOCK_FORMATS = new Set(['tabata', 'emom', 'circuit', 'superset', 'contrast']);

function positiveInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n > 0 ? n : null;
}

function isRoundDrivenBlockFormat(blockFormat: string | null): boolean {
  if (!blockFormat) return false;
  return ROUND_DRIVEN_BLOCK_FORMATS.has(blockFormat.trim().toLowerCase());
}

function defaultSetDraft(exercise: WorkoutExercise): PlayerLogSetDraft {
  return {
    weight: exercise.weight != null ? String(exercise.weight) : '',
    reps: typeof exercise.reps === 'number' ? String(exercise.reps) : '',
    rpe: exercise.rpe != null ? String(exercise.rpe) : '',
    done: false,
  };
}

/**
 * How many fillable log rows the player should render for one flat exercise index.
 */
export function resolvePlayerLogRowCount(
  exercise: WorkoutExercise,
  blockContext: PlayerLogRowBlockContext | null,
): number {
  if (blockContext && isRoundDrivenBlockFormat(blockContext.blockFormat)) {
    const blockFormat = blockContext.blockFormat;
    if (blockFormat?.trim().toLowerCase() === 'emom') {
      const emomRounds = resolveEmomTotalRounds(blockContext.formatParams);
      if (emomRounds != null && emomRounds > 0) return emomRounds;
    }
    const fromParams = positiveInt(blockContext.formatParams.rounds);
    if (fromParams != null) return fromParams;
  }

  const exerciseRounds = positiveInt(exercise.rounds);
  if (exerciseRounds != null) return exerciseRounds;

  const exerciseSets = positiveInt(exercise.sets);
  if (exerciseSets != null) return exerciseSets;

  return Math.max(1, exercise.sets ?? 3);
}

function makeSetRowsForExercise(
  exercise: WorkoutExercise,
  blockContext: PlayerLogRowBlockContext | null,
): PlayerLogSetDraft[] {
  const count = resolvePlayerLogRowCount(exercise, blockContext);
  const template = defaultSetDraft(exercise);
  return Array.from({ length: count }, () => ({ ...template }));
}

/**
 * Initial SetDraft matrix for WorkoutPlayer open / recovery (block-aware).
 */
export function buildPlayerInitialLogs(
  exercises: WorkoutExercise[],
  blocks: WorkoutSessionBlockView[],
): PlayerLogSetDraft[][] {
  const lookup = buildPlayerExerciseIndexLookup(blocks);
  return exercises.map((exercise, globalIndex) => {
    const blockContext = blockContextForGlobalIndex(globalIndex, blocks, lookup);
    return makeSetRowsForExercise(exercise, blockContext);
  });
}

/** Single-exercise rows (historical prefill base). */
export function buildPlayerInitialLogRowsForExercise(
  exercise: WorkoutExercise,
  globalIndex: number,
  blocks: WorkoutSessionBlockView[],
): PlayerLogSetDraft[] {
  const lookup = buildPlayerExerciseIndexLookup(blocks);
  const blockContext = blockContextForGlobalIndex(globalIndex, blocks, lookup);
  return makeSetRowsForExercise(exercise, blockContext);
}
