/**
 * Rich vs flat workout metadata reconciliation for task saves and manual edits.
 * Source of truth: `ai_workout_factory.workout_set.workouts[]` when present.
 * `metadata.exercises` is a derived legacy cache for Player / loggers.
 */

import type { Json } from '@/types/database';
import type { WorkoutExercise } from '@/lib/item-metadata';
import { parseTaskMetadata } from '@/lib/parse-task-metadata';
import { parseWorkoutExercisesFromMetadata } from '@/lib/parse-workout-exercises-from-metadata';
import { normalizeRepsForStorage } from '@/lib/workout-factory/parse-reps-scalar';
import {
  normalizeWorkoutForEditor,
  type ProgramWorkout,
} from '@/lib/workout-factory/program-schedule-utils';
import { workoutInSetToTaskExercises } from '@/lib/workout-factory/map-ai-workout-to-task-exercises';
import type { Exercise, ExerciseBlock, WarmupBlock } from '@/lib/workout-factory/types/ai-program';
import type { WorkoutInSet } from '@/lib/workout-factory/types/ai-workout';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepClone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

/** Same semantics as merge module `hasRichWorkoutSet`. */
export function hasRichWorkoutSetInMetadata(meta: unknown): boolean {
  const o = parseTaskMetadata(meta) as Record<string, unknown>;
  const af = o.ai_workout_factory;
  if (!isPlainObject(af)) return false;
  const ws = af.workout_set;
  if (!isPlainObject(ws)) return false;
  const workouts = ws.workouts;
  return Array.isArray(workouts) && workouts.length > 0;
}

function getPrimarySession(meta: Record<string, unknown>): Record<string, unknown> | null {
  const af = meta.ai_workout_factory;
  if (!isPlainObject(af)) return null;
  const ws = af.workout_set;
  if (!isPlainObject(ws)) return null;
  const workouts = ws.workouts;
  if (!Array.isArray(workouts) || workouts.length === 0) return null;
  const s0 = workouts[0];
  return isPlainObject(s0) ? s0 : null;
}

export function workoutExerciseToFactoryExercise(we: WorkoutExercise, order: number): Exercise {
  const name = we.name.trim() || 'Exercise';
  const repsRaw = we.reps;
  const repsNorm = normalizeRepsForStorage(repsRaw);
  const reps =
    repsNorm !== undefined ? (typeof repsNorm === 'number' ? String(repsNorm) : repsNorm) : '';
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

function normalizeFlatExerciseForCompare(we: WorkoutExercise): Record<string, unknown> {
  const reps = normalizeRepsForStorage(we.reps);
  const row: Record<string, unknown> = { name: we.name.trim() };
  if (typeof we.sets === 'number' && we.sets > 0) row.sets = we.sets;
  if (reps !== undefined) row.reps = reps;
  if (typeof we.rest_seconds === 'number' && we.rest_seconds > 0) {
    row.rest_seconds = we.rest_seconds;
  }
  if (typeof we.work_seconds === 'number' && we.work_seconds > 0) {
    row.work_seconds = we.work_seconds;
  }
  if (typeof we.rounds === 'number' && we.rounds > 0) row.rounds = we.rounds;
  return row;
}

/** Stable compare for flat vs factory-derived exercise lists. */
export function flatExercisesMatchDerived(
  flat: WorkoutExercise[],
  derived: WorkoutExercise[],
): boolean {
  if (flat.length !== derived.length) return false;
  const norm = (list: WorkoutExercise[]) =>
    list.map(normalizeFlatExerciseForCompare).map((r) => JSON.stringify(r));
  const a = norm(flat);
  const b = norm(derived);
  return a.every((s, i) => s === b[i]);
}

/** Flatten rich factory session to legacy `WorkoutExercise[]`. */
export function deriveFlatExercisesFromMetadata(meta: unknown): WorkoutExercise[] {
  const o = parseTaskMetadata(meta) as Record<string, unknown>;
  const session = getPrimarySession(o);
  if (session) {
    const normalized = normalizeWorkoutForEditor(session as ProgramWorkout);
    return workoutInSetToTaskExercises(normalized as WorkoutInSet);
  }
  return parseWorkoutExercisesFromMetadata(meta);
}

/**
 * Apply manual flat exercise edits to metadata.
 * Rich cards: degrade main `exerciseBlocks` to a single straight_sets Main block; preserve instruction sections.
 * Flat-only cards: set `metadata.exercises` only.
 */
export function applyFlatWorkoutEditsToMetadata(
  meta: unknown,
  flatExercises: WorkoutExercise[],
): Json {
  const next = deepClone(parseTaskMetadata(meta)) as Record<string, unknown>;

  if (!hasRichWorkoutSetInMetadata(next)) {
    if (flatExercises.length > 0) next.exercises = flatExercises;
    else delete next.exercises;
    return next as Json;
  }

  const session = getPrimarySession(next);
  if (!session) {
    if (flatExercises.length > 0) next.exercises = flatExercises;
    return next as Json;
  }

  const factoryExercises = flatExercises.map((we, i) =>
    workoutExerciseToFactoryExercise(we, i + 1),
  );

  session.exerciseBlocks = [
    {
      order: 1,
      name: 'Main',
      blockFormat: 'straight_sets',
      exercises: factoryExercises,
    },
  ];

  const normalized = normalizeWorkoutForEditor(session as ProgramWorkout);
  next.exercises = workoutInSetToTaskExercises(normalized as WorkoutInSet);

  return next as Json;
}

function viewExerciseToFactoryExercise(ex: Exercise, order: number): Exercise {
  const repsRaw = ex.reps;
  const repsNorm = normalizeRepsForStorage(repsRaw);
  const reps =
    repsNorm !== undefined ? (typeof repsNorm === 'number' ? String(repsNorm) : repsNorm) : '';
  const next: Exercise = {
    order,
    exerciseName: ex.exerciseName?.trim() || 'Exercise',
    sets: typeof ex.sets === 'number' && ex.sets > 0 ? ex.sets : 1,
    reps,
  };
  if (ex.id) next.id = ex.id;
  if (ex.exerciseQuery) next.exerciseQuery = ex.exerciseQuery;
  if (typeof ex.rpe === 'number' && Number.isFinite(ex.rpe)) next.rpe = ex.rpe;
  if (typeof ex.restSeconds === 'number' && ex.restSeconds > 0) {
    next.restSeconds = ex.restSeconds;
  }
  if (typeof ex.workSeconds === 'number' && ex.workSeconds > 0) {
    next.workSeconds = ex.workSeconds;
  }
  if (typeof ex.rounds === 'number' && ex.rounds > 0) next.rounds = ex.rounds;
  if (ex.coachNotes?.trim()) next.coachNotes = ex.coachNotes.trim();
  return next;
}

/** Map main block view → factory `ExerciseBlock` (preserves format + params). */
export function viewBlockToExerciseBlock(view: WorkoutSessionBlockView): ExerciseBlock {
  const exercises = (view.exercises ?? []).map((ex, i) => viewExerciseToFactoryExercise(ex, i + 1));
  const block: ExerciseBlock = {
    order: view.order,
    name: view.name?.trim() || 'Main work',
    exercises,
  };
  if (view.id) block.id = view.id;
  if (view.blockFormat) block.blockFormat = view.blockFormat;
  if (view.formatParams && Object.keys(view.formatParams).length > 0) {
    block.formatParams = { ...view.formatParams };
  }
  return block;
}

/** Map instruction section view → factory `WarmupBlock`. */
export function viewBlockToWarmupBlock(view: WorkoutSessionBlockView): WarmupBlock {
  const base = view.instructionBlock;
  const block: WarmupBlock = {
    order: typeof base?.order === 'number' ? base.order : view.order,
    exerciseName: view.name?.trim() || view.section,
    instructions: [...(view.instructions ?? [])],
  };
  if (view.id) block.id = view.id;
  if (base?.exerciseQuery) block.exerciseQuery = base.exerciseQuery;
  return block;
}

function sortBlocksByOrder(blocks: WorkoutSessionBlockView[]): WorkoutSessionBlockView[] {
  return blocks.slice().sort((a, b) => a.order - b.order);
}

/** Rebuild primary session workout from editor block views. */
export function blocksViewToProgramWorkout(
  blocks: WorkoutSessionBlockView[],
  existingSession: ProgramWorkout,
): ProgramWorkout {
  const warmup = sortBlocksByOrder(blocks.filter((b) => b.section === 'warmup')).map(
    viewBlockToWarmupBlock,
  );
  const main = sortBlocksByOrder(blocks.filter((b) => b.section === 'main')).map(
    viewBlockToExerciseBlock,
  );
  const finisher = sortBlocksByOrder(blocks.filter((b) => b.section === 'finisher')).map(
    viewBlockToWarmupBlock,
  );
  const cooldown = sortBlocksByOrder(blocks.filter((b) => b.section === 'cooldown')).map(
    viewBlockToWarmupBlock,
  );

  const session: ProgramWorkout = {
    title: existingSession.title ?? 'Workout',
    description: existingSession.description ?? '',
    exerciseBlocks: main,
  };
  if (warmup.length > 0) session.warmupBlocks = warmup;
  else delete session.warmupBlocks;
  if (finisher.length > 0) session.finisherBlocks = finisher;
  else delete session.finisherBlocks;
  if (cooldown.length > 0) session.cooldownBlocks = cooldown;
  else delete session.cooldownBlocks;
  return session;
}

/**
 * Apply block-aware edits from the viewer editor. Updates factory tree + derived flat cache.
 * Rich cards only; flat-only metadata is returned unchanged.
 */
export function applyBlockEditsToMetadata(meta: unknown, blocks: WorkoutSessionBlockView[]): Json {
  const next = deepClone(parseTaskMetadata(meta)) as Record<string, unknown>;

  if (!hasRichWorkoutSetInMetadata(next)) {
    return next as Json;
  }

  const sessionRaw = getPrimarySession(next);
  if (!sessionRaw) {
    return next as Json;
  }

  const existing = normalizeWorkoutForEditor(sessionRaw as ProgramWorkout) as ProgramWorkout;
  const merged = blocksViewToProgramWorkout(blocks, existing);
  const normalized = normalizeWorkoutForEditor(merged) as WorkoutInSet;

  const af = next.ai_workout_factory as Record<string, unknown>;
  const ws = af.workout_set as Record<string, unknown>;
  const workouts = ws.workouts as Record<string, unknown>[];
  workouts[0] = normalized as unknown as Record<string, unknown>;

  next.exercises = workoutInSetToTaskExercises(normalized);

  return next as Json;
}

/**
 * Completed `workout_log` save: preserve prescription snapshot and log keys; apply flat performance edits only.
 * Skips flat-vs-derived reconciliation (logged sets/set_logs differ from factory prescription by design).
 */
export function passThroughRichWorkoutLogMetadata(
  built: unknown,
  flatExercises: WorkoutExercise[],
): Json {
  const o = { ...(parseTaskMetadata(built) as Record<string, unknown>) };
  const af = o.ai_workout_factory;
  if (af != null && typeof af === 'object' && !Array.isArray(af)) {
    o.ai_workout_factory = deepClone(af);
  }
  if (flatExercises.length > 0) {
    o.exercises = flatExercises;
  } else {
    delete o.exercises;
  }
  return o as Json;
}
