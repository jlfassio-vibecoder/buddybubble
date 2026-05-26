import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import type { GhostSetSnapshot } from '@/lib/workout-factory/ghost-set-snapshot';
import type { IntervalRowSnapshot } from '@/lib/workout-factory/interval-timer/types';
import { resolveIntervalBlockInput } from '@/lib/workout-factory/interval-timer/resolve-interval-block-input';
import { validateLiveSetCounts } from '@/lib/workout-factory/build-workout-coach-rail-context';
import { resolvePlayerLogRowCount } from '@/lib/workout-factory/resolve-player-log-row-count';
import {
  blockContextForGlobalIndex,
  buildPlayerExerciseIndexLookup,
} from '@/lib/workout-factory/workout-player-exercise-index';
import type { WorkoutExercise } from '@/lib/item-metadata';
import type { WorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';

export const SESSION_TELEMETRY_SCHEMA_VERSION = 1 as const;

/** Stable subset hashed for Coach dedupe (skip re-sending identical telemetry). */
export type SessionTelemetryFingerprintInput = {
  schema_version: typeof SESSION_TELEMETRY_SCHEMA_VERSION;
  session_id: string;
  workout_log_task_id: string | null;
  /** Done-set payload only — omit blank rows */
  set_logs: readonly SessionTelemetrySetLogRow[];
  interval_performance: readonly SessionTelemetryIntervalRow[];
  skipped_exercise_indices: readonly number[];
  live_set_counts: readonly number[];
};

export type SessionTelemetrySetLogRow = {
  exercise_index: number;
  set_index: number;
  weight: string | null;
  reps: string | null;
  rpe: string | null;
  done: boolean;
};

export type SessionTelemetryPlannedSet = {
  weight: string | null;
  reps: string | null;
  target_label?: string | null;
};

export type SessionTelemetrySetDelta = {
  set_index: number;
  planned: SessionTelemetryPlannedSet | null;
  actual: Pick<SessionTelemetrySetLogRow, 'weight' | 'reps' | 'rpe' | 'done'>;
  status: 'done' | 'partial' | 'skipped' | 'not_started';
};

export type SessionTelemetryExerciseDelta = {
  exercise_index: number;
  name: string;
  planned_set_count: number;
  logged_set_count: number;
  completed_set_count: number;
  sets: SessionTelemetrySetDelta[];
};

export type SessionTelemetryIntervalRow = {
  block_id: string;
  format: 'tabata' | 'emom' | 'amrap' | 'straight';
  rounds_completed: number;
  rounds_target: number | null;
  last_phase: string;
  elapsed_in_block_sec: number;
};

export type SessionTelemetryPerformanceSummary = {
  total_sets_planned: number;
  total_sets_logged: number;
  total_sets_completed: number;
  total_volume_kg: number | null;
  skipped_exercise_indices: number[];
  elapsed_sec: number;
};

export type SessionTelemetrySnapshot = {
  schema_version: typeof SESSION_TELEMETRY_SCHEMA_VERSION;
  captured_at: string;
  session_id: string;
  workout_log_task_id: string | null;
  source_task_id: string;
  started_at: string;
  elapsed_sec: number;
  set_logs: SessionTelemetrySetLogRow[];
  exercise_deltas: SessionTelemetryExerciseDelta[];
  interval_performance: SessionTelemetryIntervalRow[];
  performance_summary: SessionTelemetryPerformanceSummary;
  live_set_counts: number[];
  fingerprint: string;
};

/** Machine/session context slice — no XState import. */
export type BuildSessionTelemetryContext = {
  sessionId: string;
  sourceTaskId: string;
  logTaskId: string | null;
  draftLogs: SetDraft[][];
  ghostLogs: GhostSetSnapshot[][];
  elapsedSec: number;
  startedAt: string;
  intervalRowSnapshots: Record<string, IntervalRowSnapshot | null>;
  sessionVm: WorkoutSessionViewModel;
};

export type BuildSessionTelemetrySnapshotInput = {
  context: BuildSessionTelemetryContext;
  /** Optional ISO timestamp for deterministic tests. */
  capturedAt?: string;
};

function normalizeDraftField(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasSetInput(set: SetDraft): boolean {
  return set.weight.trim() !== '' || set.reps.trim() !== '' || set.rpe.trim() !== '';
}

function normalizeCompareValue(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber)) return String(asNumber);
  return trimmed;
}

function matchesPlannedTarget(
  actual: SessionTelemetrySetDelta['actual'],
  planned: SessionTelemetryPlannedSet | null,
): boolean {
  if (!planned) return false;
  return (
    normalizeCompareValue(actual.weight) === normalizeCompareValue(planned.weight) &&
    normalizeCompareValue(actual.reps) === normalizeCompareValue(planned.reps) &&
    (actual.rpe == null || actual.rpe.trim() === '')
  );
}

function deriveSetStatus(
  set: SetDraft,
  planned: SessionTelemetryPlannedSet | null,
): SessionTelemetrySetDelta['status'] {
  if (set.done) return 'done';
  if (!hasSetInput(set)) return 'not_started';
  if (matchesPlannedTarget(toActualSet(set), planned)) return 'not_started';
  return 'partial';
}

function formatPlannedReps(reps: WorkoutExercise['reps']): string | null {
  if (reps == null) return null;
  if (typeof reps === 'number' && Number.isFinite(reps)) return String(reps);
  if (typeof reps === 'string' && reps.trim()) return reps.trim();
  return null;
}

function buildPlannedSet(
  exercise: WorkoutExercise,
  ghost: GhostSetSnapshot | null | undefined,
): SessionTelemetryPlannedSet | null {
  const weightFromExercise =
    exercise.weight != null && Number.isFinite(exercise.weight) ? String(exercise.weight) : null;
  const repsFromExercise = formatPlannedReps(exercise.reps);

  const weight = ghost?.weight ?? weightFromExercise;
  const reps = ghost?.reps ?? repsFromExercise;

  if (weight == null && reps == null) return null;

  const labelParts: string[] = [];
  if (weight != null) labelParts.push(weight);
  if (reps != null) labelParts.push(`× ${reps}`);
  const target_label = labelParts.length > 0 ? labelParts.join(' ') : null;

  return { weight, reps, target_label };
}

function toActualSet(set: SetDraft): SessionTelemetrySetDelta['actual'] {
  return {
    weight: normalizeDraftField(set.weight),
    reps: normalizeDraftField(set.reps),
    rpe: normalizeDraftField(set.rpe),
    done: set.done,
  };
}

function resolvePlannedSetCount(
  exerciseIndex: number,
  exercise: WorkoutExercise,
  draftRow: SetDraft[] | undefined,
  sessionVm: WorkoutSessionViewModel,
  lookup: ReturnType<typeof buildPlayerExerciseIndexLookup>,
): number {
  if (draftRow != null && draftRow.length > 0) return draftRow.length;
  const blockContext = blockContextForGlobalIndex(exerciseIndex, sessionVm.blocks, lookup);
  return resolvePlayerLogRowCount(exercise, blockContext);
}

function flattenSetLogs(draftLogs: SetDraft[][]): SessionTelemetrySetLogRow[] {
  const rows: SessionTelemetrySetLogRow[] = [];
  draftLogs.forEach((exerciseRow, exerciseIndex) => {
    exerciseRow.forEach((set, setIndex) => {
      rows.push({
        exercise_index: exerciseIndex,
        set_index: setIndex,
        weight: normalizeDraftField(set.weight),
        reps: normalizeDraftField(set.reps),
        rpe: normalizeDraftField(set.rpe),
        done: set.done,
      });
    });
  });
  return rows;
}

function buildExerciseDeltas(
  sessionVm: WorkoutSessionViewModel,
  draftLogs: SetDraft[][],
  ghostLogs: GhostSetSnapshot[][],
): { exerciseDeltas: SessionTelemetryExerciseDelta[]; skippedExerciseIndices: number[] } {
  const lookup = buildPlayerExerciseIndexLookup(sessionVm.blocks);
  const exerciseDeltas: SessionTelemetryExerciseDelta[] = [];
  const skippedExerciseIndices: number[] = [];

  sessionVm.flatExercises.forEach((exercise, exerciseIndex) => {
    const draftRow = draftLogs[exerciseIndex] ?? [];
    const ghostRow = ghostLogs[exerciseIndex] ?? [];
    const plannedSetCount = resolvePlannedSetCount(
      exerciseIndex,
      exercise,
      draftRow,
      sessionVm,
      lookup,
    );
    const loggedSetCount = draftRow.length;
    let completedSetCount = 0;

    const sets: SessionTelemetrySetDelta[] = [];
    const setCount = Math.max(plannedSetCount, loggedSetCount);

    for (let setIndex = 0; setIndex < setCount; setIndex += 1) {
      const draftSet = draftRow[setIndex] ?? {
        weight: '',
        reps: '',
        rpe: '',
        done: false,
      };
      const planned = buildPlannedSet(exercise, ghostRow[setIndex]);
      const status = deriveSetStatus(draftSet, planned);
      if (status === 'done') completedSetCount += 1;

      sets.push({
        set_index: setIndex,
        planned,
        actual: toActualSet(draftSet),
        status,
      });
    }

    if (plannedSetCount > 0 && completedSetCount === 0) {
      skippedExerciseIndices.push(exerciseIndex);
      for (const setDelta of sets) {
        if (setDelta.status === 'not_started') {
          setDelta.status = 'skipped';
        }
      }
    }

    exerciseDeltas.push({
      exercise_index: exerciseIndex,
      name: exercise.name,
      planned_set_count: plannedSetCount,
      logged_set_count: loggedSetCount,
      completed_set_count: completedSetCount,
      sets,
    });
  });

  return { exerciseDeltas, skippedExerciseIndices };
}

function resolveIntervalRoundsTarget(
  input: ReturnType<typeof resolveIntervalBlockInput>,
): number | null {
  if (!input) return null;
  if (input.format === 'tabata') return input.config.totalRounds;
  if (input.format === 'emom') return input.config.totalRounds;
  return null;
}

function resolveIntervalRoundsCompleted(
  snapshot: IntervalRowSnapshot,
  roundsTarget: number | null,
): number {
  if (snapshot.activeSetPhase === 'paused') {
    return Math.max(0, snapshot.roundIndex + 1);
  }
  if (roundsTarget != null && snapshot.roundIndex >= roundsTarget - 1) {
    return roundsTarget;
  }
  return Math.max(0, snapshot.roundIndex + 1);
}

function estimateElapsedInBlockSec(
  input: ReturnType<typeof resolveIntervalBlockInput>,
  snapshot: IntervalRowSnapshot,
): number {
  if (!input) return 0;
  const roundIndex = Math.max(0, snapshot.roundIndex);
  if (input.format === 'tabata') {
    const roundMs = input.config.workMs + input.config.restMs;
    return Math.round((roundIndex * roundMs + input.config.prepareMs) / 1000);
  }
  if (input.format === 'emom') {
    return Math.round((roundIndex * input.config.intervalMs) / 1000);
  }
  if (input.format === 'amrap') {
    return 0;
  }
  return 0;
}

function buildIntervalPerformance(
  sessionVm: WorkoutSessionViewModel,
  intervalRowSnapshots: Record<string, IntervalRowSnapshot | null>,
): SessionTelemetryIntervalRow[] {
  const rows: SessionTelemetryIntervalRow[] = [];

  for (const block of sessionVm.blocks) {
    const input = resolveIntervalBlockInput(block);
    const snapshot = intervalRowSnapshots[block.id];
    if (!input && snapshot == null) continue;

    const format = input?.format ?? 'straight';
    const roundsTarget = resolveIntervalRoundsTarget(input);
    const lastPhase = snapshot?.activeSetPhase ?? 'idle';
    const roundsCompleted = snapshot ? resolveIntervalRoundsCompleted(snapshot, roundsTarget) : 0;
    const elapsedInBlockSec = snapshot ? estimateElapsedInBlockSec(input, snapshot) : 0;

    rows.push({
      block_id: block.id,
      format,
      rounds_completed: roundsCompleted,
      rounds_target: roundsTarget,
      last_phase: lastPhase,
      elapsed_in_block_sec: elapsedInBlockSec,
    });
  }

  return rows;
}

function computeTotalVolumeKg(setLogs: SessionTelemetrySetLogRow[]): number | null {
  let total = 0;
  let hasVolume = false;

  for (const row of setLogs) {
    if (!row.done) continue;
    const weight = row.weight != null ? parseFloat(row.weight) : NaN;
    const reps = row.reps != null ? parseFloat(row.reps) : NaN;
    if (!Number.isFinite(weight) || !Number.isFinite(reps)) continue;
    total += weight * reps;
    hasVolume = true;
  }

  return hasVolume ? Math.round(total * 100) / 100 : null;
}

function buildPerformanceSummary(
  exerciseDeltas: SessionTelemetryExerciseDelta[],
  skippedExerciseIndices: number[],
  setLogs: SessionTelemetrySetLogRow[],
  elapsedSec: number,
): SessionTelemetryPerformanceSummary {
  let totalSetsPlanned = 0;
  let totalSetsLogged = 0;
  let totalSetsCompleted = 0;

  for (const exercise of exerciseDeltas) {
    totalSetsPlanned += exercise.planned_set_count;
    totalSetsLogged += exercise.logged_set_count;
    totalSetsCompleted += exercise.completed_set_count;
  }

  return {
    total_sets_planned: totalSetsPlanned,
    total_sets_logged: totalSetsLogged,
    total_sets_completed: totalSetsCompleted,
    total_volume_kg: computeTotalVolumeKg(setLogs),
    skipped_exercise_indices: skippedExerciseIndices,
    elapsed_sec: elapsedSec,
  };
}

function stableSortKeys(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stableSortKeys);
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = stableSortKeys(obj[key]);
  }
  return sorted;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableSortKeys(value));
}

/** FNV-1a 32-bit hex digest — fast, deterministic fingerprint for dedupe. */
export function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function computeSessionTelemetryFingerprint(
  input: SessionTelemetryFingerprintInput,
): string {
  const {
    schema_version,
    session_id,
    workout_log_task_id,
    set_logs,
    interval_performance,
    skipped_exercise_indices,
    live_set_counts,
  } = input;
  return fnv1aHex(
    stableStringify({
      schema_version,
      session_id,
      workout_log_task_id,
      set_logs,
      interval_performance,
      skipped_exercise_indices,
      live_set_counts,
    }),
  );
}

export function buildSessionTelemetrySnapshot(
  input: BuildSessionTelemetrySnapshotInput,
): SessionTelemetrySnapshot {
  const { context, capturedAt } = input;
  const { sessionVm, draftLogs, ghostLogs, intervalRowSnapshots } = context;

  const setLogs = flattenSetLogs(draftLogs);
  const { exerciseDeltas, skippedExerciseIndices } = buildExerciseDeltas(
    sessionVm,
    draftLogs,
    ghostLogs,
  );
  const intervalPerformance = buildIntervalPerformance(sessionVm, intervalRowSnapshots);
  const performanceSummary = buildPerformanceSummary(
    exerciseDeltas,
    skippedExerciseIndices,
    setLogs,
    context.elapsedSec,
  );

  const rawLiveSetCounts = draftLogs.map((row) => row.length);
  const liveSetCounts =
    validateLiveSetCounts(rawLiveSetCounts, sessionVm.flatExercises.length) ?? rawLiveSetCounts;

  const doneSetLogs = setLogs.filter((row) => row.done);

  const fingerprint = computeSessionTelemetryFingerprint({
    schema_version: SESSION_TELEMETRY_SCHEMA_VERSION,
    session_id: context.sessionId,
    workout_log_task_id: context.logTaskId,
    set_logs: doneSetLogs,
    interval_performance: intervalPerformance,
    skipped_exercise_indices: skippedExerciseIndices,
    live_set_counts: liveSetCounts,
  });

  return {
    schema_version: SESSION_TELEMETRY_SCHEMA_VERSION,
    captured_at: capturedAt ?? new Date().toISOString(),
    session_id: context.sessionId,
    workout_log_task_id: context.logTaskId,
    source_task_id: context.sourceTaskId,
    started_at: context.startedAt,
    elapsed_sec: context.elapsedSec,
    set_logs: setLogs,
    exercise_deltas: exerciseDeltas,
    interval_performance: intervalPerformance,
    performance_summary: performanceSummary,
    live_set_counts: liveSetCounts,
    fingerprint,
  };
}
