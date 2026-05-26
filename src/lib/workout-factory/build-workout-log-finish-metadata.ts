/**
 * Builds `workout_log` task metadata from WorkoutPlayer (draft autosave + finish).
 * Preserves parametric prescription via deep-cloned `ai_workout_factory` snapshot when rich.
 */

import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import type { SetLogEntry, WorkoutExercise } from '@/lib/item-metadata';
import { parseTaskMetadata } from '@/lib/parse-task-metadata';
import { hasRichWorkoutSetInMetadata } from '@/lib/workout-factory/sync-workout-metadata';
import type { WorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import type { SessionTelemetrySnapshot } from '@/lib/workout-factory/session-telemetry';
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

export type BuildWorkoutLogDraftMetadataParams = {
  /** Source workout `tasks.metadata` (WorkoutPlayer `metadata` prop). */
  sourceMetadata: Json | null | undefined;
  /** Active session view model (rich gate). */
  sessionVm: WorkoutSessionViewModel;
  sourceTaskId: string;
  draftLogs: SetDraft[][];
  classInstanceId: string | null;
  sessionTelemetry?: SessionTelemetrySnapshot;
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
  sessionTelemetry?: SessionTelemetrySnapshot;
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
 * Pure builder — in-progress draft autosave (`draft_logs` + optional factory snapshot).
 * Omits `workout_log_schema_version` and flat `exercises` (finish-only).
 */
export function buildWorkoutLogDraftMetadata(params: BuildWorkoutLogDraftMetadataParams): Json {
  const { sourceMetadata, sessionVm, sourceTaskId, draftLogs, classInstanceId, sessionTelemetry } =
    params;

  const out: Record<string, unknown> = {
    source_task_id: sourceTaskId,
    draft_logs: draftLogs,
  };

  if (classInstanceId) {
    out.class_instance_id = classInstanceId;
  }

  if (sessionTelemetry) {
    out.session_telemetry = sessionTelemetry;
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
 * Pure builder — returns the `metadata` object for task insert/update on finish.
 */
export function buildWorkoutLogFinishMetadata(params: BuildWorkoutLogFinishMetadataParams): Json {
  const {
    sourceMetadata,
    sessionVm,
    exercises,
    durationMin,
    sourceTaskId,
    classInstanceId,
    sessionTelemetry,
  } = params;

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

  if (sessionTelemetry) {
    out.session_telemetry = sessionTelemetry;
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
    const rowLogs = logs[i] ?? [];
    const set_logs: SetLogEntry[] = [];
    rowLogs.forEach((s, setIdx) => {
      if (!s.done) return;
      const entry: SetLogEntry = { set: setIdx + 1, done: true };
      if (s.weight !== '') {
        const weight = parseFloat(s.weight);
        if (Number.isFinite(weight)) entry.weight = weight;
      }
      if (s.reps !== '') {
        const reps = parseInt(s.reps, 10);
        if (Number.isFinite(reps)) entry.reps = reps;
      }
      if (s.rpe !== '') {
        const rpe = parseInt(s.rpe, 10);
        if (Number.isFinite(rpe)) entry.rpe = rpe;
      }
      set_logs.push(entry);
    });
    return {
      name: ex.name,
      ...(ex.reps != null ? { reps: ex.reps } : {}),
      ...(ex.weight != null ? { weight: ex.weight } : {}),
      ...(ex.duration_min != null ? { duration_min: ex.duration_min } : {}),
      sets: set_logs.length,
      set_logs,
    };
  });
}
