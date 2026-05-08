/**
 * MIRROR FILE — canonical lives at `src/lib/agents/coach/config.ts`.
 *
 * Body below is byte-for-byte identical to the canonical Vitest-side file (excluding
 * this header). Any change must be hand-mirrored — run `pnpm check:agent-mirror` to
 * verify parity. The canonical file includes Vitest unit-test coverage for
 * the constants that get exercised in `parse.ts` / `server-guards.ts`.
 *
 * No relative imports → import paths are identical between Node and Deno builds for
 * this module.
 */

/** Stable agent slug. Strategy modules are the only files allowed to hard-code this. */
export const COACH_SLUG = 'coach' as const;

/** Default Vertex publisher model for the main Coach generation call. */
export const COACH_MODEL_DEFAULT = 'gemini-2.5-flash' as const;

/** Generation params for the main Coach JSON-mode call. */
export const COACH_TEMPERATURE = 0.2 as const;
export const COACH_MAX_OUTPUT_TOKENS = 8192 as const;

/** Generation params for the workout-open silent-greeting preflight sub-call. */
export const COACH_WORKOUT_GREETING_TEMPERATURE = 0.35 as const;
export const COACH_WORKOUT_GREETING_MAX_OUTPUT_TOKENS = 512 as const;

/** Max length for the seed task comment passed to Postgres (matches RPC). */
export const COACH_TASK_NOTES_MAX_CHARS = 8000 as const;

/** Appended server-side if the model omits it (matches the system-prompt contract). */
export const COACH_TASK_SEED_CTA =
  "Does this proposed workout look good? If so, click 'Generate Workout' on the card. If you'd like any adjustments, let me know here in the chat!";

/** User-visible reply text the dispatcher inserts when the LLM call fails. */
export const COACH_SAFE_REPLY_TEXT =
  'I experienced a technical hiccup calculating your workout. Could you repeat that?';

/**
 * Mid-workout support directive appended when CURRENT WORKOUT CONTEXT is provided.
 * Verbatim from `bubble-agent-dispatch/index.ts:211-213`.
 */
export const MID_WORKOUT_SUPPORT_MODE_DIRECTIVE =
  "If 'CURRENT WORKOUT CONTEXT' is provided below, you are in Mid-Workout Support Mode. Your primary job is to guide the user through THIS specific workout, modify weights or reps for THIS workout, or answer form and execution questions about THIS workout. DO NOT generate a brand new workout or prescribe a replacement program unless the user explicitly asks to completely replace the current session. " +
  "If 'CURRENT TASK CONTEXT' also appears below, ignore PRE-DRAFT CONFIRMATION from that block for live load adjustments: mid-workout weight, rep, or RPE changes are execution_patch only (keep update_existing_task false) unless the user clearly asks to permanently change the task or card. ";

/**
 * Active-workout-execution directive appended when CURRENT WORKOUT CONTEXT is present.
 * Verbatim from `bubble-agent-dispatch/index.ts:215-218`.
 */
export const ACTIVE_WORKOUT_EXECUTION_STATE_DIRECTIVE =
  'EXECUTION STATE (CRITICAL): The member is in an active workout right now. You MUST set create_card to false, task_title, task_description, and coach_task_notes to null, update_existing_task to false, and proposed_workout_metadata to null. Do not describe or claim you are creating a new Kanban workout card. For live set adjustments (load, reps, RPE, done), use execution_patch only. ' +
  'If the user asks a general coaching question, answer in reply_content without card fields.';

/** Conversation-stage enum surfaced to Vertex via the response schema. */
export type IntakePhase =
  | 'greeting'
  | 'clarifying_session'
  | 'pre_draft_confirmation'
  | 'ready_to_prescribe'
  | 'other';

/** Session-readiness category enum surfaced to Vertex via the response schema. */
export type IntakeCategory =
  | 'sleep_energy'
  | 'modality_preference'
  | 'equipment_today'
  | 'soreness'
  | 'time_budget'
  | 'intensity'
  | 'injury_flags';

export const INTAKE_PHASES: readonly IntakePhase[] = [
  'greeting',
  'clarifying_session',
  'pre_draft_confirmation',
  'ready_to_prescribe',
  'other',
];

export const INTAKE_CATEGORIES: readonly IntakeCategory[] = [
  'sleep_energy',
  'modality_preference',
  'equipment_today',
  'soreness',
  'time_budget',
  'intensity',
  'injury_flags',
];
