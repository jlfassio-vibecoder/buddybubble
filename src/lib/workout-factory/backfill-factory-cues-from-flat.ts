/**
 * Lazy M5c backfill: copy non-empty flat cue fields onto factory Exercise when factory is empty,
 * then re-project flat so both layers agree.
 */

import type { Json } from '@/types/database';
import { parseTaskMetadata } from '@/lib/parse-task-metadata';
import { parseWorkoutExercisesFromMetadata } from '@/lib/parse-workout-exercises-from-metadata';
import { hasRichWorkoutSetInMetadata } from '@/lib/workout-factory/sync-workout-metadata';
import { workoutInSetToTaskExercises } from '@/lib/workout-factory/map-ai-workout-to-task-exercises';
import { copyFlatCuesOntoFactoryExercise } from '@/lib/workout-factory/factory-exercise-cues';
import type { Exercise } from '@/lib/workout-factory/types/ai-program';
import type { WorkoutInSet } from '@/lib/workout-factory/types/ai-workout';

function deepClone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
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

/**
 * Idempotent: for rich workouts, copy flat → factory when factory cue fields are empty,
 * then re-derive `metadata.exercises` from the factory tree.
 */
export function backfillFactoryCuesFromFlat(metadata: Json): Json {
  const parsed = parseTaskMetadata(metadata) as Record<string, unknown>;
  if (parsed.variant === 'workout_log') return metadata;
  if (!hasRichWorkoutSetInMetadata(parsed)) return metadata;

  const session = getPrimarySession(parsed);
  if (!session) return metadata;

  const blocks = session.exerciseBlocks;
  if (!Array.isArray(blocks)) return metadata;

  const flat = parseWorkoutExercisesFromMetadata(parsed);
  if (flat.length === 0) return metadata;

  const next = deepClone(parsed) as Record<string, unknown>;
  const nextSession = getPrimarySession(next);
  if (!nextSession) return metadata;
  const nextBlocks = nextSession.exerciseBlocks;
  if (!Array.isArray(nextBlocks)) return metadata;

  let changed = false;
  let flatIndex = 0;
  for (const blockRaw of nextBlocks) {
    if (!isPlainObject(blockRaw)) continue;
    const exercises = blockRaw.exercises;
    if (!Array.isArray(exercises)) continue;
    for (const exRaw of exercises) {
      if (!isPlainObject(exRaw)) continue;
      const ex = exRaw as unknown as Exercise;
      const flatRow = flat[flatIndex];
      flatIndex += 1;
      if (!flatRow) continue;

      const before = JSON.stringify({
        i: ex.instructions,
        f: ex.formCues,
        t: ex.tips,
        p: ex.injuryPreventionTips,
        c: ex.coachNotes,
      });
      copyFlatCuesOntoFactoryExercise(ex, flatRow);
      const after = JSON.stringify({
        i: ex.instructions,
        f: ex.formCues,
        t: ex.tips,
        p: ex.injuryPreventionTips,
        c: ex.coachNotes,
      });
      if (before !== after) changed = true;
    }
  }

  if (!changed) return metadata;

  const derivedSession = getPrimarySession(next);
  if (derivedSession) {
    const derived = workoutInSetToTaskExercises(derivedSession as unknown as WorkoutInSet);
    if (derived.length > 0) next.exercises = derived;
  }
  return next as Json;
}
