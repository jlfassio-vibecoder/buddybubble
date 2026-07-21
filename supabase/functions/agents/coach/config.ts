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
 * new-workout proposal (instructions + form cues for ~12–15 exercises) plus adaptive
 * thinking; the model only emits what it needs per turn — this is the cap, not a
 * target. Keep ≥16384 so creation-path `proposed_workout_metadata` JSON is less
 * likely to hit finish_reason MAX_TOKENS / truncated parse fallbacks.
 */
export const COACH_MAX_OUTPUT_TOKENS = 16384 as const;

/**
 * Rail + rich CURRENT WORKOUT CONTEXT: surgical `structural_patch` only.
 * Keep this low so runaway generation cannot burn the 60s Edge wall clock.
 */
export const COACH_RICH_WORKOUT_MAX_OUTPUT_TOKENS = 4096 as const;

/** Caps Gemini 2.5 thinking tokens so JSON replies finish within `LLM_TIMEOUT_MS`. */
export const COACH_THINKING_BUDGET = 2048 as const;

/** Main bubble intake / card-creation turns with no workout JSON in context. */
export const COACH_MAIN_CHAT_INTAKE_THINKING_BUDGET = 512 as const;

/**
 * Ask Coach / EXERCISE_CUE_REQUEST: low thinking — fill a small `workout_cues_patch`.
 * Thinking tokens count against `maxOutputTokens` on Gemini 2.5.
 */
export const COACH_CUE_THINKING_BUDGET = 256 as const;

/** Rail rich-canvas surgical edits: keep thinking small so JSON finishes quickly. */
export const COACH_RICH_WORKOUT_THINKING_BUDGET = 512 as const;

/** Vertex thinkingBudget for the main Coach JSON call on this turn. */
export function resolveCoachThinkingBudget(args: {
  isRailSurface: boolean;
  hasWorkoutContext: boolean;
  /** When true, use {@link COACH_CUE_THINKING_BUDGET} so cue JSON is not truncated. */
  exerciseCueRequestMode?: boolean;
}): number {
  if (args.exerciseCueRequestMode === true) {
    return COACH_CUE_THINKING_BUDGET;
  }
  if (!args.isRailSurface && !args.hasWorkoutContext) {
    return COACH_MAIN_CHAT_INTAKE_THINKING_BUDGET;
  }
  if (args.isRailSurface && args.hasWorkoutContext) {
    return COACH_RICH_WORKOUT_THINKING_BUDGET;
  }
  return COACH_THINKING_BUDGET;
}

/** Generation params for the workout-open silent-greeting preflight sub-call. */
export const COACH_WORKOUT_GREETING_TEMPERATURE = 0.35 as const;
/**
 * Visible JSON + Gemini 2.5 thinking share this budget. Keep headroom for a 3–6 sentence
 * personalized greeting; pair with {@link COACH_WORKOUT_GREETING_THINKING_BUDGET} so thinking
 * cannot starve `reply_content` mid-string (MAX_TOKENS → Unterminated string in JSON).
 */
export const COACH_WORKOUT_GREETING_MAX_OUTPUT_TOKENS = 2048 as const;
/** Disable thinking on the short greeting JSON call so all tokens go to reply_content. */
export const COACH_WORKOUT_GREETING_THINKING_BUDGET = 0 as const;

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
export const PERSONAL_CUES_FIELD_MAX_CHARS = 1000 as const;

/** Max length per text field in `workout_cues_patch` (M3 Ask Coach; ~2–3 sentences). */
export const WORKOUT_CUE_FIELD_MAX_CHARS = 1000 as const;

/**
 * Max output tokens for EXERCISE_CUE_REQUEST / Ask Coach turns.
 * Must leave headroom for required JSON scaffolding + up to four cue fields
 * after thinking tokens are counted against the same budget (see types note).
 */
export const COACH_CUE_MAX_OUTPUT_TOKENS = 4096 as const;

/** Max length for `reply_content` on cue-only schema turns (cues belong in workout_cues_patch). */
export const COACH_CUE_REPLY_CONTENT_MAX_CHARS = 1200 as const;

/** Fallback reply when the model claims a write without emitting structured fields (server guard). */
export const COACH_SELF_ATTESTATION_SAFE_REPLY =
  "I noticed I described an update I didn't actually save. Tell me which exercise to update, and I'll save the coach notes to your workout.";

/** Coach-notes-specific attestation fallback (clearer than the generic cues-oriented copy). */
export const COACH_NOTES_SELF_ATTESTATION_SAFE_REPLY =
  "I couldn't save that to the Coach notes field. Name the exercise (or quote the note text), and I'll write it to the workout card.";

/** Outline co-pilot: model narrated a structure update without `outline_draft_patch`. */
export const COACH_OUTLINE_SELF_ATTESTATION_SAFE_REPLY =
  'I described a structure change but did not save it to your outline. Try again (one block at a time), or add blocks with Add from Catalog in the structure panel.';

/** Appended server-side if the model omits it (matches the system-prompt contract). */
export const COACH_TASK_SEED_CTA =
  "Complete the Workout Intake 3-step form then click 'Generate Workout' on the card.";

/** Coach + Factory: Tabata vs Intervals terminology (keep in sync with interval-preset-catalog). */
export const INTERVAL_TERMINOLOGY_PROMPT_BLOCK =
  'INTERVAL TERMINOLOGY (CRITICAL): block_format "tabata" is the internal engine for all work/rest blocks. User-facing vocabulary: "Intervals" is the umbrella format name. "Tabata" means ONLY the strict Izumi protocol (20s work / 10s rest / 8 rounds default) — never say "Tabata-style", "-style Tabata", or "Tabata finisher" when work/rest are not 20/10. For other ratios use preset names (Classic HIIT for 30/30, Hypertrophy / Density for 40/20, Power Sprints for 10/50, Fighters / Grapplers for 5:00/1:00, Heavy Aerobic for 60/60) or "Intervals" / "Standard Intervals" for custom W/R. Always emit interval_preset on format_params (tabata, classic_hiit, hypertrophy_density, heavy_aerobic, power_sprints, fighters, or custom). Block names use the preset label (e.g. "Finisher — Classic HIIT"), not "Tabata" unless W/R are 20/10.';

export const INTERVAL_CIRCUIT_CARDINALITY_PROMPT_BLOCK =
  'INTERVAL CIRCUIT CARDINALITY (CRITICAL): On block_format tabata, format_params.rounds means CIRCUIT ROUNDS (full passes through the exercise list), not total work intervals. When exercises.length > 1, total work segments = rounds × exercises.length. When the user states N exercises, movements, or stations, emit exactly N distinct exercises: [{ name }, …] — one placeholder per rotation station. Use short generic names pre-factory (e.g. "Movement 1", "Station 2") when specific names are unknown. NEVER collapse multiple movements into one compound exercise name (e.g. "Burpees to Mountain Climbers", "A and B") unless the user explicitly requests a single combined movement. Route exercise count to exercises[] length — never encode it only in block name or description.';

export const INTERVAL_ACTIVE_REST_PROMPT_BLOCK =
  'INTERVAL ACTIVE REST vs ZERO-REST (CRITICAL): Hi/Low intensity (asymmetrical active recovery) — keep uneven work_seconds/rest_seconds (e.g. 45/15); put high-intensity stations in exercises[]; set rest_mode to "active" and put low-intensity moves in active_rest_exercises (e.g. ["Jogging"]). NEVER put active-rest lows into exercises[] with rest_seconds 0 — that forces equal durations and loses Hi/Low asymmetry. Push/Pull or agonist/antagonist with no idle rest — rest_seconds 0, both moves in exercises[], omit rest_mode and active_rest_exercises. rest_mode "active" requires rest_seconds > 0 and a non-empty active_rest_exercises array; omit rest_mode for standard passive Rest.';

export const INTERVAL_MODALITY_FACTORY_PROMPT =
  'INTERVAL MODALITIES: Strict modalities have locked timing — Tabata (20/10/8 only), EMOM, AMRAP. Do not recalculate their format_params. Standard intervals (block_format tabata with other W/R) are flexible: respect work_seconds, rest_seconds, rounds, interval_preset, and when present rest_mode / active_rest_exercises from the outline; never label non-20/10 blocks "Tabata" in coach_notes or exercise copy. Preserve rest_mode and active_rest_exercises when filling exercises — do not move active-rest names into exercises[].';

/** User-visible reply text the dispatcher inserts when the LLM call fails. */
export const COACH_SAFE_REPLY_TEXT =
  'I experienced a technical hiccup calculating your workout. Could you repeat that?';

/** Outline co-pilot fallback when Vertex output hits MAX_TOKENS (often verbose block names). */
export const COACH_OUTLINE_TRUNCATED_SAFE_REPLY =
  'I hit a length limit structuring your outline. Try one block at a time (for example: "Add Main AMRAP 15 min with 4 stations").';

/**
 * Mid-workout support directive appended when CURRENT WORKOUT CONTEXT is provided.
 * Verbatim from `bubble-agent-dispatch/index.ts:211-213`.
 */
/**
 * Pain triage override for live / mid-workout prescribe mandates.
 * Assess → Triage → Regress wins over "MUST prescribe" when acute pain is reported.
 */
export const PAIN_OVERRIDE_LIVE_SESSION_DIRECTIVE =
  'PAIN OVERRIDE: While you generally MUST prescribe weights and reps, if ACUTE PAIN is reported mid-workout, your mandate immediately shifts to triage. You MUST pause prescription, apply the JOINT PAIN MODIFICATION PROTOCOL, and default to pausing the set, reducing ROM, or skipping the exercise entirely. Do not invent wild substitutions to keep them moving. ';

export const MID_WORKOUT_SUPPORT_MODE_DIRECTIVE =
  "If 'CURRENT WORKOUT CONTEXT' is provided below, you are in Mid-Workout Support Mode. Your primary job is to guide the user through THIS specific workout, modify weights or reps for THIS workout, or answer form and execution questions about THIS workout. DO NOT generate a brand new workout or prescribe a replacement program unless the user explicitly asks to completely replace the current session. " +
  "If 'CURRENT TASK CONTEXT' also appears below, ignore PRE-DRAFT CONFIRMATION from that block for live load adjustments: mid-workout weight, rep, or RPE changes are execution_patch only (keep update_existing_task false) unless the user clearly asks to permanently change the task or card. " +
  "If PRE-SESSION READINESS is present below, use it as ground truth for today's readiness when adjusting reps, weight, or RPE. " +
  'If PRE-SESSION READINESS is absent, do not invent check-in values; ask a short how-are-you-feeling question before prescribing load or rep changes. ' +
  PAIN_OVERRIDE_LIVE_SESSION_DIRECTIVE;

/**
 * Injected when Active Session surface is detected. Pre-session check-in is realtime
 * context for an already-generated workout — not Generate Workout intake.
 */
export const ACTIVE_SESSION_PREFLIGHT_READINESS_DIRECTIVE =
  'ACTIVE SESSION PRE-SESSION CHECK-IN (CRITICAL): Energy (readiness), sleep quality, and soreness are captured at Active Session launch for an already-generated workout. This is realtime coaching context for THIS live session — it is NOT Generate Workout intake and is NOT owned exclusively by the Task Modal generation wizard. ' +
  'When --- PRE-SESSION READINESS --- appears below, that block is ground truth: you MUST recall sleep, energy, and soreness accurately when asked; use those values to adjust load/reps/RPE via execution_patch; NEVER claim the data is unavailable, inaccessible in live chat, or only processed for workout generation. ' +
  'When --- PRE-SESSION READINESS --- is absent, do not invent check-in values; ask a brief how-are-you-feeling question before prescribing — do not invent a policy that live chat cannot access check-in.';

/**
 * Active-workout-execution directive appended when CURRENT WORKOUT CONTEXT is present.
 * Verbatim from `bubble-agent-dispatch/index.ts:215-218`.
 */
export const ACTIVE_WORKOUT_EXECUTION_STATE_DIRECTIVE =
  'EXECUTION STATE (CRITICAL): The member is in an active workout right now. You MUST set create_card to false, task_title, task_description, and coach_task_notes to null, update_existing_task to false, and proposed_workout_metadata to null. Do not describe or claim you are creating a new Kanban workout card. For live set adjustments (load, reps, RPE, done), use execution_patch only. ' +
  'If the user asks to apply a generic value across a multi-round format (e.g. Tabata, EMOM, circuit), emit execution_patch entries for every valid setIndex for that exercise (0 through live_set_counts[exerciseIndex] - 1). ' +
  'If the user asks a general coaching question, answer in reply_content without card fields. ' +
  'When SESSION TELEMETRY is present, prefer logged actuals over prescription when answering "how did I do" or load guidance; still use execution_patch (not proposed_workout_metadata) for live grid updates. ' +
  'When INTERVAL_BLOCK_TIMERS appear in SESSION TELEMETRY, treat running_block_clock_elapsed as the authoritative block clock for pacing and completion—not global_session_time_elapsed. ' +
  'When PRE-SESSION READINESS is present, ground load/rep/RPE suggestions in that check-in and emit execution_patch for concrete session changes. ' +
  'When PRE-SESSION READINESS is absent, do not invent check-in values and do not claim check-in is unavailable due to Task Modal or generation workflow — ask briefly how they feel before prescribing. ' +
  PAIN_OVERRIDE_LIVE_SESSION_DIRECTIVE +
  'CRITICAL FORMATTING RULE: When emitting numerical values as strings in execution_patch (such as weight, reps, rpe, or distance), you MUST use clean whole numbers or a maximum of 2 decimal places (e.g. output "53" or "53.5", NEVER "53.000000..."). Never generate infinite trailing zeros.';

export const SESSION_TELEMETRY_GROUND_TRUTH_DIRECTIVE =
  'SESSION TELEMETRY (CRITICAL): When the SESSION TELEMETRY block appears below, treat it as ground truth for what the athlete has actually logged (weights, reps, RPE, set completion, interval rounds). ' +
  'Prescription targets and structure live in CURRENT WORKOUT CONTEXT above; telemetry shows planned-vs-actual deltas. ' +
  'When commenting on performance, progressive overload, or missed sets, cite logged values from SESSION TELEMETRY—not prescription alone. ' +
  'When emitting execution_patch, indices remain bounded by live_set_counts in CURRENT WORKOUT CONTEXT; patch values should align with what telemetry shows unless the user explicitly asks to change the log. ' +
  "INTERVAL TIMERS (CRITICAL): global_session_time_elapsed is total wall-clock time since the workout session started (warm-up, strength sets, transitions, and rest all count). INTERVAL_BLOCK_TIMERS running_block_clock_elapsed is the live clock for the currently running Tabata, EMOM, or AMRAP block only. NEVER compare global_session_time_elapsed to a block time_cap_minutes from CURRENT WORKOUT CONTEXT—that produces false conclusions (e.g. declaring an AMRAP finished because the session has run longer than the block cap). To evaluate whether an interval block is active, finished, or how much time remains, use INTERVAL_BLOCK_TIMERS (phase, running_block_clock_elapsed, rounds_completed) together with that block's format_params.time_cap_minutes from CURRENT WORKOUT CONTEXT; when needed, compute remaining block time as time_cap minus running_block_clock_elapsed, not time_cap minus global_session_time_elapsed.";

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
