/**
 * Wire shape for Coach `structural_patch` ops (field-level canvas / metadata edits).
 * Vitest canonical: `src/lib/agents/_shared/workout-metadata/structural-patch-types.ts`.
 */

export type CoachStructuralBlockFormat =
  | 'straight_sets'
  | 'superset'
  | 'circuit'
  | 'amrap'
  | 'emom'
  | 'tabata'
  | 'ladder'
  | 'chipper'
  | 'pyramid'
  | 'contrast'
  | 'clusters'
  | 'drop_sets';

/**
 * Deliberately small scalar subset exposed by the rich-canvas response schema.
 * Keep this aligned with `COACH_RESPONSE_SCHEMA.structural_patch.format_params`.
 * Nested arrays / open-ended objects are excluded because they dramatically increase
 * Gemini constrained-decoding states.
 */
export type CoachStructuralFormatParams = {
  time_cap_minutes?: number | null;
  interval_seconds?: number | null;
  total_minutes?: number | null;
  total_rounds?: number | null;
  rounds?: number | null;
  work_seconds?: number | null;
  rest_seconds?: number | null;
  target_rpe?: number | null;
};

export type CoachStructuralPatchOp = {
  /** Default `update`. `add_exercise` appends a new exercise to `block_id`. */
  op?: 'update' | 'add_exercise' | null;
  block_id: string;
  exercise_id?: string | null;
  name?: string | null;
  sets?: number | null;
  reps?: string | null;
  coach_notes?: string | null;
  rest_seconds?: number | null;
  work_seconds?: number | null;
  rpe?: number | null;
  block_format?: CoachStructuralBlockFormat | null;
  format_params?: CoachStructuralFormatParams | null;
};
