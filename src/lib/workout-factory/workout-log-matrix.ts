import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import type { WorkoutExercise } from '@/lib/item-metadata';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import { buildPlayerInitialLogs } from '@/lib/workout-factory/resolve-player-log-row-count';

export function isSetDraftMatrix(raw: unknown): raw is SetDraft[][] {
  if (!Array.isArray(raw)) return false;
  for (const row of raw) {
    if (!Array.isArray(row)) return false;
    for (const cell of row) {
      if (cell == null || typeof cell !== 'object' || Array.isArray(cell)) return false;
      const c = cell as Record<string, unknown>;
      if (
        typeof c.weight !== 'string' ||
        typeof c.reps !== 'string' ||
        typeof c.rpe !== 'string' ||
        typeof c.done !== 'boolean'
      ) {
        return false;
      }
    }
  }
  return true;
}

export function logsEqualTemplate(
  logs: SetDraft[][],
  exercises: WorkoutExercise[],
  blocks: WorkoutSessionBlockView[],
): boolean {
  return JSON.stringify(logs) === JSON.stringify(buildPlayerInitialLogs(exercises, blocks));
}
