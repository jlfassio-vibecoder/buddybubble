/**
 * Coach strategy constants — pure module, canonical source.
 *
 * This file is the single source of truth for Coach's slug, model defaults, generation
 * params, prompt-side directives, and intake-phase / category enums. A byte-for-byte
 * mirror lives at `supabase/functions/agents/coach/config.ts` so the Deno runtime can
 * import the same constants without cross-runtime imports. Run `pnpm check:agent-mirror`
 * to verify parity.
 *
 * Lifted from the legacy single-file Coach implementation:
 *   - `COACH_TASK_NOTES_MAX_CHARS`, `COACH_TASK_SEED_CTA`:
 *     `supabase/functions/bubble-agent-dispatch/index.ts:95-99`.
 *   - `MID_WORKOUT_SUPPORT_MODE_DIRECTIVE`,
 *     `ACTIVE_WORKOUT_EXECUTION_STATE_DIRECTIVE`:
 *     `supabase/functions/bubble-agent-dispatch/index.ts:211-218`.
 *   - `INTAKE_PHASES`, `INTAKE_CATEGORIES`:
 *     `supabase/functions/bubble-agent-dispatch/index.ts:261-277`.
 *   - `COACH_SAFE_REPLY_TEXT`:
 *     `supabase/functions/bubble-agent-dispatch/index.ts:1747`.
 *
 * No DB clients, no Deno globals, no runtime side effects.
 */

/** Stable agent slug. Strategy modules are the only files allowed to hard-code this. */
export const COACH_SLUG = 'coach' as const;

/** Default Vertex publisher model for the main Coach generation call. */
export const COACH_MODEL_DEFAULT = 'gemini-2.5-flash' as const;

/** Generation params for the main Coach JSON-mode call. */
export const COACH_TEMPERATURE = 0.2 as const;
/**
 * Upper cap for Coach's main JSON-mode reply (visible JSON + Gemini 2.5 Flash
 * thinking share this budget per Vertex docs). Covers a fully-detailed ~90 min
 * workout rewrite (instructions + form cues for ~12–15 exercises) plus adaptive
 * thinking; the model only emits what it needs per turn — this is the cap, not a
 * target.
 */
export const COACH_MAX_OUTPUT_TOKENS = 12288 as const;

/** Caps Gemini 2.5 thinking tokens so JSON replies finish within `LLM_TIMEOUT_MS`. */
export const COACH_THINKING_BUDGET = 2048 as const;

/** Main bubble intake / card-creation turns with no workout JSON in context. */
export const COACH_MAIN_CHAT_INTAKE_THINKING_BUDGET = 512 as const;

/** Vertex thinkingBudget for the main Coach JSON call on this turn. */
export function resolveCoachThinkingBudget(args: {
  isRailSurface: boolean;
  hasWorkoutContext: boolean;
}): number {
  if (!args.isRailSurface && !args.hasWorkoutContext) {
    return COACH_MAIN_CHAT_INTAKE_THINKING_BUDGET;
  }
  return COACH_THINKING_BUDGET;
}

/** Generation params for the workout-open silent-greeting preflight sub-call. */
export const COACH_WORKOUT_GREETING_TEMPERATURE = 0.35 as const;
export const COACH_WORKOUT_GREETING_MAX_OUTPUT_TOKENS = 512 as const;

/** Phase B: outline-only Vertex call (blocks array only). */
export const COACH_OUTLINE_ONLY_MODEL = 'gemini-2.5-pro' as const;
export const COACH_OUTLINE_ONLY_TEMPERATURE = 0.4 as const;
export const COACH_OUTLINE_ONLY_MAX_OUTPUT_TOKENS = 8192 as const;

/**
 * Coach-specific override for the dispatcher's thread-history loader. Caps the
 * number of prior messages included as Vertex `contents` so the input window
 * stays bounded as a single workout thread accumulates turns (each user reply
 * + Coach reply + any safe-reply fallbacks all live in `messages` and would
 * otherwise be replayed on every dispatch).
 *
 * Plumbed through `AgentStrategy.historyLimit` → `buildDispatchContext` so the
 * resolver's `_shared/dispatch/history.ts:DEFAULT_HISTORY_LIMIT` (50) keeps
 * working for thread-continuation agent discovery (`agent-dispatch/resolve.ts`).
 */
export const COACH_HISTORY_LIMIT = 15 as const;

/** Max length for the seed task comment passed to Postgres (matches RPC). */
export const COACH_TASK_NOTES_MAX_CHARS = 8000 as const;

/** Max length per text field in `personal_cues_patch` before RPC merge (matches parse cap). */
export const PERSONAL_CUES_FIELD_MAX_CHARS = 2000 as const;

/** Fallback reply when the model claims a write without emitting structured fields (server guard). */
export const COACH_SELF_ATTESTATION_SAFE_REPLY =
  "I noticed I described an update I didn't actually save. Tell me which exercise to add cues for, and I'll save them to your personal notes.";

/** Appended server-side if the model omits it (matches the system-prompt contract). */
export const COACH_TASK_SEED_CTA =
  "Complete the Workout Intake 3-step form then click 'Generate Workout' on the card.";

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
  'If the user asks to apply a generic value across a multi-round format (e.g. Tabata, EMOM, circuit), emit execution_patch entries for every valid setIndex for that exercise (0 through live_set_counts[exerciseIndex] - 1). ' +
  'If the user asks a general coaching question, answer in reply_content without card fields. ' +
  'When SESSION TELEMETRY is present, prefer logged actuals over prescription when answering "how did I do" or load guidance; still use execution_patch (not proposed_workout_metadata) for live grid updates.';

export const SESSION_TELEMETRY_GROUND_TRUTH_DIRECTIVE =
  'SESSION TELEMETRY (CRITICAL): When the SESSION TELEMETRY block appears below, treat it as ground truth for what the athlete has actually logged (weights, reps, RPE, set completion, interval rounds). ' +
  'Prescription targets and structure live in CURRENT WORKOUT CONTEXT above; telemetry shows planned-vs-actual deltas. ' +
  'When commenting on performance, progressive overload, or missed sets, cite logged values from SESSION TELEMETRY—not prescription alone. ' +
  'When emitting execution_patch, indices remain bounded by live_set_counts in CURRENT WORKOUT CONTEXT; patch values should align with what telemetry shows unless the user explicitly asks to change the log.';

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
