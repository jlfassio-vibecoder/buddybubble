/**
 * Rich vs flat workout metadata reconciliation for task saves and manual edits.
 * Source of truth: `ai_workout_factory.workout_set.workouts[]` when present.
 * `metadata.exercises` is a derived legacy cache for Player / loggers.
 */

import type { ItemType, Json } from '@/types/database';
import {
  metadataFieldsFromParsed,
  parseTaskMetadata,
  type TaskMetadataFormFields,
  type WorkoutExercise,
} from '@/lib/item-metadata';
import { normalizeRepsForStorage } from '@/lib/workout-factory/parse-reps-scalar';
import {
  normalizeWorkoutForEditor,
  type ProgramWorkout,
} from '@/lib/workout-factory/program-schedule-utils';
import { workoutInSetToTaskExercises } from '@/lib/workout-factory/map-ai-workout-to-task-exercises';
import type { Exercise } from '@/lib/workout-factory/types/ai-program';
import type { WorkoutInSet } from '@/lib/workout-factory/types/ai-workout';

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

function workoutExerciseToFactoryExercise(we: WorkoutExercise, order: number): Exercise {
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
  const a = norm(flat).sort();
  const b = norm(derived).sort();
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
  return metadataFieldsFromParsed(meta).workoutExercises;
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

/**
 * After `buildTaskMetadataPayload` sets managed workout fields, reconcile rich factory vs flat form state.
 */
export function finalizeWorkoutMetadataForSave(
  itemType: ItemType,
  fields: TaskMetadataFormFields,
  built: unknown,
): Json {
  const o = { ...(parseTaskMetadata(built) as Record<string, unknown>) };

  if (itemType !== 'workout' && itemType !== 'workout_log') {
    return o as Json;
  }

  if (!hasRichWorkoutSetInMetadata(o)) {
    return o as Json;
  }

  const derived = deriveFlatExercisesFromMetadata(o);
  const flatFromForm = fields.workoutExercises;

  if (!flatExercisesMatchDerived(flatFromForm, derived)) {
    return applyFlatWorkoutEditsToMetadata(o, flatFromForm);
  }

  if (derived.length > 0) {
    o.exercises = derived;
  } else {
    delete o.exercises;
  }

  return o as Json;
}
