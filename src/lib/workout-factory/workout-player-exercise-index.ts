/**
 * Maps main-block exercises to global flat log indices for WorkoutPlayer.
 * Order matches flattening in workoutInSetToTaskExercises / getExercisesFromWorkout.
 */

import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';

export type PlayerExerciseIndexEntry = {
  blockId: string;
  exerciseIndexInBlock: number;
  globalIndex: number;
};

/**
 * Returns global flat index for each exercise in main blocks, in block display order.
 * Warmup / finisher / cooldown blocks are excluded (display-only).
 */
export function buildPlayerExerciseIndexLookup(
  blocks: WorkoutSessionBlockView[],
): PlayerExerciseIndexEntry[] {
  const out: PlayerExerciseIndexEntry[] = [];
  let globalIndex = 0;

  for (const block of blocks) {
    if (block.section !== 'main') continue;
    const exercises = block.exercises ?? [];
    for (let i = 0; i < exercises.length; i++) {
      out.push({
        blockId: block.id,
        exerciseIndexInBlock: i,
        globalIndex,
      });
      globalIndex += 1;
    }
  }

  return out;
}

/** Map globalIndex → entry for O(1) lookup when rendering. */
export function playerExerciseIndexByGlobalIndex(
  lookup: PlayerExerciseIndexEntry[],
): Map<number, PlayerExerciseIndexEntry> {
  return new Map(lookup.map((e) => [e.globalIndex, e]));
}
