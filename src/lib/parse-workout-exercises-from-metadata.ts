import { hydrateWorkoutExerciseFromStorefrontCoachNotes } from '@/lib/workout-factory/storefront-preview-exercise-detail';
import { normalizeRepsForStorage } from '@/lib/workout-factory/parse-reps-scalar';
import type { WorkoutExercise } from '@/lib/item-metadata';
import { parseTaskMetadata } from '@/lib/parse-task-metadata';

function asWorkoutExercises(value: unknown): WorkoutExercise[] {
  if (!Array.isArray(value)) return [];
  const out: WorkoutExercise[] = [];
  for (const x of value) {
    if (typeof x !== 'object' || x === null) continue;
    const raw = x as WorkoutExercise;
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name) continue;
    const r = normalizeRepsForStorage(raw.reps);
    const merged: WorkoutExercise = { ...raw, name };
    if (r === undefined) delete merged.reps;
    else merged.reps = r;
    out.push(hydrateWorkoutExerciseFromStorefrontCoachNotes(merged));
  }
  return out;
}

/** Read `metadata.exercises` as `WorkoutExercise[]` (no other metadata fields). */
export function parseWorkoutExercisesFromMetadata(meta: unknown): WorkoutExercise[] {
  const o = parseTaskMetadata(meta) as Record<string, unknown>;
  return asWorkoutExercises(o.exercises);
}
