/**
 * Builds completed `workout_log` task metadata from WorkoutPlayer finish state.
 * Preserves parametric prescription via deep-cloned `ai_workout_factory` snapshot.
 */

import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import type { SetLogEntry, WorkoutExercise } from '@/lib/item-metadata';
import { parseTaskMetadata } from '@/lib/parse-task-metadata';
import { hasRichWorkoutSetInMetadata } from '@/lib/workout-factory/sync-workout-metadata';
import type { WorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import type { Json } from '@/types/database';

/** Schema version written on every completed workout_log from WorkoutPlayer finish. */
export const WORKOUT_LOG_SCHEMA_VERSION = 1 as const;

/** One exercise row in finished log metadata (matches legacy handleFinish shape). */
export type WorkoutLogExerciseFinishPayload = {
  name: string;
  sets: number;
  reps?: number | string;
  weight?: number;
  duration_min?: number;
  set_logs: SetLogEntry[];
};

export type BuildWorkoutLogFinishMetadataParams = {
  /** Source workout `tasks.metadata` (WorkoutPlayer `metadata` prop). */
  sourceMetadata: Json | null | undefined;
  /** Active session view model (rich gate). */
  sessionVm: WorkoutSessionViewModel;
  /** Flat performance cache with user-entered set_logs. */
  exercises: WorkoutLogExerciseFinishPayload[];
  /** Whole minutes elapsed; omitted from output when <= 0. */
  durationMin: number;
  sourceTaskId: string | null;
  classInstanceId: string | null;
};

function deepClone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function snapshotFactoryFromSource(sourceMetadata: unknown): unknown | null {
  const parsed = parseTaskMetadata(sourceMetadata) as Record<string, unknown>;
  const af = parsed.ai_workout_factory;
  if (af == null || typeof af !== 'object' || Array.isArray(af)) return null;
  return deepClone(af);
}

/**
 * Pure builder — returns the `metadata` object for task insert/update on finish.
 */
export function buildWorkoutLogFinishMetadata(params: BuildWorkoutLogFinishMetadataParams): Json {
  const { sourceMetadata, sessionVm, exercises, durationMin, sourceTaskId, classInstanceId } =
    params;

  const out: Record<string, unknown> = {
    workout_log_schema_version: WORKOUT_LOG_SCHEMA_VERSION,
    exercises,
  };

  if (sourceTaskId) {
    out.source_task_id = sourceTaskId;
  }
  if (durationMin > 0) {
    out.duration_min = durationMin;
  }
  if (classInstanceId) {
    out.class_instance_id = classInstanceId;
  }

  if (sessionVm.source === 'rich' && hasRichWorkoutSetInMetadata(sourceMetadata)) {
    const factory = snapshotFactoryFromSource(sourceMetadata);
    if (factory != null) {
      out.ai_workout_factory = factory;
    }
  }

  return out as Json;
}

/**
 * Extract completed-set payload from player state (moved out of handleFinish).
 */
export function buildWorkoutLogExercisePayloadFromLogs(
  exercises: readonly WorkoutExercise[],
  logs: readonly (readonly SetDraft[])[],
): WorkoutLogExerciseFinishPayload[] {
  return exercises.map((ex, i) => {
    const completedSets = (logs[i] ?? []).filter((s) => s.done);
    return {
      name: ex.name,
      ...(ex.reps != null ? { reps: ex.reps } : {}),
      ...(ex.weight != null ? { weight: ex.weight } : {}),
      ...(ex.duration_min != null ? { duration_min: ex.duration_min } : {}),
      sets: completedSets.length,
      set_logs: completedSets.map((s, idx) => ({
        set: idx + 1,
        ...(s.weight !== '' ? { weight: parseFloat(s.weight) } : {}),
        ...(s.reps !== '' ? { reps: parseInt(s.reps, 10) } : {}),
        ...(s.rpe !== '' ? { rpe: parseInt(s.rpe, 10) } : {}),
        done: true,
      })),
    };
  });
}
