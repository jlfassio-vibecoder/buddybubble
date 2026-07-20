/**
 * UI/DB view-model for Coach `proposed_workout_metadata` — Deno mirror of
 * `src/lib/agents/coach/proposed-workout-metadata-view.ts`.
 *
 * Run `pnpm check:agent-mirror` to verify parity.
 */

/** Flat exercise row on a creation-path proposal. */
export type ProposedWorkoutExerciseView = {
  name?: string;
  sets?: number;
  reps?: string;
  coach_notes?: string;
  equipment?: string;
  work_seconds?: number;
  rest_seconds?: number;
};

/** Named section on a creation-path proposal (wire snake_case). */
export type ProposedWorkoutBlockView = {
  name?: string;
  exercises?: ProposedWorkoutExerciseView[];
  instructions?: string[];
  block_format?: string;
  format_params?: Record<string, unknown>;
};

/**
 * Narrow view of Coach proposed workout metadata used by canvas mappers, draft cards,
 * and client effect payloads. Extra keys may still appear at runtime from legacy rows;
 * consumers should read only these fields.
 */
export type ProposedWorkoutMetadataView = {
  blocks?: ProposedWorkoutBlockView[];
  exercises?: ProposedWorkoutExerciseView[];
  workout_type?: string;
  duration_min?: number;
  replace_all_exercise_blocks?: boolean;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/** True when the proposal has at least one field the canvas / draft UI can use. */
export function hasUsableProposedWorkoutMetadata(proposed: ProposedWorkoutMetadataView): boolean {
  if (Array.isArray(proposed.blocks) && proposed.blocks.length > 0) return true;
  if (Array.isArray(proposed.exercises) && proposed.exercises.length > 0) return true;
  if (typeof proposed.workout_type === 'string' && proposed.workout_type.trim()) return true;
  if (typeof proposed.duration_min === 'number' && Number.isFinite(proposed.duration_min)) {
    return true;
  }
  return false;
}

/**
 * Coerce an unknown metadata blob into {@link ProposedWorkoutMetadataView}.
 * Returns null when the value is not a plain object.
 */
export function coerceProposedWorkoutMetadataView(
  raw: unknown,
): ProposedWorkoutMetadataView | null {
  if (!isPlainObject(raw)) return null;
  const out: ProposedWorkoutMetadataView = {};
  if (Array.isArray(raw.blocks)) {
    out.blocks = raw.blocks as ProposedWorkoutBlockView[];
  }
  if (Array.isArray(raw.exercises)) {
    out.exercises = raw.exercises as ProposedWorkoutExerciseView[];
  }
  if (typeof raw.workout_type === 'string') {
    out.workout_type = raw.workout_type;
  }
  if (typeof raw.duration_min === 'number' && Number.isFinite(raw.duration_min)) {
    out.duration_min = raw.duration_min;
  }
  if (raw.replace_all_exercise_blocks === true) {
    out.replace_all_exercise_blocks = true;
  }
  return out;
}

/** Treat a parsed Record as the view type (same shape; drops unknown typing). */
export function asProposedWorkoutMetadataView(
  meta: Record<string, unknown>,
): ProposedWorkoutMetadataView {
  return meta as ProposedWorkoutMetadataView;
}
