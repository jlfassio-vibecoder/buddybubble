/**
 * Maps main-block exercises to global flat log indices for WorkoutPlayer.
 * Order matches flattening in workoutInSetToTaskExercises / getExercisesFromWorkout.
 */

import type { WorkoutExercise } from '@/lib/item-metadata';
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

/**
 * Splits a flat exercise list back into per main-block slices (same order as flattening).
 * When length matches the lookup, maps by global index; otherwise uses prior per-block counts
 * (remainder goes to the last main block).
 */
export function partitionFlatExercisesByMainBlocks(
  flatExercises: WorkoutExercise[],
  blocks: WorkoutSessionBlockView[],
): Map<string, WorkoutExercise[]> {
  const lookup = buildPlayerExerciseIndexLookup(blocks);
  const result = new Map<string, WorkoutExercise[]>();

  if (flatExercises.length === lookup.length) {
    for (const entry of lookup) {
      const ex = flatExercises[entry.globalIndex];
      if (!ex) continue;
      const list = result.get(entry.blockId) ?? [];
      list.push(ex);
      result.set(entry.blockId, list);
    }
    return result;
  }

  const mainBlocks = blocks.filter((b) => b.section === 'main');
  let offset = 0;
  for (let i = 0; i < mainBlocks.length; i++) {
    const block = mainBlocks[i]!;
    const prevCount = block.exercises?.length ?? 0;
    const isLast = i === mainBlocks.length - 1;
    const slice = isLast
      ? flatExercises.slice(offset)
      : flatExercises.slice(offset, offset + prevCount);
    result.set(block.id, slice);
    offset += isLast ? slice.length : prevCount;
  }
  return result;
}

/** Map globalIndex → entry for O(1) lookup when rendering. */
export function playerExerciseIndexByGlobalIndex(
  lookup: PlayerExerciseIndexEntry[],
): Map<number, PlayerExerciseIndexEntry> {
  return new Map(lookup.map((e) => [e.globalIndex, e]));
}

export type PlayerLogRowBlockContext = {
  blockFormat: string | null;
  formatParams: Record<string, unknown>;
  exerciseIndexInBlock: number;
};

/**
 * Main-block format context for a global flat exercise index (WorkoutPlayer log rows).
 */
export function blockContextForGlobalIndex(
  globalIndex: number,
  blocks: WorkoutSessionBlockView[],
  lookup?: PlayerExerciseIndexEntry[],
): PlayerLogRowBlockContext | null {
  const indexMap = lookup ?? buildPlayerExerciseIndexLookup(blocks);
  const entry = playerExerciseIndexByGlobalIndex(indexMap).get(globalIndex);
  if (!entry) return null;
  const block = blocks.find((b) => b.id === entry.blockId);
  if (!block || block.section !== 'main') return null;
  return {
    blockFormat: block.blockFormat,
    formatParams: block.formatParams ?? {},
    exerciseIndexInBlock: entry.exerciseIndexInBlock,
  };
}
