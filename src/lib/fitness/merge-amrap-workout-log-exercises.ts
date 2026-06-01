import type { SetLogEntry, WorkoutExercise } from '@/lib/item-metadata';
import type { WorkoutLogExerciseFinishPayload } from '@/lib/workout-factory/build-workout-log-finish-metadata';

/** One row from `workout_exercise_logs` scoped to live session + user (any deck task). */
export type AmrapActualLogRow = {
  exercise_name: string;
  set_number: number;
  weight_lbs: number | null;
  reps: number | null;
  rpe: number | null;
  /** ISO timestamp; used by {@link filterAmrapActualLogsForBlock} only. */
  created_at?: string;
  /** Deck task id when logged; ignored during merge (supports mid-AMRAP card switches). */
  task_id?: string;
};

function actualLogKey(exerciseName: string, setNumber: number): string {
  return `${exerciseName}\0${setNumber}`;
}

/**
 * Mirrors SQL finalize scoping: session-level logs for this AMRAP block window.
 * When multiple rows exist for the same exercise/set (deck card switch), keeps the latest.
 */
export function filterAmrapActualLogsForBlock(
  actuals: readonly AmrapActualLogRow[],
  blockStartedAt: Date | string,
): AmrapActualLogRow[] {
  const cutoffMs = new Date(blockStartedAt).getTime();
  if (!Number.isFinite(cutoffMs)) return [...actuals];

  const byKey = new Map<string, AmrapActualLogRow>();
  for (const row of actuals) {
    if (row.created_at) {
      const rowMs = new Date(row.created_at).getTime();
      if (Number.isFinite(rowMs) && rowMs < cutoffMs) continue;
    }

    const key = actualLogKey(row.exercise_name, row.set_number);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, row);
      continue;
    }

    const prevMs = prev.created_at ? new Date(prev.created_at).getTime() : 0;
    const rowMs = row.created_at ? new Date(row.created_at).getTime() : 0;
    if (rowMs >= prevMs) {
      byKey.set(key, row);
    }
  }

  return [...byKey.values()];
}

function parseTemplateInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }
  return null;
}

function parseTemplateWeight(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && /^-?\d/.test(value.trim())) {
    const n = Number.parseFloat(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function finiteNumberOrNull(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Number(value);
}

function buildSetLogEntry(
  setNum: number,
  actual: AmrapActualLogRow | undefined,
  template: WorkoutExercise,
): SetLogEntry {
  const entry: SetLogEntry = { set: setNum, done: true };

  if (actual) {
    const weight = finiteNumberOrNull(actual.weight_lbs);
    const reps = finiteNumberOrNull(actual.reps);
    const rpe = finiteNumberOrNull(actual.rpe);
    if (weight != null) entry.weight = weight;
    if (reps != null) entry.reps = reps;
    if (rpe != null) entry.rpe = rpe;
    return entry;
  }

  const weight = parseTemplateWeight(template.weight);
  const reps = parseTemplateInt(template.reps);
  const rpe = parseTemplateInt(template.rpe);

  if (weight != null) entry.weight = weight;
  if (reps != null) entry.reps = reps;
  if (rpe != null) entry.rpe = rpe;

  return entry;
}

/**
 * Builds `workout_log` exercise payload for AMRAP finalize: expands template to
 * `roundsCompleted` sets per exercise, merging participant actuals from
 * `workout_exercise_logs` when present (round N = set_number N).
 */
export function mergeAmrapWorkoutLogExercises(
  templateExercises: readonly WorkoutExercise[],
  roundsCompleted: number,
  actuals: readonly AmrapActualLogRow[],
): WorkoutLogExerciseFinishPayload[] {
  if (roundsCompleted <= 0) return [];

  const actualByKey = new Map<string, AmrapActualLogRow>();
  for (const row of actuals) {
    if (row.set_number < 1 || row.set_number > roundsCompleted) continue;
    actualByKey.set(actualLogKey(row.exercise_name, row.set_number), row);
  }

  return templateExercises.map((template) => {
    const set_logs: SetLogEntry[] = [];
    for (let setNum = 1; setNum <= roundsCompleted; setNum++) {
      const actual = actualByKey.get(actualLogKey(template.name, setNum));
      set_logs.push(buildSetLogEntry(setNum, actual, template));
    }

    const payload: WorkoutLogExerciseFinishPayload = {
      name: template.name,
      sets: roundsCompleted,
      set_logs,
    };

    if (template.reps != null) payload.reps = template.reps;
    if (template.weight != null && Number.isFinite(Number(template.weight))) {
      payload.weight = Number(template.weight);
    }
    if (template.duration_min != null) payload.duration_min = template.duration_min;

    return payload;
  });
}
