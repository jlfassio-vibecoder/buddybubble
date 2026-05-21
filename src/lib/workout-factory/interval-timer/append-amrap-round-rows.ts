import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import type { WorkoutExercise } from '@/lib/item-metadata';

function defaultSetDraft(exercise: WorkoutExercise): SetDraft {
  return {
    weight: exercise.weight != null ? String(exercise.weight) : '',
    reps: typeof exercise.reps === 'number' ? String(exercise.reps) : '',
    rpe: exercise.rpe != null ? String(exercise.rpe) : '',
    done: false,
  };
}

function newSetDraftFromExisting(
  rows: SetDraft[] | undefined,
  exercise: WorkoutExercise,
): SetDraft {
  const last = rows?.[rows.length - 1];
  if (last) {
    return {
      weight: last.weight,
      reps: last.reps,
      rpe: last.rpe,
      done: false,
    };
  }
  return defaultSetDraft(exercise);
}

/**
 * Immutable append: one new set row per globalIndex. Does not mutate input.
 */
export function appendAmrapRoundRows(
  logs: SetDraft[][],
  globalIndices: readonly number[],
  exercises: readonly WorkoutExercise[],
): SetDraft[][] {
  const next = logs.map((row) => [...row]);

  for (const gi of globalIndices) {
    if (gi < 0 || gi >= exercises.length) continue;
    const exercise = exercises[gi];
    if (!exercise) continue;
    const template = newSetDraftFromExisting(next[gi], exercise);
    next[gi] = [...(next[gi] ?? []), template];
  }

  return next;
}
