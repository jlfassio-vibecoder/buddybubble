/**
 * Universal read model for workout task metadata (rich factory vs flat legacy).
 */

import { isBlockFormat, type BlockFormat } from '@/lib/agents/coach/block-blueprint-library';
import {
  metadataFieldsFromParsed,
  parseTaskMetadata,
  type WorkoutExercise,
} from '@/lib/item-metadata';
import { formatBlockSubtitle } from '@/lib/workout-factory/format-block-subtitle';
import { workoutInSetToTaskExercises } from '@/lib/workout-factory/map-ai-workout-to-task-exercises';
import {
  normalizeWorkoutForEditor,
  type ProgramWorkout,
} from '@/lib/workout-factory/program-schedule-utils';
import {
  deriveFlatExercisesFromMetadata,
  flatExercisesMatchDerived,
  hasRichWorkoutSetInMetadata,
} from '@/lib/workout-factory/sync-workout-metadata';
import type { Exercise, ExerciseBlock, WarmupBlock } from '@/lib/workout-factory/types/ai-program';
import type { WorkoutInSet } from '@/lib/workout-factory/types/ai-workout';
import type { WorkoutSetTemplate } from '@/lib/workout-factory/types/workout-contract';

export type WorkoutSessionSource = 'rich' | 'flat' | 'empty';

export type WorkoutBlockSectionKind = 'warmup' | 'main' | 'finisher' | 'cooldown';

export type WorkoutSessionBlockView = {
  id: string;
  section: WorkoutBlockSectionKind;
  order: number;
  name: string;
  blockFormat: BlockFormat | null;
  formatParams: Record<string, unknown>;
  subtitle: string | null;
  exercises: Exercise[];
  instructions: string[];
  instructionBlock?: WarmupBlock;
};

export type WorkoutSessionViewModel = {
  source: WorkoutSessionSource;
  workoutSet: WorkoutSetTemplate | null;
  session: WorkoutInSet | null;
  blocks: WorkoutSessionBlockView[];
  flatExercises: WorkoutExercise[];
  flatCacheStale: boolean;
};

function parseBlockFormat(raw: unknown): BlockFormat | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  return isBlockFormat(trimmed) ? trimmed : null;
}

function workoutExerciseToFactoryExercise(we: WorkoutExercise, order: number): Exercise {
  const name = we.name.trim() || 'Exercise';
  const reps =
    typeof we.reps === 'number' ? String(we.reps) : typeof we.reps === 'string' ? we.reps : '';
  const ex: Exercise = {
    order,
    exerciseName: name,
    sets: typeof we.sets === 'number' && we.sets > 0 ? we.sets : 1,
    reps,
  };
  if (typeof we.rpe === 'number' && Number.isFinite(we.rpe)) ex.rpe = we.rpe;
  if (typeof we.rest_seconds === 'number' && we.rest_seconds > 0) {
    ex.restSeconds = we.rest_seconds;
  }
  if (typeof we.work_seconds === 'number' && we.work_seconds > 0) {
    ex.workSeconds = we.work_seconds;
  }
  if (typeof we.rounds === 'number' && we.rounds > 0) ex.rounds = we.rounds;
  if (typeof we.coach_notes === 'string' && we.coach_notes.trim()) {
    ex.coachNotes = we.coach_notes.trim();
  }
  return ex;
}

function mapInstructionBlock(
  block: WarmupBlock,
  section: Exclude<WorkoutBlockSectionKind, 'main'>,
  index: number,
): WorkoutSessionBlockView {
  const order = typeof block.order === 'number' ? block.order : index + 1;
  const name = block.exerciseName?.trim() || section;
  return {
    id: block.id ?? `${section}-${order}-${index}`,
    section,
    order,
    name,
    blockFormat: null,
    formatParams: {},
    subtitle: null,
    exercises: [],
    instructions: Array.isArray(block.instructions) ? block.instructions : [],
    instructionBlock: block,
  };
}

function mapExerciseBlock(block: ExerciseBlock, index: number): WorkoutSessionBlockView {
  const order = typeof block.order === 'number' ? block.order : index + 1;
  const blockFormat = parseBlockFormat(block.blockFormat);
  const formatParams =
    block.formatParams != null &&
    typeof block.formatParams === 'object' &&
    !Array.isArray(block.formatParams)
      ? block.formatParams
      : {};
  const subtitle = formatBlockSubtitle(blockFormat ?? block.blockFormat, formatParams);
  return {
    id: block.id ?? `main-${order}-${index}`,
    section: 'main',
    order,
    name: block.name?.trim() || 'Main work',
    blockFormat,
    formatParams,
    subtitle,
    exercises: block.exercises ?? [],
    instructions: [],
  };
}

function buildBlocksFromSession(session: ProgramWorkout): WorkoutSessionBlockView[] {
  const blocks: WorkoutSessionBlockView[] = [];

  (session.warmupBlocks ?? []).forEach((b, i) => {
    blocks.push(mapInstructionBlock(b, 'warmup', i));
  });

  (session.exerciseBlocks ?? []).forEach((b, i) => {
    blocks.push(mapExerciseBlock(b, i));
  });

  (session.finisherBlocks ?? []).forEach((b, i) => {
    blocks.push(mapInstructionBlock(b, 'finisher', i));
  });

  (session.cooldownBlocks ?? []).forEach((b, i) => {
    blocks.push(mapInstructionBlock(b, 'cooldown', i));
  });

  return blocks;
}

function buildFlatViewModel(flatExercises: WorkoutExercise[]): WorkoutSessionViewModel {
  const exercises = flatExercises.map((we, i) => workoutExerciseToFactoryExercise(we, i + 1));
  const block: WorkoutSessionBlockView = {
    id: 'flat-main',
    section: 'main',
    order: 1,
    name: 'Exercises',
    blockFormat: 'straight_sets',
    formatParams: {},
    subtitle: null,
    exercises,
    instructions: [],
  };
  return {
    source: 'flat',
    workoutSet: null,
    session: null,
    blocks: flatExercises.length > 0 ? [block] : [],
    flatExercises,
    flatCacheStale: false,
  };
}

function emptyViewModel(): WorkoutSessionViewModel {
  return {
    source: 'empty',
    workoutSet: null,
    session: null,
    blocks: [],
    flatExercises: [],
    flatCacheStale: false,
  };
}

export function buildWorkoutSessionViewModel(meta: unknown): WorkoutSessionViewModel {
  const o = parseTaskMetadata(meta) as Record<string, unknown>;
  const storedFlat = metadataFieldsFromParsed(meta).workoutExercises;

  if (!hasRichWorkoutSetInMetadata(o)) {
    if (storedFlat.length > 0) return buildFlatViewModel(storedFlat);
    return emptyViewModel();
  }

  const af = o.ai_workout_factory;
  if (typeof af !== 'object' || af === null) {
    if (storedFlat.length > 0) return buildFlatViewModel(storedFlat);
    return emptyViewModel();
  }

  const ws = (af as { workout_set?: unknown }).workout_set;
  if (typeof ws !== 'object' || ws === null) {
    if (storedFlat.length > 0) return buildFlatViewModel(storedFlat);
    return emptyViewModel();
  }

  const workoutSet = ws as WorkoutSetTemplate;
  const workouts = workoutSet.workouts;
  if (!Array.isArray(workouts) || workouts.length === 0) {
    if (storedFlat.length > 0) return buildFlatViewModel(storedFlat);
    return emptyViewModel();
  }

  const firstRaw = workouts[0] as ProgramWorkout;
  const session = normalizeWorkoutForEditor(firstRaw) as WorkoutInSet;
  const blocks = buildBlocksFromSession(session);
  const flatExercises = workoutInSetToTaskExercises(session);
  const flatCacheStale =
    storedFlat.length > 0 && !flatExercisesMatchDerived(storedFlat, flatExercises);

  return {
    source: 'rich',
    workoutSet,
    session,
    blocks,
    flatExercises,
    flatCacheStale,
  };
}
