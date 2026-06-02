import type { Json } from '@/types/database';
import type { TaskRow } from '@/types/database';
import type { WorkoutExercise } from '@/lib/item-metadata';
import {
  buildEmomFormatParamsFromDraft,
  hydrateEmomAuthoringDraft,
  parseEmomStationsFromParams,
  reconcileEmomStationsForExerciseCount,
  type EmomAuthoringDraft,
} from '@/lib/workout-factory/emom-authoring';
import {
  applyBlockEditsToMetadata,
  hasRichWorkoutSetInMetadata,
  workoutExerciseToFactoryExercise,
} from '@/lib/workout-factory/sync-workout-metadata';
import {
  buildWorkoutSessionViewModel,
  type WorkoutSessionBlockView,
} from '@/lib/workout-factory/workout-session-view-model';

function isEmomBlock(block: WorkoutSessionBlockView): boolean {
  return block.blockFormat?.trim().toLowerCase() === 'emom';
}

/** First EMOM parametric block in deck order (any section: main, finisher, warmup, etc.). */
export function findEmomMainBlock(
  blocks: WorkoutSessionBlockView[],
): WorkoutSessionBlockView | null {
  return blocks.find(isEmomBlock) ?? null;
}

/** Patch EMOM block formatParams from authoring draft; preserves other blocks and exercises. */
export function patchEmomBlockMetadata(
  task: TaskRow,
  draft: EmomAuthoringDraft,
): TaskRow['metadata'] {
  const vm = buildWorkoutSessionViewModel(task.metadata);
  const emomBlock = findEmomMainBlock(vm.blocks);
  if (!emomBlock) {
    return task.metadata;
  }

  const nextParams = buildEmomFormatParamsFromDraft(draft);
  const nextBlocks = vm.blocks.map((b) =>
    b.id === emomBlock.id
      ? {
          ...b,
          formatParams: { ...nextParams },
        }
      : b,
  );

  return applyBlockEditsToMetadata(task.metadata, nextBlocks) as TaskRow['metadata'];
}

export function emomBlockExerciseOptions(
  blocks: WorkoutSessionBlockView[],
): { index: number; label: string }[] {
  const emom = findEmomMainBlock(blocks);
  if (!emom?.exercises?.length) return [];
  return emom.exercises.map((ex, index) => ({
    index,
    label: ex.exerciseName?.trim() || `Exercise ${index + 1}`,
  }));
}

/** Patch flat exercise list into the EMOM main block only; returns null if not applicable. */
export function applyEmomBlockFlatExercisesToMetadata(
  meta: unknown,
  flatExercises: WorkoutExercise[],
): Json | null {
  if (!hasRichWorkoutSetInMetadata(meta)) return null;
  const vm = buildWorkoutSessionViewModel(meta);
  const emomBlock = findEmomMainBlock(vm.blocks);
  if (!emomBlock) return null;

  const exerciseCount = flatExercises.length;
  const factoryExercises = flatExercises.map((we, i) =>
    workoutExerciseToFactoryExercise(we, i + 1),
  );
  const rawParams = emomBlock.formatParams ?? {};
  const richStations = parseEmomStationsFromParams(rawParams);
  const paramsForHydrate =
    richStations != null
      ? {
          ...rawParams,
          stations: reconcileEmomStationsForExerciseCount(richStations, exerciseCount),
        }
      : rawParams;
  const draft = hydrateEmomAuthoringDraft(paramsForHydrate, exerciseCount);
  const formatParams = buildEmomFormatParamsFromDraft(draft);
  const nextBlocks = vm.blocks.map((b) =>
    b.id === emomBlock.id
      ? { ...b, exercises: factoryExercises, formatParams: { ...formatParams } }
      : b,
  );
  return applyBlockEditsToMetadata(meta, nextBlocks);
}
