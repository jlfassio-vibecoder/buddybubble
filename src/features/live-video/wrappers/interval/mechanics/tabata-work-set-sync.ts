import type { WorkoutExercise } from '@/lib/item-metadata';
import type { Database } from '@/types/database';

import type { TabataMechanicsState } from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';

type LogRow = Pick<
  Database['public']['Tables']['workout_exercise_logs']['Row'],
  'exercise_name' | 'set_number' | 'weight_lbs' | 'reps' | 'rpe'
>;

export type TabataWorkSetRowValues = {
  weightLbs: number | null;
  reps: number | null;
  rpe: number | null;
};

function parseOptionalInt(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

export function prescriptionNumbersFromExercise(ex: WorkoutExercise): TabataWorkSetRowValues {
  const w = Number(ex.weight);
  const weightLbs = Number.isFinite(w) ? w : null;
  let reps: number | null = null;
  if (typeof ex.reps === 'number' && Number.isFinite(ex.reps)) {
    reps = Math.round(ex.reps);
  } else if (typeof ex.reps === 'string') {
    reps = parseOptionalInt(ex.reps);
  }
  const r = Number(ex.rpe);
  const rpe = Number.isFinite(r) ? Math.round(r) : null;
  return { weightLbs, reps, rpe };
}

/** True when participant mechanics should upsert workout logs for the current work segment. */
export function shouldSyncTabataWorkSet(state: TabataMechanicsState): boolean {
  return (
    state.segment === 'work' &&
    state.round_index >= 1 &&
    state.segment_started_at != null &&
    state.is_paused !== true
  );
}

/** Dedup key: one upsert per work-segment anchor. */
export function tabataWorkSetSyncKey(state: TabataMechanicsState): string | null {
  if (!shouldSyncTabataWorkSet(state)) return null;
  return `${state.round_index}:${state.segment_started_at}`;
}

/** Clear dedup after timer reset / idle attach so round 1 can log again. */
export function shouldResetTabataWorkSetSyncRef(state: TabataMechanicsState): boolean {
  if (state.round_index === 0) return true;
  if (state.segment === 'idle') return true;
  if (state.segment === 'setup' && state.segment_started_at == null) return true;
  return false;
}

export function buildTabataWorkSetRowValues(
  exercise: WorkoutExercise,
  setNumber: number,
  logs: readonly LogRow[],
): TabataWorkSetRowValues | null {
  const mine = logs.filter((l) => l.exercise_name === exercise.name);
  const prior = mine.find((l) => l.set_number === setNumber - 1);
  if (prior) {
    const weightLbs =
      prior.weight_lbs != null && Number.isFinite(Number(prior.weight_lbs))
        ? Number(prior.weight_lbs)
        : null;
    const reps =
      prior.reps != null && Number.isFinite(Number(prior.reps))
        ? Math.round(Number(prior.reps))
        : null;
    const rpe =
      prior.rpe != null && Number.isFinite(Number(prior.rpe))
        ? Math.round(Number(prior.rpe))
        : null;
    if (weightLbs == null && reps == null && rpe == null) return null;
    return { weightLbs, reps, rpe };
  }

  const p = prescriptionNumbersFromExercise(exercise);
  if (p.weightLbs == null && p.reps == null && p.rpe == null) return null;
  return p;
}
