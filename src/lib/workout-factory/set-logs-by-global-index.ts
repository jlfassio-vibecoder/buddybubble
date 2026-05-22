import type { SetLogEntry } from '@/lib/item-metadata';
import { parseWorkoutExercisesFromMetadata } from '@/lib/parse-workout-exercises-from-metadata';

/** Maps global flat exercise index → completed set_logs from `metadata.exercises`. */
export function setLogsByGlobalIndexFromMetadata(metadata: unknown): Map<number, SetLogEntry[]> {
  const exercises = parseWorkoutExercisesFromMetadata(metadata);
  const map = new Map<number, SetLogEntry[]>();
  exercises.forEach((ex, i) => {
    if (Array.isArray(ex.set_logs) && ex.set_logs.length > 0) {
      map.set(i, ex.set_logs);
    }
  });
  return map;
}
