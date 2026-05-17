/**
 * Coach prompt builders — pure module, canonical source.
 *
 * Exports include:
 *   - `buildBaseCoachPrompt(currentDate)` — composite base prompt lifted verbatim from
 *     `supabase/functions/bubble-agent-dispatch/index.ts:1548-1573`. The only delta vs
 *     the legacy implementation is that the date is parameterized so unit tests can pin
 *     it; the legacy file derives `currentDate` inline at request time.
 *   - `buildWorkoutOpenGreetingPrompt({ workoutTitle, isoNow, userContextBlock? })` —
 *     the prompt-parts assembly from `bubble-agent-dispatch/index.ts:1486-1501`.
 *   - `buildWorkoutOpenGreetingUserText(workoutJson)` — the single user-turn payload
 *     from `bubble-agent-dispatch/index.ts:1502`.
 *   - `buildCurrentTaskContextBlock(title, description, opts?)` — the CURRENT TASK CONTEXT
 *     block from `bubble-agent-dispatch/index.ts:1621-1625`; `opts.rail` swaps the trailing
 *     instruction to the live co-pilot variant for `StandardTaskChatRail`.
 *   - `buildTaskModalIntakeUiCoachBlock()` — when the resolved task is workout /
 *     workout_log, appended after CURRENT TASK CONTEXT so the model maps chat to the
 *     Task Modal intake wizard and `task_modal_intake_patch`.
 *   - `readTaskModalLiveStateFromMessageMetadata`, `buildTaskModalLiveStateBlock` —
 *     Phase 3.7: client `messages.metadata.task_modal_live_state` → system prompt.
 *   - `WORKOUT_CONTEXT_HEADER`, `USER_CONTEXT_TAIL`, `LAST_WORKOUT_CONTEXT_HEADER`,
 *     `CURRENT_USER_CONTEXT_HEADER` — header constants reused by the strategy and the
 *     Deno-only `context.ts` module.
 *
 * A byte-for-byte mirror lives at `supabase/functions/agents/coach/prompts.ts`. Run
 * `pnpm check:agent-mirror` to verify parity.
 *
 * Pure module: depends on `./config` and `./task-modal-intake-patch` (intake enum lists).
 */

/* eslint-disable max-len */

import {
  WORKOUT_INTAKE_DURATION_CHOICES,
  WORKOUT_INTAKE_EQUIPMENT_OPTIONS,
  WORKOUT_INTAKE_INTENSITY_OPTIONS,
  WORKOUT_INTAKE_SORENESS_OPTIONS,
} from './task-modal-intake-patch';

/** Header line prepended to the resolved CURRENT WORKOUT CONTEXT JSON when present. */
export const WORKOUT_CONTEXT_HEADER = '--- CURRENT WORKOUT CONTEXT ---';

/** `messages.metadata.surface` value emitted by `StandardTaskChatRail` (snake_case). */
export const COACH_RAIL_SURFACE_VALUE = 'standard_task_chat_rail' as const;

/** Returns true when the trigger message originated from the task-modal chat rail. */
export function isCoachRailSurfaceFromMessageMetadata(meta: unknown): boolean {
  if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) return false;
  const o = meta as Record<string, unknown>;
  return o.surface === COACH_RAIL_SURFACE_VALUE;
}

/** Header line for the user-context block emitted by the Deno-only context module. */
export const CURRENT_USER_CONTEXT_HEADER = '--- CURRENT USER CONTEXT ---';

/** Header line for the recent-workout context block emitted by `context.ts`. */
export const LAST_WORKOUT_CONTEXT_HEADER = '--- LAST WORKOUT CONTEXT ---';

/** Trailing instruction appended to the user-context block. */
export const USER_CONTEXT_TAIL =
  '\n\nUse this context to highly personalize your advice. Do not explicitly state that you are reading a database file, just speak to them as if you remember their journey.';

/** Header for the task-modal workout intake wizard contract (Coach JSON + UI). */
export const TASK_MODAL_INTAKE_UI_HEADER =
  '--- TASK MODAL INTAKE UI (workout / workout_log card) ---';

/** Header for client-supplied Task Modal wizard snapshot on the trigger message. */
export const TASK_MODAL_LIVE_STATE_HEADER = '--- TASK MODAL LIVE STATE (v1) ---';

/** Validated snapshot from `messages.metadata.task_modal_live_state` (v1). */
export type TaskModalLiveStateV1 = {
  v: 1;
  item_type: 'workout' | 'workout_log';
  wizard_step?: 1 | 2 | 3 | 4;
  readiness?: number;
  sleep_quality?: number;
  /** Display / schema: numeric durations as quoted strings in Coach JSON. */
  duration_minutes?: number | string;
  target_intensity?: string;
  soreness?: string[];
  equipment?: string[];
};

const DURATION_STRING_SET = new Set(
  WORKOUT_INTAKE_DURATION_CHOICES.map((d) => (typeof d === 'number' ? String(d) : d)),
);
const INTENSITY_SET_LIVE = new Set<string>(WORKOUT_INTAKE_INTENSITY_OPTIONS as unknown as string[]);
const SORENESS_SET_LIVE = new Set<string>(WORKOUT_INTAKE_SORENESS_OPTIONS as unknown as string[]);
const EQUIPMENT_SET_LIVE = new Set<string>(WORKOUT_INTAKE_EQUIPMENT_OPTIONS as unknown as string[]);

function clampIntLive(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/**
 * Reads and validates `metadata.task_modal_live_state` from the trigger message.
 * Returns `null` when absent, wrong version, or invalid `item_type`. Drops invalid fields silently.
 */
export function readTaskModalLiveStateFromMessageMetadata(
  meta: unknown,
): TaskModalLiveStateV1 | null {
  if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const root = meta as Record<string, unknown>;
  const raw = root.task_modal_live_state;
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  const itRaw = o.item_type ?? o.itemType;
  const it =
    typeof itRaw === 'string' && (itRaw === 'workout' || itRaw === 'workout_log')
      ? (itRaw as 'workout' | 'workout_log')
      : null;
  if (!it) return null;

  const out: TaskModalLiveStateV1 = { v: 1, item_type: it };

  const wsRaw = o.wizard_step ?? o.wizardStep;
  const ws =
    typeof wsRaw === 'number' ? wsRaw : typeof wsRaw === 'string' ? Number(wsRaw.trim()) : NaN;
  if (Number.isInteger(ws) && ws >= 1 && ws <= 4) out.wizard_step = ws as 1 | 2 | 3 | 4;

  const rRaw = o.readiness;
  if (typeof rRaw === 'number' && Number.isFinite(rRaw)) out.readiness = clampIntLive(rRaw, 1, 10);
  else if (typeof rRaw === 'string' && /^\d+$/.test(rRaw.trim())) {
    out.readiness = clampIntLive(Number(rRaw.trim()), 1, 10);
  }

  const sRaw = o.sleep_quality ?? o.sleepQuality;
  if (typeof sRaw === 'number' && Number.isFinite(sRaw))
    out.sleep_quality = clampIntLive(sRaw, 1, 10);
  else if (typeof sRaw === 'string' && /^\d+$/.test(sRaw.trim())) {
    out.sleep_quality = clampIntLive(Number(sRaw.trim()), 1, 10);
  }

  const dmRaw = o.duration_minutes ?? o.durationMinutes;
  if (typeof dmRaw === 'number' && DURATION_STRING_SET.has(String(dmRaw))) {
    out.duration_minutes = dmRaw;
  } else if (typeof dmRaw === 'string') {
    const t = dmRaw.trim();
    if (t && DURATION_STRING_SET.has(t)) out.duration_minutes = t;
  }

  const tiRaw = o.target_intensity ?? o.targetIntensity;
  if (typeof tiRaw === 'string') {
    const t = tiRaw.trim();
    if (INTENSITY_SET_LIVE.has(t)) out.target_intensity = t;
  }

  const sore = o.soreness;
  if (Array.isArray(sore)) {
    const arr: string[] = [];
    for (const el of sore) {
      if (typeof el !== 'string') continue;
      const s = el.trim();
      if (SORENESS_SET_LIVE.has(s)) arr.push(s);
    }
    if (arr.length) out.soreness = [...new Set(arr)].sort();
  }

  const eq = o.equipment;
  if (Array.isArray(eq)) {
    const arr: string[] = [];
    for (const el of eq) {
      if (typeof el !== 'string') continue;
      const s = el.trim();
      if (EQUIPMENT_SET_LIVE.has(s)) arr.push(s);
    }
    if (arr.length) out.equipment = [...new Set(arr)].sort();
  }

  return out;
}

function formatDurationForLiveBlock(d: number | string | undefined): string {
  if (d === undefined) return '';
  if (typeof d === 'number' && Number.isFinite(d)) return `"${d}"`;
  return JSON.stringify(String(d));
}

/**
 * Deterministic system-prompt block for validated live wizard state.
 */
export function buildTaskModalLiveStateBlock(snapshot: TaskModalLiveStateV1): string {
  const lines: string[] = [
    TASK_MODAL_LIVE_STATE_HEADER,
    'This is what the user currently sees on the Task Modal intake wizard (NOT necessarily saved to the database). Treat it as ground truth for "current" values. If you describe a slider or step change in reply_content, mirror the same change in task_modal_intake_patch.',
    `item_type: ${snapshot.item_type}`,
  ];
  if (snapshot.wizard_step !== undefined) lines.push(`wizard_step: ${snapshot.wizard_step}`);
  if (snapshot.readiness !== undefined) lines.push(`readiness: ${snapshot.readiness}`);
  if (snapshot.sleep_quality !== undefined) lines.push(`sleep_quality: ${snapshot.sleep_quality}`);
  if (snapshot.duration_minutes !== undefined) {
    lines.push(`duration_minutes: ${formatDurationForLiveBlock(snapshot.duration_minutes)}`);
  }
  if (snapshot.target_intensity !== undefined) {
    lines.push(`target_intensity: ${JSON.stringify(snapshot.target_intensity)}`);
  }
  if (snapshot.soreness !== undefined && snapshot.soreness.length > 0) {
    lines.push(`soreness: ${JSON.stringify(snapshot.soreness)}`);
  }
  if (snapshot.equipment !== undefined && snapshot.equipment.length > 0) {
    lines.push(`equipment: ${JSON.stringify(snapshot.equipment)}`);
  }
  return lines.join('\n');
}

/**
 * True when `tasks.metadata` (or equivalent) clearly describes a workout card even if
 * `item_type` is not exactly `workout` / `workout_log` (used to gate TASK MODAL INTAKE UI).
 */
export function taskMetadataLooksWorkoutShaped(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const m = metadata as Record<string, unknown>;
  const wt = m.workout_type ?? m.workoutType;
  if (typeof wt === 'string' && wt.trim().length > 0) return true;
  const ex = m.exercises;
  if (Array.isArray(ex) && ex.length > 0) return true;
  const wc = m.workoutContext;
  if (wc != null && typeof wc === 'object') return true;
  const dm = m.duration_min ?? m.durationMin;
  if (typeof dm === 'number' && Number.isFinite(dm)) return true;
  if (typeof dm === 'string' && dm.trim().length > 0) return true;
  return false;
}

/**
 * When the member is on a workout or workout_log task, the Task Modal shows a four-step
 * intake wizard. Appended to the system prompt after CURRENT TASK CONTEXT.
 */
export function buildTaskModalIntakeUiCoachBlock(): string {
  const durationLine = WORKOUT_INTAKE_DURATION_CHOICES.map((d) =>
    d === 'Optimized for Goals' ? '"Optimized for Goals"' : `"${d}"`,
  ).join(', ');
  const intensityLine = WORKOUT_INTAKE_INTENSITY_OPTIONS.map((s) => `"${s}"`).join(', ');
  const sorenessLine = WORKOUT_INTAKE_SORENESS_OPTIONS.map((s) => `"${s}"`).join(', ');
  const equipmentLine = WORKOUT_INTAKE_EQUIPMENT_OPTIONS.map((s) => `"${s}"`).join(', ');
  return (
    `${TASK_MODAL_INTAKE_UI_HEADER}\n` +
    'The Task Modal **Workout intake** wizard (before AI session generation) uses these fields. Populate or adjust them from chat with **task_modal_intake_patch** (JSON object; include only keys you change). The client applies the same object shape from message metadata—do not rely on reply prose alone.\n' +
    '- **readiness** and **sleep_quality**: integers **1–10** only (slider labels: Readiness / energy, Sleep quality). They are **not** the same as **session_readiness_score** (0–100 routing estimate): never copy session_readiness_score into readiness or sleep_quality. If you tell the user a readiness or sleep slider value in reply_content, you **must** mirror those same 1–10 integers in task_modal_intake_patch.\n' +
    '- **wizard_step**: optional integer **1–4** to show that step after applying other fields.\n' +
    `- **duration_minutes**: string, exactly one of: ${durationLine}.\n` +
    `- **target_intensity**: string, exactly one of: ${intensityLine}.\n` +
    `- **soreness**: string array; each item must be one of: ${sorenessLine}. Use ["None"] when nothing is sore; do not mix "None" with other areas.\n` +
    `- **equipment**: string array; each item must be one of: ${equipmentLine}.\n` +
    'WORKED EXAMPLES (task_modal_intake_patch only — do not confuse with top-level session_readiness_score):\n' +
    '- GOOD: {"readiness":7,"sleep_quality":8} — both are **1–10** intake sliders.\n' +
    '- GOOD: {"duration_minutes":"30"} — duration_minutes must be a **string** (quoted in JSON), one of "15", "30", "45", "60", or "Optimized for Goals".\n' +
    '- BAD: {"duration_minutes":30} — bare integer is invalid for the schema; use the string "30" instead.\n' +
    '- BAD: {"readiness":72} — 72 looks like **session_readiness_score (0–100)**; use 1–10 for readiness instead (e.g. map high energy to 8–10, not 70+).\n' +
    '- BAD: {"readiness":"feeling great"} — free-text is invalid; use an integer 1–10 (or digit string like "7").\n' +
    '- GOOD: {"soreness":["Legs"]} or {"soreness":["None"]} when nothing is sore.\n' +
    '- BAD: {"soreness":["None","Legs"]} — never mix **None** with specific areas; drop None or pick only body areas.\n' +
    'Use null / omit task_modal_intake_patch when you are not updating the wizard.'
  );
}

/**
 * Composite base Coach prompt. Returns the same string the legacy file builds inline at
 * `bubble-agent-dispatch/index.ts:1548-1573`. The `currentDate` is parameterized so
 * tests can pin a date; production callers pass `new Date().toISOString().split('T')[0]`.
 */
export function buildBaseCoachPrompt(currentDate: string): string {
  return (
    `The current date is ${currentDate}. Always use this exact date if you need to schedule a workout or include a date in a title. DO NOT use placeholders. ` +
    'CRITICAL ANTI-LOOP: reply_content must be a single concise coaching message. NEVER repeat the same phrase, sentence, note, or placeholder. Do not pad or loop text. ' +
    'CRITICAL: Task titles must be short, clean, and concise (under 100 characters). NEVER repeat the same phrase, sentence, or placeholder in task_title or reply_content. Output the exact title once and stop. ' +
    'Never use emojis in task titles, it causes database crashes. Keep all titles under 100 characters plain text. ' +
    'You are a consultative fitness coach inside BuddyBubble. Chat naturally and helpfully. ' +
    'ROLE: You are an expert AI Fitness Coach. When a user asks for weight, rep, or RPE recommendations, you MUST calculate and prescribe specific values from their context and feedback. DO NOT ask the user to supply the numbers for you to copy. ' +
    'SESSION READINESS (today) is separate from static profile completeness. Profile (CURRENT USER CONTEXT) tells you who they are generally; readiness tells you what is appropriate for THIS session (sleep/energy, soreness, equipment they have right now, time budget, intensity preference, injury flags). ' +
    'Use LAST WORKOUT CONTEXT when present to ask grounded follow-ups (recovery, progression, what felt hard), not generic questionnaires. ' +
    'Do not set create_card to true until missing_intake_categories is empty (or the user has clearly waived intake via user_requested_immediate_card) AND you can prescribe safely for today AND (you have completed PRE-DRAFT CONFIRMATION as above OR user_requested_immediate_card). If missing_intake_categories is non-empty, create_card should normally be false. ' +
    'Always prioritize asking 1–2 targeted questions over immediate card generation unless the user explicitly asks to skip questions and "just put it on a card" / generate now (then set user_requested_immediate_card true). ' +
    'Check CURRENT USER CONTEXT for goals, schedule, and default equipment: do not re-ask for data that is clearly already on file unless you need today-specific overrides (e.g. equipment_today). ' +
    'PRE-DRAFT CONFIRMATION (critical human-in-the-loop step): After session readiness is sufficient (missing_intake_categories is empty, or the user waived further intake via user_requested_immediate_card), do NOT claim the workout is finished, fully written, or already saved as a draft. Do NOT imply that structured proposed_workout_metadata or a Kanban card body already exists in the system. ' +
    'On the first turn where you would otherwise prescribe or draft, unless user_requested_immediate_card is true: (1) acknowledge what they shared, (2) say you are starting to design or are ready to draft (intent, not completion), (3) ask for a final green light—e.g. any last injuries, preferences, or explicit OK to draft. Set create_card to false; set update_existing_task to false; leave proposed_workout_metadata null; use intake_phase pre_draft_confirmation. Example tone (adapt, do not copy verbatim): "Excellent! Since you are feeling strong with good energy and no soreness, I have started to put together a challenging full-body AMRAP using bodyweight and bands—it will hit major muscle groups and keep your heart rate up. Any last items you want to address before I draft the outline?" ' +
    'Draft triggers: Only set create_card to true with full task_title and task_description AFTER the user gives clear affirmative consent to create the card (or user_requested_immediate_card). Only populate proposed_workout_metadata when update_existing_task is true AND the user has clearly confirmed they want the structured draft or revision (e.g. yes, draft it, go ahead), OR user_requested_immediate_card—never on the pre_draft_confirmation turn alone. ' +
    'When create_card is true, you must provide non-empty task_title and a rich task_description for the Kanban card body (workout details, structure, equipment, safety). Never leave task_description null or empty when create_card is true. ' +
    "When create_card is true, also populate coach_task_notes with a task-scoped coach comment: brief readiness summary, rationale for this prescription, and scaling or regression options. task_description is the executable plan; coach_task_notes are the \"why\" and how to adjust. Always end coach_task_notes with this exact call-to-action (verbatim): Does this proposed workout look good? If so, click 'Generate Workout' on the card. If you'd like any adjustments, let me know here in the chat! Use null for coach_task_notes only when create_card is false. " +
    'When create_card is false, set task_title, task_description, and coach_task_notes to null. ' +
    'When the server includes CURRENT TASK CONTEXT, the user is discussing that existing task. Follow PRE-DRAFT CONFIRMATION before emitting structured proposed_workout_metadata: on the confirmation-only turn, set update_existing_task to false and leave proposed_workout_metadata null. When the user has clearly approved drafting or revising (or user_requested_immediate_card), set update_existing_task to true and provide updated_task_title and/or updated_task_description as the FULL revised card text (not a diff), and/or proposed_workout_metadata with structured exercises (name, sets, reps, etc.), workout_type, and/or duration_min. At least one of: non-empty updated title, non-empty updated description, or non-empty proposed_workout_metadata must be present when update_existing_task is true. Prefer update_existing_task over create_card when modifying an existing card (set create_card false). The server resolves the task id — never output a task id. EXCEPTION (live co-pilot rail): when the prompt also contains the LIVE CO-PILOT MODE block AND a --- CURRENT WORKOUT CONTEXT --- block, the workout already exists and PRE-DRAFT CONFIRMATION does not apply for incremental edits to it — emit structured fields immediately as described under LIVE CO-PILOT MODE. ' +
    'Set session_request true when the user wants a workout or session planned for today or soon; false otherwise. The server uses this for turn gating—be honest. ' +
    'Align intake_phase, session_readiness_score, and missing_intake_categories with your judgment (e.g. clarifying_session while collecting readiness; pre_draft_confirmation when asking for the final green light before drafting; ready_to_prescribe when you are actually outputting the card or structured draft in this same response). ' +
    'LIVE SESSION vs CARD DRAFT: If CURRENT WORKOUT CONTEXT is present and the user wants to adjust the live log (weights, reps, RPE, set done), set execution_patch, keep update_existing_task false, and keep proposed_workout_metadata null. Use update_existing_task and proposed_workout_metadata only when the user explicitly wants a permanent rewrite of the task or card (e.g. restructure the whole program or replace the written workout in the task). ' +
    "EXECUTION PATCH (live player): When CURRENT WORKOUT CONTEXT is present and the user mentions specific equipment (e.g. 'I have 60lb kettlebells') or asks for specific changes to the current workout session (workoutContext JSON under CURRENT WORKOUT CONTEXT), you MUST compute the appropriate weights, reps, RPE, and/or set completion and include them in the execution_patch field. " +
    'Do not only describe numbers in reply_content; you must also provide the JSON execution_patch so the app can update the live grid. You may list multiple sets and multiple exercises in one patch. String fields (weight, reps, rpe) must be pure numeric strings only, with no ranges, units, or extra text (e.g. "60", "8", "7.5"). Set execution_patch to null when you are not changing the live log. ' +
    'PERSONAL CUES: When the user wants instructions, form cues, tips, or injury notes saved for catalog exercises, emit personal_cues_patch (one entry per exerciseIndex from EXERCISE_INDEX_MAP; only [dict:...] rows persist); you may combine it with execution_patch in one response. ' +
    'TASK MODAL INTAKE PATCH: When TASK MODAL INTAKE UI appears in the system prompt (workout / workout_log task under discussion), use task_modal_intake_patch to update the on-card intake wizard (readiness and sleep sliders 1–10, wizard_step 1–4, duration_minutes, target_intensity, soreness, equipment). Do not only describe those values in reply_content when you intend the UI to change—emit task_modal_intake_patch. Set task_modal_intake_patch to null when not updating the wizard. ' +
    'If --- TASK MODAL LIVE STATE (v1) --- appears in the system prompt and you describe changing a slider, step, duration, intensity, soreness, or equipment in reply_content, you MUST emit the same change in task_modal_intake_patch in that same JSON. ' +
    'TRUTHFULNESS: If reply_content claims you wrote or applied something, include non-null execution_patch, personal_cues_patch, task_modal_intake_patch, or create_card/update_existing_task in the same JSON. ' +
    'Return ONLY a raw JSON object (no markdown, no code fences) with keys: reply_content, create_card, task_title, task_description, update_existing_task, updated_task_title, updated_task_description, proposed_workout_metadata, execution_patch, personal_cues_patch, task_modal_intake_patch, intake_phase, session_readiness_score, missing_intake_categories, user_requested_immediate_card, session_request, coach_task_notes. ' +
    'You MUST respond in valid JSON matching the provided schema. Do not output markdown, plain text, or conversational filler outside of the JSON object.'
  );
}

export type WorkoutOpenGreetingPromptArgs = {
  workoutTitle: string;
  isoNow: string;
  userContextBlock?: string | null;
};

/**
 * Build the system prompt for the workout-open silent-greeting preflight call.
 * Mirrors the parts assembly at `bubble-agent-dispatch/index.ts:1486-1501`.
 */
export function buildWorkoutOpenGreetingPrompt(args: WorkoutOpenGreetingPromptArgs): string {
  const parts: string[] = [
    'You are Coach in BuddyBubble. The member just opened the in-app workout player and is about to perform the workout.',
    `Workout title: "${args.workoutTitle}".`,
    'Write exactly ONE short chat message (2–5 sentences) that will appear in the bubble thread.',
    'Start with a natural time-of-day greeting (infer from the timestamp or use a neutral greeting).',
    'Name the workout. Acknowledge they are about to start it.',
    'Invite them to ask questions about exercises, weights, reps, or sets.',
    'You may briefly offer to help log or review their results if they want.',
    'Do NOT offer to create a Kanban card, draft a card, or run a long intake questionnaire.',
    'Do NOT paste or reference any SYSTEM_EVENT string or technical trigger text.',
    `Reference timestamp (UTC): ${args.isoNow}`,
  ];
  if (args.userContextBlock) {
    parts.push('--- USER CONTEXT ---\n' + args.userContextBlock);
  }
  return parts.join('\n\n');
}

/**
 * Single user-turn text passed to the workout-open preflight call. Mirrors the legacy
 * line at `bubble-agent-dispatch/index.ts:1502`.
 */
export function buildWorkoutOpenGreetingUserText(workoutJson: string): string {
  return `Structured workout data (JSON; may be truncated):\n${workoutJson || '{}'}`;
}

/**
 * CURRENT TASK CONTEXT block prepended to the system prompt when the dispatcher
 * resolved a task under discussion. Mirrors the inline composition at
 * `bubble-agent-dispatch/index.ts:1621-1625`.
 */
export function buildCurrentTaskContextBlock(
  title: string,
  description: string | null,
  opts?: { rail?: boolean },
): string {
  const desc =
    typeof description === 'string' && description.trim()
      ? description.trim()
      : '(empty description)';
  const isRail = opts?.rail === true;
  const tail = isRail
    ? 'LIVE CO-PILOT MODE (Task Modal rail). You are actively co-editing this task with the user. Treat any --- CURRENT WORKOUT CONTEXT --- block below as the user\'s existing, approved workout — they generated it on the card themselves. When they ask for additions, swaps, or rewrites (e.g. "add a finisher", "make block 3 heavier", "swap squats for hinges"): Set update_existing_task: true. Emit proposed_workout_metadata containing the full revised workout (not a diff), preserving every block / exercise the user did not ask to change, with the requested change applied. When the user asks for a named section (e.g. "add a finisher", "add a core finisher", "rewrite the warm-up", "add a mobility cool-down"), emit proposed_workout_metadata.blocks as the full revised list of named sections — each item has name (free text like "Warm-up", "Main", "Strength A", "Finisher", "Cool down", "Mobility") plus either exercises (sets/reps) or instructions (one short line per item). Use blocks whenever section identity matters; reserve top-level exercises for cases where you are only appending or replacing items inside an existing single block. Title / description text-only edits continue to use updated_task_title / updated_task_description with no proposed_workout_metadata — that path persists immediately via direct-update RPC. Do NOT open a new consent turn when the workout already exists on the card. Confirm what you did in reply_content; the structured fields are the writes.'
    : 'PRE-DRAFT CONFIRMATION: Do not populate proposed_workout_metadata until the user has given clear affirmative consent to draft or revise this card (or user_requested_immediate_card). On a confirmation-only turn, set update_existing_task to false and proposed_workout_metadata to null. When they confirm, set update_existing_task to true and provide updated_task_title and/or updated_task_description with the full revised text, and/or proposed_workout_metadata with structured exercises (and workout_type, duration_min as appropriate). The user must finalize changes on the card — do not assume the database updates immediately.';
  return (
    '--- CURRENT TASK CONTEXT ---\n' +
    `You are discussing an existing task titled "${title.trim()}".\n` +
    `Description:\n${desc}\n` +
    tail
  );
}

/** Appended after `CURRENT WORKOUT CONTEXT` JSON when parseable `exercises[]` exists. */
export const EXERCISE_INDEX_MAP_HEADER = '--- EXERCISE_INDEX_MAP ---';

/** Server-resolved catalog row for one workout exercise index (prompt + parse). */
export type ExerciseDictionaryIndexEntry = { dictionary_id: string; slug: string | null };

/**
 * Legacy label for personal_cues_patch (not injected into the system prompt; base prompt covers it).
 *
 * @deprecated Kept for imports/tests only. Strategy no longer appends this block.
 */
export const PERSONAL_CUES_PATCH_GUIDE =
  'Use personal_cues_patch for saved personal cues per EXERCISE_INDEX_MAP ([dict:...] only), optionally alongside execution_patch.';

/**
 * Builds a deterministic exerciseIndex roster from stringified workout context JSON.
 * Returns null when JSON is invalid, truncated, or has no `exercises` array.
 * When `dictionaryByIndex` is provided, each line is suffixed with [dict:uuid] or [custom].
 */
export function formatExerciseIndexMap(
  workoutContextJson: string,
  dictionaryByIndex?: Readonly<Record<number, ExerciseDictionaryIndexEntry | null>> | null,
): string | null {
  const trimmed = workoutContextJson.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    let ex: unknown[];
    if (Array.isArray(parsed)) {
      ex = parsed;
    } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const raw = (parsed as Record<string, unknown>).exercises;
      ex = Array.isArray(raw) ? raw : [];
    } else {
      return null;
    }
    if (ex.length === 0) return null;
    const lines: string[] = [];
    for (let i = 0; i < ex.length; i++) {
      const el = ex[i];
      let label = '(unnamed)';
      if (el && typeof el === 'object' && !Array.isArray(el)) {
        const n = (el as Record<string, unknown>).name;
        if (typeof n === 'string' && n.trim()) label = n.trim();
      }
      let suffix = '';
      if (dictionaryByIndex != null && Object.prototype.hasOwnProperty.call(dictionaryByIndex, i)) {
        const ent = dictionaryByIndex[i];
        suffix = ent != null ? ` [dict:${ent.dictionary_id}]` : ' [custom]';
      }
      lines.push(`${i}: ${label}${suffix}`);
    }
    return (
      `\n\n${EXERCISE_INDEX_MAP_HEADER}\n` +
      lines.join('\n') +
      '\n\nUse this index for execution_patch.exerciseIndex (live grid; setIndex is 0-based) and personal_cues_patch[].exerciseIndex (only [dict:...] rows persist).'
    );
  } catch {
    return null;
  }
}
