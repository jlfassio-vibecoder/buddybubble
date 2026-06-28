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
 *   - `readTaskModalOutlineDraftFromMessageMetadata`, `buildOutlineDraftContextBlock`,
 *     `resolveOutlineDraftPromptParts` — outline co-pilot: `task_modal_outline_draft` → system prompt.
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
  WORKOUT_GENERATION_PHASE_INTENT_OPTIONS,
  WORKOUT_INTAKE_SORENESS_OPTIONS,
} from './task-modal-intake-patch.ts';
import { readCoachOutlineMetadata } from './coach-outline-metadata.ts';
import {
  buildOutlineDraftContextBlock,
  buildOutlineDraftContextBlockFromStored,
  readTaskModalOutlineDraftFromMessageMetadata,
} from './build-outline-draft-context.ts';
import { ACTIVE_SESSION_SURFACE_VALUE } from './session-telemetry-format.ts';
import {
  INTERVAL_CIRCUIT_CARDINALITY_PROMPT_BLOCK,
  INTERVAL_TERMINOLOGY_PROMPT_BLOCK,
} from './config.ts';

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

/** Header for pre-session readiness captured on Task Modal preflight before Active Session. */
export const SESSION_READINESS_CONTEXT_HEADER = '--- PRE-SESSION READINESS (member check-in) ---';

/** Validated snapshot from `messages.metadata.session_readiness_context` (v1). */
export type SessionReadinessContextV1 = {
  v: 1;
  captured_at: string;
  readiness: number;
  sleep_quality: number;
  soreness: string[];
  source: 'task_modal_preflight';
};

const SESSION_READINESS_CONTEXT_VERSION = 1 as const;
const SORENESS_SET_READINESS = new Set<string>(
  WORKOUT_INTAKE_SORENESS_OPTIONS as unknown as string[],
);

function clampIntReadiness(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function normalizeSorenessReadiness(raw: string[]): string[] {
  const filtered = raw.map((s) => s.trim()).filter((s) => s && SORENESS_SET_READINESS.has(s));
  const unique = [...new Set(filtered)];
  if (unique.includes('None') && unique.length > 1) {
    return normalizeSorenessReadiness(unique.filter((s) => s !== 'None'));
  }
  if (unique.length === 0) return ['None'];
  return unique.sort();
}

/** Validated snapshot from `messages.metadata.task_modal_live_state` (v1). */
export type TaskModalLiveStateV1 = {
  v: 1;
  item_type: 'workout' | 'workout_log';
  wizard_step?: 1 | 2 | 3;
  readiness?: number;
  sleep_quality?: number;
  /** Display / schema: numeric durations as quoted strings in Coach JSON. */
  duration_minutes?: number | string;
  phase_intent?: string;
  soreness?: string[];
  progression_trend?: string;
  anchor_lift?: { name: string; weight: number; reps: number };
  temporary_limitations?: string;
};

const DURATION_STRING_SET = new Set(
  WORKOUT_INTAKE_DURATION_CHOICES.map((d) => (typeof d === 'number' ? String(d) : d)),
);
const PHASE_INTENT_SET_LIVE = new Set<string>(
  WORKOUT_GENERATION_PHASE_INTENT_OPTIONS as unknown as string[],
);
const SORENESS_SET_LIVE = new Set<string>(WORKOUT_INTAKE_SORENESS_OPTIONS as unknown as string[]);
const PROGRESSION_TREND_SET_LIVE = new Set<string>([
  'Feeling Easy',
  'Appropriately Challenging',
  'Hitting a Plateau',
]);

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
  if (Number.isInteger(ws) && ws >= 1 && ws <= 3) out.wizard_step = ws as 1 | 2 | 3;

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

  const piRaw = o.phase_intent ?? o.phaseIntent;
  if (typeof piRaw === 'string') {
    const t = piRaw.trim();
    if (PHASE_INTENT_SET_LIVE.has(t)) out.phase_intent = t;
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

  const ptRaw = o.progression_trend ?? o.progressionTrend;
  if (typeof ptRaw === 'string') {
    const t = ptRaw.trim();
    if (PROGRESSION_TREND_SET_LIVE.has(t)) out.progression_trend = t;
  }

  const alRaw = o.anchor_lift ?? o.anchorLift;
  if (alRaw != null && typeof alRaw === 'object' && !Array.isArray(alRaw)) {
    const al = alRaw as Record<string, unknown>;
    const name = typeof al.name === 'string' ? al.name.trim() : '';
    const weight =
      typeof al.weight === 'number' && Number.isFinite(al.weight) && al.weight > 0
        ? Math.round(al.weight)
        : null;
    const reps =
      typeof al.reps === 'number' && Number.isFinite(al.reps) && al.reps > 0
        ? Math.round(al.reps)
        : null;
    if (name && weight != null && reps != null) {
      out.anchor_lift = { name, weight, reps };
    }
  }

  const tlRaw = o.temporary_limitations ?? o.temporaryLimitations;
  if (typeof tlRaw === 'string') {
    const t = tlRaw.trim();
    if (t) out.temporary_limitations = t;
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
  if (snapshot.phase_intent !== undefined) {
    lines.push(`phase_intent: ${JSON.stringify(snapshot.phase_intent)}`);
  }
  if (snapshot.soreness !== undefined && snapshot.soreness.length > 0) {
    lines.push(`soreness: ${JSON.stringify(snapshot.soreness)}`);
  }
  if (snapshot.progression_trend !== undefined) {
    lines.push(`progression_trend: ${JSON.stringify(snapshot.progression_trend)}`);
  }
  if (snapshot.anchor_lift !== undefined) {
    lines.push(`anchor_lift: ${JSON.stringify(snapshot.anchor_lift)}`);
  }
  if (snapshot.temporary_limitations !== undefined) {
    lines.push(`temporary_limitations: ${JSON.stringify(snapshot.temporary_limitations)}`);
  }
  return lines.join('\n');
}

/**
 * Reads and validates `metadata.session_readiness_context` from the trigger message.
 * Returns `null` when absent, wrong version, or invalid shape.
 */
export function readSessionReadinessContextFromMessageMetadata(
  meta: unknown,
): SessionReadinessContextV1 | null {
  if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const root = meta as Record<string, unknown>;
  const raw = root.session_readiness_context;
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== SESSION_READINESS_CONTEXT_VERSION) return null;
  if (typeof o.captured_at !== 'string' || !o.captured_at.trim()) return null;
  if (o.source !== 'task_modal_preflight') return null;
  if (typeof o.readiness !== 'number' || !Number.isFinite(o.readiness)) return null;
  if (typeof o.sleep_quality !== 'number' || !Number.isFinite(o.sleep_quality)) return null;
  if (!Array.isArray(o.soreness)) return null;
  if (!o.soreness.every((s) => typeof s === 'string')) return null;

  return {
    v: SESSION_READINESS_CONTEXT_VERSION,
    captured_at: o.captured_at,
    readiness: clampIntReadiness(o.readiness, 1, 10),
    sleep_quality: clampIntReadiness(o.sleep_quality, 1, 10),
    soreness: normalizeSorenessReadiness(o.soreness),
    source: 'task_modal_preflight',
  };
}

/** Deterministic system-prompt block for validated pre-session readiness. */
export function buildSessionReadinessContextBlock(ctx: SessionReadinessContextV1): string {
  const lines: string[] = [
    SESSION_READINESS_CONTEXT_HEADER,
    "The member completed the Task Modal pre-session check-in before starting Active Session. Treat these as ground truth for today's readiness — do NOT re-ask readiness, sleep quality, or soreness sliders.",
    `readiness (1–10): ${ctx.readiness}`,
    `sleep_quality (1–10): ${ctx.sleep_quality}`,
    `soreness: ${JSON.stringify(ctx.soreness)}`,
    `captured_at: ${ctx.captured_at}`,
    `source: ${ctx.source}`,
  ];
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
 * When the member is on a workout or workout_log task, the Task Modal shows an intake
 * wizard (generation macro-planning, then preflight readiness). Appended after CURRENT TASK CONTEXT.
 */
export function buildTaskModalIntakeUiCoachBlock(): string {
  const durationLine = WORKOUT_INTAKE_DURATION_CHOICES.map((d) =>
    d === 'Optimized for Goals' ? '"Optimized for Goals"' : `"${d}"`,
  ).join(', ');
  const phaseIntentLine = WORKOUT_GENERATION_PHASE_INTENT_OPTIONS.map((s) => `"${s}"`).join(', ');
  const sorenessLine = WORKOUT_INTAKE_SORENESS_OPTIONS.map((s) => `"${s}"`).join(', ');
  const progressionLine = '"Feeling Easy", "Appropriately Challenging", "Hitting a Plateau"';
  return (
    `${TASK_MODAL_INTAKE_UI_HEADER}\n` +
    'The Task Modal **Workout intake** wizard has two modes. Use **--- TASK MODAL LIVE STATE (v1) ---** (and whether the card already has a generated workout) to infer which applies.\n\n' +
    '**GENERATION MODE** (before **Generate Workout** — no `ai_workout_factory` on the card yet): **macro planning only** — do **not** ask for or patch readiness/sleep sliders in this mode.\n' +
    `- **phase_intent** (Phase Intent / RPE ceiling): exactly one of: ${phaseIntentLine}.\n` +
    `- **duration_minutes**: string, exactly one of: ${durationLine}.\n` +
    `- **progression_trend** (Progression Trend): exactly one of: ${progressionLine}.\n` +
    '- **anchor_lift** (optional Anchor Lift): object `{ name, weight, reps }` when the member cites a benchmark lift.\n' +
    '- **temporary_limitations** (optional): free-text constraints for this planned session.\n' +
    '- **wizard_step**: optional integer **1–2** for the generation wizard.\n\n' +
    '**PREFLIGHT MODE** (after the workout is generated — pre-session check-in before Active Session): **daily readiness** sliders only — do **not** patch macro-planning fields here.\n' +
    '- **readiness** and **sleep_quality**: integers **1–10** only (slider labels: Readiness / energy, Sleep quality). They are **not** the same as **session_readiness_score** (0–100 routing estimate): never copy session_readiness_score into readiness or sleep_quality. If you tell the user a readiness or sleep slider value in reply_content, you **must** mirror those same 1–10 integers in task_modal_intake_patch.\n' +
    `- **soreness**: string array; each item must be one of: ${sorenessLine}. Use ["None"] when nothing is sore; do not mix "None" with other areas.\n` +
    '- **wizard_step**: optional integer **1–2** for the preflight wizard.\n\n' +
    'Populate or adjust the visible wizard from chat with **task_modal_intake_patch** (JSON object; include only keys you change). The client applies the same object shape from message metadata—do not rely on reply prose alone.\n' +
    'WORKED EXAMPLES (task_modal_intake_patch only — do not confuse with top-level session_readiness_score):\n' +
    '- GOOD (generation): {"phase_intent":"standard_progression","duration_minutes":"45","progression_trend":"Appropriately Challenging"}.\n' +
    '- GOOD (preflight): {"readiness":7,"sleep_quality":8} — both are **1–10** intake sliders.\n' +
    '- GOOD: {"duration_minutes":"30"} — duration_minutes must be a **string** (quoted in JSON), one of "15", "30", "45", "60", or "Optimized for Goals".\n' +
    '- BAD: {"duration_minutes":30} — bare integer is invalid for the schema; use the string "30" instead.\n' +
    '- BAD: {"readiness":72} — 72 looks like **session_readiness_score (0–100)**; use 1–10 for readiness instead (e.g. map high energy to 8–10, not 70+).\n' +
    '- BAD: {"readiness":"feeling great"} — free-text is invalid; use an integer 1–10 (or digit string like "7").\n' +
    '- GOOD: {"soreness":["Legs"]} or {"soreness":["None"]} when nothing is sore (preflight).\n' +
    '- BAD: {"soreness":["None","Legs"]} — never mix **None** with specific areas; drop None or pick only body areas.\n' +
    'Use null / omit task_modal_intake_patch when you are not updating the wizard.'
  );
}

/** Header for main-bubble-only Apex Architect persona (not injected on task rail). */
export const APEX_ARCHITECT_MAIN_CHAT_HEADER = '--- APEX ARCHITECT (main bubble chat) ---';

/**
 * Persona and outline-collaboration contract for main bubble chat (non-rail).
 * Prepended before `buildBaseCoachPrompt` in `CoachStrategy.buildSystemPrompt` when
 * `surface !== standard_task_chat_rail`.
 */
export function buildApexArchitectMainChatBlock(): string {
  return (
    `${APEX_ARCHITECT_MAIN_CHAT_HEADER}\n` +
    'Role & Credentials: Act as "The Apex Architect," a world-renowned human performance expert. You hold a Doctor of Physical Therapy (DPT), a Ph.D. in Exercise Physiology, and the Certified Strength and Conditioning Specialist (CSCS) credential. You possess absolute mastery over biomechanics, cellular metabolism, injury rehabilitation, and elite-level training periodization. ' +
    "Core Directives — Assess Before Prescribing: Always consider potential movement limitations, injury history, and the user's current baseline before recommending a program. " +
    'Science-Grounded Programming: Base all rep ranges, volume landmarks, rest periods, and exercise selections on established clinical literature and sports science (e.g., principles of progressive overload, specific adaptations to imposed demands, and energy system development). ' +
    'The Triad of Performance: Balance every program you write across three pillars: 1) Injury prevention/longevity (DPT), 2) Metabolic/cardiovascular efficiency (Ph.D.), 3) Strength, power, and hypertrophy (CSCS). ' +
    'Communication Style — Authoritative but Accessible: Explain the why behind the what. Use proper anatomical and physiological terminology, but immediately translate it into plain English so the user understands the mechanics. ' +
    'Clinical Precision: Avoid fitness industry buzzwords and bro-science. Speak in terms of motor unit recruitment, load management, leverage, and force production. ' +
    'Adaptable: If a user expresses pain or limited equipment, instantly pivot to corrective exercises, regressions, or biomechanical workarounds. ' +
    'NEVER use sycophantic filler or greeting phrases (e.g., "Great choice!", "Let\'s do this"). ' +
    'MAIN CHAT GOAL: Collaboratively design session structure using this system\'s parametric block catalog tokens (e.g. `:main/emom/alternating`, `:finisher/hiit/classic`, `:main/emom/alternating-combo`) and `#` exercise tags. Reference the --- BLOCK BLUEPRINT LIBRARY --- and any --- BLOCK BLUEPRINT REFS --- on the user message; speak in block_format vocabulary (EMOM, AMRAP, Intervals, preset names) — not vague "HIIT" alone. ' +
    INTERVAL_TERMINOLOGY_PROMPT_BLOCK +
    ' ' +
    INTERVAL_CIRCUIT_CARDINALITY_PROMPT_BLOCK +
    ' ' +
    'Cross-reference --- CURRENT USER CONTEXT --- before asking questions; do not re-ask goals, injuries, or default equipment already on file. Do NOT collect daily readiness in chat — the Task Modal WorkoutIntakePanel handles energy and soreness before Generate Workout. Equipment comes from the member profile and Coach conversation, not the intake wizard. ' +
    'Vocabulary Strictness: Do NOT use the word "Combo" in task_title or task_description unless you specifically want multiple exercises inside the same minute. For standard one-movement-per-minute rotations, use "Alternating EMOM" and `:main/emom/alternating` (not alternating-combo). ' +
    'Do not emit parametric proposed_workout_metadata.blocks on cards without ai_workout_factory.workout_set (parametric_requires_rich_workout_set). ' +
    'FACTORY HANDOFF: You are outlining structure ONLY in the card shell. NEVER ask the user which exercises they want to include. You dictate the physiology; the backend Factory handles specific exercise selection after the member completes intake and clicks Generate Workout. ' +
    'CRITICAL TOKEN CONSTRAINT: On create_card turns, output conversational reply, task_title, concise task_description (max 3 sentences), and brief coach_task_notes with the Generate Workout CTA. Do NOT emit coach_workout_outline or exercise prescriptions in Call A.'
  );
}

const COACH_OUTLINE_NUMERIC_FORMAT_RULE =
  'CRITICAL FORMATTING RULE: When emitting numerical values (seconds, reps, rounds, minutes, weights, or any timing/count in format_params), use clean, compact whole numbers or short strings. NEVER generate infinite repeating decimals, excessive trailing zeros, or padded digit loops (e.g. output 45 or "45", never 45.000000... or 4500000000...). Stop each number immediately after the meaningful digits. ';

export const COACH_OUTLINE_ONLY_SYSTEM_PROMPT =
  'You are an API that outputs a JSON workout outline for an agreed-upon workout card. Output ONLY a JSON object with a "blocks" array — no markdown, no prose. ' +
  COACH_OUTLINE_NUMERIC_FORMAT_RULE +
  INTERVAL_TERMINOLOGY_PROMPT_BLOCK +
  ' ' +
  INTERVAL_CIRCUIT_CARDINALITY_PROMPT_BLOCK +
  ' ' +
  'CRITICAL — STRUCTURAL TOKEN PARITY: Scan the USER MESSAGE for catalog structural tokens matching :<section>/<structure>/<focus> (e.g. :main/tabata/power for 20/10 Tabata, :finisher/hiit/classic for 30/30 Classic HIIT). You MUST emit one separate, distinct block in "blocks" for EVERY such token, in the same order they appear. If the user requests 3 interval blocks, "blocks" MUST contain exactly 3 tabata-format blocks — never merge multiple tokens into one block. Do not omit a requested section because the card title/description summarizes the session as one unit. ' +
  'Use the BLOCK BLUEPRINT LIBRARY for block_format and format_params per block. ALWAYS include interval_preset on tabata blocks. Match each token\'s section in the block name using preset labels (e.g. "Main — Tabata" for 20/10, "Finisher — Classic HIIT" for 30/30). For tabata blocks, emit one exercises: [{ name }] placeholder per circuit station — exercises.length MUST match the user-stated exercise/movement/station count when present. Use short generic names when specific movements are unknown. No coaching prose, sets, reps, or instructions[].';

/** User prompt for Phase B outline-only Vertex call. */
export function buildCoachOutlineOnlyPrompt(
  taskTitle: string,
  taskDescription: string,
  userMessage: string,
  blueprintLibraryPrompt: string,
): string {
  const title = taskTitle.trim() || '(no title)';
  const description = taskDescription.trim() || '(no description)';
  const trigger = userMessage.trim() || '(no user message)';
  return `${blueprintLibraryPrompt}

=== AGREED CARD (TITLE + SUMMARY) ===
Title: ${title}

Description:
${description}

=== USER MESSAGE (STRUCTURAL REQUEST — TOKEN SOURCE OF TRUTH) ===
${trigger}

=== YOUR TASK ===
Output a parametric outline as JSON with a "blocks" array.
CATALOG TOKEN MAPPING (CRITICAL): List every :main/..., :finisher/..., :metcon/..., :warmup/..., :strength/..., :recovery/..., or :prep/... token in the USER MESSAGE. Output one blocks[] entry per token. The card description may summarize the session — still honor every structural token from the USER MESSAGE. blocks.length MUST equal the token count when tokens are present.

Each block: name (short label), block_format, format_params, exercises: [{ name }] only.
INTERVAL CIRCUIT COUNT (CRITICAL): When the USER MESSAGE states N exercises, movements, or stations for an interval (tabata) block, exercises.length MUST equal N — one distinct placeholder per station. format_params.rounds is circuit rounds (passes through the list), not total work intervals. Use generic names (Movement 1, Movement 2, …) when specific names are unknown.
Do NOT include sets, reps, coach_notes, or instructions[].
Use format_params for all timing/structure — never put prescriptions in block name.

HARD RULE: EMOMs with 2+ exercises MUST have is_alternating: true in format_params unless you are explicitly designing a legacy density block (is_alternating: false — every exercise every minute). Do not use the word "combo" or the is_combo flag for standard A-then-B rotations; the server hydrates alternating_stations from is_alternating alone.

CRITICAL FORMATTING RULE: When emitting numerical values (especially seconds, reps, or weights), use clean, whole numbers. NEVER generate infinite repeating decimals or trailing zeros (e.g., output '45', never '45.000000...').

=== OUTPUT FORMAT ===
Return ONLY valid JSON. No markdown. Example:
{"blocks":[{"name":"Main — Tabata","block_format":"tabata","format_params":{"rounds":8,"work_seconds":20,"rest_seconds":10,"interval_preset":"tabata"},"exercises":[{"name":"Kettlebell Swing"}]},{"name":"Finisher — Classic HIIT","block_format":"tabata","format_params":{"rounds":3,"work_seconds":30,"rest_seconds":30,"interval_preset":"classic_hiit"},"exercises":[{"name":"Burpees"},{"name":"Mountain Climbers"},{"name":"Jump Squats"},{"name":"High Knees"}]},{"name":"Finisher — Tabata VO2","block_format":"tabata","format_params":{"rounds":8,"work_seconds":20,"rest_seconds":10,"interval_preset":"tabata"},"exercises":[{"name":"Plank"}]}]}`;
}

/**
 * Composite base Coach prompt. Returns the same string the legacy file builds inline at
 * `bubble-agent-dispatch/index.ts:1548-1573`. The `currentDate` is parameterized so
 * tests can pin a date; production callers pass `new Date().toISOString().split('T')[0]`.
 *
 * When `apexArchitectMainChat` is true (main bubble + Apex block prepended separately),
 * omits conflicting "rich task_description" / verbose coach_task_notes directives —
 * the APEX ARCHITECT CRITICAL TOKEN CONSTRAINT owns those fields on outline turns.
 */
export function buildBaseCoachPrompt(
  currentDate: string,
  options?: { apexArchitectMainChat?: boolean },
): string {
  const apexMain = options?.apexArchitectMainChat === true;
  const createCardTaskDesc = apexMain
    ? 'When create_card is true, provide non-empty task_title and a concise task_description (max 3 sentences per APEX ARCHITECT block). Never leave task_description null or empty when create_card is true. '
    : 'When create_card is true, you must provide non-empty task_title and a rich task_description for the Kanban card body (workout details, structure, equipment, safety). Never leave task_description null or empty when create_card is true. ';
  const createCardCoachNotes = apexMain
    ? "When create_card is true, populate coach_task_notes briefly (readiness + rationale only; see APEX ARCHITECT block). Always end coach_task_notes with this exact call-to-action (verbatim): Complete the Workout Intake 3-step form then click 'Generate Workout' on the card. Use null for coach_task_notes only when create_card is false. "
    : 'When create_card is true, also populate coach_task_notes with a task-scoped coach comment: brief readiness summary, rationale for this prescription, and scaling or regression options. task_description is the executable plan; coach_task_notes are the "why" and how to adjust. Always end coach_task_notes with this exact call-to-action (verbatim): Complete the Workout Intake 3-step form then click \'Generate Workout\' on the card. Use null for coach_task_notes only when create_card is false. ';
  return (
    `The current date is ${currentDate}. Always use this exact date if you need to schedule a workout or include a date in a title. DO NOT use placeholders. ` +
    'CRITICAL ANTI-LOOP: reply_content must be a single concise coaching message. NEVER repeat the same phrase, sentence, note, or placeholder. Do not pad or loop text. ' +
    'CRITICAL: Task titles must be short, clean, and concise (under 100 characters). NEVER repeat the same phrase, sentence, or placeholder in task_title or reply_content. Output the exact title once and stop. ' +
    'Never use emojis in task titles, it causes database crashes. Keep all titles under 100 characters plain text. ' +
    "ROLE: You are 'The Apex Architect,' an elite AI Fitness Coach with a DPT, Ph.D. in Exercise Physiology, and CSCS. You are authoritative, clinical, and direct. NEVER use sycophantic filler or greeting phrases (e.g., 'Great choice!', 'Let's do this'). When a user asks for weight, rep, or RPE recommendations, you MUST calculate and prescribe specific values from their context and feedback. DO NOT ask the user to supply the numbers for you to copy. " +
    'Use LAST WORKOUT CONTEXT when present for progression and recovery context — do not run a daily readiness questionnaire in chat (the Task Modal intake wizard covers today-specific energy and soreness). ' +
    'Check CURRENT USER CONTEXT for goals, schedule, injuries, and default equipment: do not re-ask for data that is clearly already on file. ' +
    'PRE-DRAFT CONFIRMATION (clinical intake state machine): CLINICAL INTAKE PHASE: When the user requests a workout, do NOT immediately draft the card (create_card: false). First, cross-reference their request against the injected CURRENT USER CONTEXT (injuries, goals). Set intake_phase clarifying_session or pre_draft_confirmation while consulting. ' +
    'ASK ELITE QUESTIONS: Ask 1-2 highly specific, biomechanical or programming questions to dial in the session. (e.g., "I see your goal is hypertrophy and you requested an EMOM. To optimize metabolic stress without compromising your L5-S1 herniation, are you comfortable with unsupported unilateral loading today?"). Do not ask generic readiness questions covered by profile or the Task Modal intake wizard. ' +
    'DRAFT TRIGGER: Only set create_card to true and output the task_title and task_description AFTER the user has answered your clinical questions and you have agreed on the physiological intent. Set intake_phase ready_to_prescribe when outputting the card. Populate missing_intake_categories only for information that is dangerously ambiguous and cannot be inferred from CURRENT USER CONTEXT — not for data already on file. ' +
    "On a card with no ai_workout_factory.workout_set yet, you may NOT emit proposed_workout_metadata.blocks with parametric block_format (amrap, emom, tabata, superset, circuit, ladder, chipper, pyramid, contrast, clusters, drop_sets) — those are server-dropped (parametric_requires_rich_workout_set). Use card_action: 'trigger_generation' instead and the client will run the generator. Only populate proposed_workout_metadata when update_existing_task is true AND the user clearly wants a structured revision on an existing card. " +
    createCardTaskDesc +
    createCardCoachNotes +
    'When create_card is false, set task_title, task_description, and coach_task_notes to null. ' +
    'When the server includes CURRENT TASK CONTEXT, the user is discussing that existing task. When the user clearly wants to revise the card, set update_existing_task to true and provide updated_task_title and/or updated_task_description as the FULL revised card text ONLY for title/description-only edits with no proposed_workout_metadata.blocks. When LIVE CO-PILOT MODE applies or you emit proposed_workout_metadata.blocks, set updated_task_description to null, and/or proposed_workout_metadata with structured exercises (name, sets, reps, etc.), workout_type, and/or duration_min. At least one of: non-empty updated title, non-empty updated description, or non-empty proposed_workout_metadata must be present when update_existing_task is true. Prefer update_existing_task over create_card when modifying an existing card (set create_card false). The server resolves the task id — never output a task id. EXCEPTION (live co-pilot rail): when the prompt also contains the LIVE CO-PILOT MODE block AND a --- CURRENT WORKOUT CONTEXT --- block, the workout already exists — emit structured fields immediately as described under LIVE CO-PILOT MODE. ' +
    'Set session_request true when the user wants a workout or session planned for today or soon; false otherwise. The server uses this for turn gating—be honest. ' +
    'Align intake_phase with the clinical intake state machine: clarifying_session or pre_draft_confirmation while asking elite questions; ready_to_prescribe only when create_card is true. Set session_readiness_score from profile or request context when not explicitly stated. ' +
    'LIVE SESSION vs CARD DRAFT: If CURRENT WORKOUT CONTEXT is present and the user wants to adjust the live log (weights, reps, RPE, set done), set execution_patch, keep update_existing_task false, and keep proposed_workout_metadata null. Use update_existing_task and proposed_workout_metadata only when the user explicitly wants a permanent rewrite of the task or card (e.g. restructure the whole program or replace the written workout in the task). ' +
    "EXECUTION PATCH (live player): When CURRENT WORKOUT CONTEXT is present and the user mentions specific equipment (e.g. 'I have 60lb kettlebells') or asks for specific changes to the current workout session (workoutContext JSON under CURRENT WORKOUT CONTEXT), you MUST compute the appropriate weights, reps, RPE, and/or set completion and include them in the execution_patch field. " +
    'Do not only describe numbers in reply_content; you must also provide the JSON execution_patch so the app can update the live grid. You may list multiple sets and multiple exercises in one patch. String fields (weight, reps, rpe) must be pure numeric strings only, with no ranges, units, or extra text (e.g. "60", "8", "7.5"). Set execution_patch to null when you are not changing the live log. ' +
    'PERSONAL CUES: When the user wants instructions, form cues, tips, or injury notes saved for catalog exercises, emit personal_cues_patch (one entry per exerciseIndex from EXERCISE_INDEX_MAP; only [dict:...] rows persist); you may combine it with execution_patch in one response. ' +
    'TASK MODAL INTAKE PATCH: When TASK MODAL INTAKE UI appears in the system prompt (workout / workout_log task under discussion), use task_modal_intake_patch to update the on-card intake wizard. In **generation mode** (no factory yet): phase_intent, duration_minutes, progression_trend, optional anchor_lift / temporary_limitations, wizard_step 1–2 — not readiness/sleep. In **preflight mode** (workout already generated): readiness and sleep sliders 1–10, soreness, wizard_step 1–2 — not macro-planning fields. Do not only describe those values in reply_content when you intend the UI to change—emit task_modal_intake_patch. Set task_modal_intake_patch to null when not updating the wizard. ' +
    'If --- TASK MODAL LIVE STATE (v1) --- appears in the system prompt and you describe changing a wizard field in reply_content, you MUST emit the same change in task_modal_intake_patch in that same JSON. ' +
    'TRUTHFULNESS: If reply_content claims you wrote or applied something, include non-null execution_patch, personal_cues_patch, task_modal_intake_patch, or create_card/update_existing_task in the same JSON. ' +
    (apexMain
      ? 'Return ONLY a raw JSON object (no markdown, no code fences) with keys: reply_content, create_card, task_title, task_description, update_existing_task, updated_task_title, updated_task_description, execution_patch, personal_cues_patch, task_modal_intake_patch, card_action, intake_phase, session_readiness_score, missing_intake_categories, user_requested_immediate_card, session_request, coach_task_notes. Main bubble Call A has NO proposed_workout_metadata key — outline is Phase B server-side. '
      : 'Return ONLY a raw JSON object (no markdown, no code fences) with keys: reply_content, create_card, task_title, task_description, update_existing_task, updated_task_title, updated_task_description, proposed_workout_metadata, execution_patch, personal_cues_patch, task_modal_intake_patch, outline_draft_patch, card_action, intake_phase, session_readiness_score, missing_intake_categories, user_requested_immediate_card, session_request, coach_task_notes. ') +
    'You MUST respond in valid JSON matching the provided schema. Do not output markdown, plain text, or conversational filler outside of the JSON object.'
  );
}

export type WorkoutOpenGreetingPromptArgs = {
  workoutTitle: string;
  isoNow: string;
  userContextBlock?: string | null;
  sessionReadinessBlock?: string | null;
  workoutStructureBlock?: string | null;
  sessionTelemetryBlock?: string | null;
};

export const WORKOUT_STRUCTURE_CONTEXT_HEADER = '--- WORKOUT STRUCTURE ---';

function formatExerciseLineFromContext(exercise: unknown, index: number): string | null {
  if (exercise == null || typeof exercise !== 'object' || Array.isArray(exercise)) return null;
  const e = exercise as Record<string, unknown>;
  const name =
    typeof e.name === 'string' && e.name.trim() ? e.name.trim() : `Exercise ${index + 1}`;
  const parts: string[] = [name];
  if (typeof e.sets === 'number' && Number.isFinite(e.sets)) parts.push(`${e.sets} sets`);
  if (e.reps != null && String(e.reps).trim()) parts.push(`${String(e.reps).trim()} reps`);
  if (e.weight != null && String(e.weight).trim()) parts.push(`${String(e.weight).trim()} load`);
  return parts.join(' — ');
}

/** Build a compact structure block from workoutContext JSON already on the sentinel. */
export function buildWorkoutStructureBlockFromContextJson(workoutJson: string): string | null {
  if (!workoutJson.trim()) return null;
  try {
    const parsed = JSON.parse(workoutJson) as Record<string, unknown>;
    const summary = parsed.workout_structure_summary;
    if (typeof summary === 'string' && summary.trim()) {
      return `${WORKOUT_STRUCTURE_CONTEXT_HEADER}\n${summary.trim()}`;
    }
    const exercises = parsed.exercises;
    if (Array.isArray(exercises) && exercises.length > 0) {
      const lines = exercises
        .slice(0, 24)
        .map((ex, i) => formatExerciseLineFromContext(ex, i))
        .filter((line): line is string => line != null);
      if (lines.length > 0) {
        return `${WORKOUT_STRUCTURE_CONTEXT_HEADER}\n${lines.join('\n')}`;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Build the system prompt for the workout-open silent-greeting preflight call.
 * Mirrors the parts assembly at `bubble-agent-dispatch/index.ts:1486-1501`.
 */
export function buildWorkoutOpenGreetingPrompt(args: WorkoutOpenGreetingPromptArgs): string {
  const hasTelemetry =
    typeof args.sessionTelemetryBlock === 'string' && args.sessionTelemetryBlock.trim().length > 0;
  const hasStructure =
    typeof args.workoutStructureBlock === 'string' && args.workoutStructureBlock.trim().length > 0;

  const parts: string[] = [
    'You are Coach in BuddyBubble. The member just opened the in-app workout player and is about to perform the workout.',
    `Workout title: "${args.workoutTitle}".`,
    'Write exactly ONE short chat message (2–5 sentences) that will appear in the bubble thread.',
    'Start with a natural, personalized time-of-day greeting (infer from the timestamp or use a neutral greeting).',
    'Name the workout and acknowledge they are about to start it.',
    'Do NOT use generic gym clichés such as "Good to see you back in the gym" or "Let\'s get to work" as your opener or main message.',
    hasTelemetry
      ? 'Use SESSION TELEMETRY below when suggesting concrete targets for unfilled sets (ghost/previous performance, logged counts, or planned vs actual hints).'
      : hasStructure
        ? 'SESSION TELEMETRY is sparse or missing — suggest general starting targets from WORKOUT STRUCTURE below (main lifts, rep schemes, block order).'
        : 'Telemetry and structure details are limited — suggest sensible general targets from the workout title and any exercise hints in the JSON user payload.',
    'Offer 1–2 specific target suggestions when you can infer them; keep them practical and brief.',
    'Close with ONE inviting question about whether they want help filling targets, adjusting loads, or dialing in the session.',
    'Do NOT offer to create a Kanban card, draft a card, or run a long intake questionnaire.',
    'Do NOT paste or reference any SYSTEM_EVENT string or technical trigger text.',
    `Reference timestamp (UTC): ${args.isoNow}`,
  ];
  if (args.sessionReadinessBlock) {
    parts.push(
      'The member already completed a pre-session check-in (readiness, sleep, soreness) — see PRE-SESSION READINESS below.',
      'Briefly acknowledge their today readiness, sleep, and soreness in natural language.',
      'Do NOT ask them to rate readiness, sleep quality, or soreness again — no intake sliders or questionnaire.',
      args.sessionReadinessBlock,
    );
  }
  if (hasStructure) {
    parts.push(args.workoutStructureBlock?.trim() ?? '');
  }
  if (hasTelemetry) {
    parts.push(args.sessionTelemetryBlock?.trim() ?? '');
  }
  if (args.userContextBlock) {
    parts.push('--- USER CONTEXT ---\n' + args.userContextBlock);
  }
  return parts.join('\n\n');
}

/**
 * Single user-turn text passed to the workout-open preflight call. Mirrors the legacy
 * line at `bubble-agent-dispatch/index.ts:1502`.
 */
export function buildWorkoutOpenGreetingUserText(
  workoutJson: string,
  readinessJson?: string | null,
): string {
  const lines = [`Structured workout data (JSON; may be truncated):\n${workoutJson || '{}'}`];
  if (readinessJson && readinessJson.trim()) {
    lines.push(`Pre-session readiness check-in (JSON):\n${readinessJson}`);
  }
  return lines.join('\n\n');
}

/**
 * CURRENT TASK CONTEXT block prepended to the system prompt when the dispatcher
 * resolved a task under discussion. Mirrors the inline composition at
 * `bubble-agent-dispatch/index.ts:1621-1625`.
 */
export function buildCurrentTaskContextBlock(
  title: string,
  description: string | null,
  opts?: { rail?: boolean; outlineStructure?: boolean },
): string {
  const desc =
    typeof description === 'string' && description.trim()
      ? description.trim()
      : '(empty description)';
  const outlineStructure = opts?.outlineStructure === true;
  const isRail = !outlineStructure && opts?.rail === true;
  const tail = outlineStructure
    ? 'OUTLINE STRUCTURE CO-PILOT (Builder / Task Modal rail). The member is editing workout **structure** (block names, block_format, format_params) before Confirm structure and before a rich ai_workout_factory workout exists on the card. Treat --- CURRENT OUTLINE DRAFT --- as the only ground truth for block names and format_params — do not invent blocks. Do NOT use LIVE CO-PILOT MODE, proposed_workout_metadata, or --- CURRENT WORKOUT CONTEXT --- for structure in this phase. Set updated_task_description to null. When changing structure, emit outline_draft_patch (merge_by_name, matching revision, changed blocks only) — not prose-only block lists in reply_content alone.'
    : isRail
      ? 'STRUCTURAL EDITS (blocks): Set updated_task_description to null. Never narrate work_seconds, rest_seconds, or rounds in description — use format_params on each block only. LIVE CO-PILOT MODE (Task Modal rail). You are actively co-editing this task with the user. Treat any --- CURRENT WORKOUT CONTEXT --- block below as the user\'s existing, approved workout — they generated it on the card themselves. When they ask for additions, swaps, or rewrites (e.g. "add a finisher", "make block 3 heavier", "swap squats for hinges", "four exercises per interval block"): Set update_existing_task: true. For interval (tabata) blocks, emit N distinct exercises[] entries when the user requests N movements — format_params.rounds is circuit rounds; never collapse multiple stations into one compound exercise name. Server merge replaces exerciseBlocks by matching block name (case-insensitive) — same name updates exercises and format_params in place; a new section name appends. Emit proposed_workout_metadata.blocks with every affected block using the exact same name values as CURRENT WORKOUT CONTEXT. Do not re-emit unchanged blocks or duplicate the workout in updated_task_description prose. For additive named sections (e.g. "add a finisher", "add a core finisher", "rewrite the warm-up", "add a mobility cool-down"), emit proposed_workout_metadata.blocks with only the new or changed block(s) — each item has name (free text like "Warm-up", "Main", "Strength A", "Finisher", "Cool down", "Mobility") plus either exercises (sets/reps) or instructions (one short line per item). Never put sets, reps, section lists, or block prescriptions in updated_task_description; use proposed_workout_metadata (blocks or exercises) for structural edits. Use blocks whenever section identity matters; reserve top-level proposed_workout_metadata.exercises for appending or replacing items inside an existing single Main block only. When emitting proposed_workout_metadata.blocks, every exercise-shaped block MUST include block_format + format_params per BLUEPRINT LIBRARY (e.g. a Finisher AMRAP uses block_format: amrap with format_params); instruction-only warm-up / cool-down blocks are exempt. Title / description text-only edits continue to use updated_task_title / updated_task_description with no proposed_workout_metadata — that path persists immediately via direct-update RPC. Do NOT open a new consent turn when the workout already exists on the card. Confirm what you did in reply_content only when update_existing_task is true AND proposed_workout_metadata.blocks is non-empty — the structured fields are the writes. When --- BLOCK_BLUEPRINT_REFS --- appears in the system prompt, honor each token for proposed_workout_metadata.blocks[] and combine with # exercise tags in the same user message. GENERATION HAND-OFF (critical, additive to LIVE CO-PILOT MODE): If the user gives clear consent to draft / generate / build the full workout (e.g. "draft the outline", "generate it", "put it together") AND the card has NO ai_workout_factory.workout_set yet (CURRENT WORKOUT CONTEXT is absent) AND there is no active workout session, you MUST emit card_action: \'trigger_generation\' and leave proposed_workout_metadata null and update_existing_task false. Use a brief reply_content such as "Starting the generator now — give me about a minute and the workout will appear on your card." Do NOT attempt to write the full structured workout yourself in this turn — the client will run the long-running generator. For incremental edits to a workout that already exists on the card (block_format / format_params blocks, swaps, finishers, etc.), continue using proposed_workout_metadata via the LIVE CO-PILOT MODE path.'
      : 'PRE-DRAFT CONFIRMATION: Do not populate proposed_workout_metadata until the user has given clear affirmative consent to draft or revise this card (or user_requested_immediate_card). On a confirmation-only turn, set update_existing_task to false and proposed_workout_metadata to null. When they confirm, set update_existing_task to true and provide updated_task_title and/or updated_task_description. Provide a short revised description (max 3 sentences). If you are emitting proposed_workout_metadata.blocks, updated_task_description MUST be null. Never narrate sets, reps, or timing in the description. And/or proposed_workout_metadata with structured exercises (and workout_type, duration_min as appropriate). The user must finalize changes on the card — do not assume the database updates immediately.';
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

function parseLiveSetCountsFromContext(parsed: unknown, exerciseCount: number): number[] | null {
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const raw = (parsed as Record<string, unknown>).live_set_counts;
  if (!Array.isArray(raw) || raw.length !== exerciseCount) return null;
  const counts: number[] = [];
  for (const n of raw) {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return null;
    counts.push(n);
  }
  return counts;
}

type EmomAlternatingGuideParsed = Array<{
  block_name?: unknown;
  cycle_taxonomy?: unknown;
  exercises?: unknown;
}>;

function parseEmomAlternatingGuideFromContext(parsed: unknown): EmomAlternatingGuideParsed | null {
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const raw = (parsed as Record<string, unknown>).emom_alternating_guide;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw as EmomAlternatingGuideParsed;
}

/** Renders deterministic minute → setIndex table for alternating EMOM blocks. */
export function formatEmomAlternatingGuideBlock(parsed: unknown): string | null {
  const guide = parseEmomAlternatingGuideFromContext(parsed);
  if (!guide) return null;

  const lines: string[] = ['[Alternating EMOM Guide]'];

  for (const block of guide) {
    if (block == null || typeof block !== 'object' || Array.isArray(block)) continue;
    const blockName =
      typeof block.block_name === 'string' && block.block_name.trim()
        ? block.block_name.trim()
        : 'Main';
    const taxonomy =
      typeof block.cycle_taxonomy === 'string' && block.cycle_taxonomy.trim()
        ? block.cycle_taxonomy.trim()
        : '';
    const header = taxonomy ? `Block "${blockName}" (${taxonomy}):` : `Block "${blockName}":`;
    lines.push(header);

    const exercises = block.exercises;
    if (!Array.isArray(exercises)) continue;

    for (const ex of exercises) {
      if (ex == null || typeof ex !== 'object' || Array.isArray(ex)) continue;
      const o = ex as Record<string, unknown>;
      const exerciseIndex = o.exerciseIndex;
      const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : '(unnamed)';
      const globalMinutes = o.global_minutes;
      const setIndices = o.set_indices;
      if (
        typeof exerciseIndex !== 'number' ||
        !Number.isInteger(exerciseIndex) ||
        exerciseIndex < 0
      ) {
        continue;
      }
      if (!Array.isArray(globalMinutes) || !Array.isArray(setIndices)) continue;
      if (globalMinutes.length === 0 || globalMinutes.length !== setIndices.length) continue;

      const minuteList = globalMinutes
        .filter((m) => typeof m === 'number' && Number.isInteger(m) && m >= 0)
        .join(', ');
      const setList = setIndices
        .filter((s) => typeof s === 'number' && Number.isInteger(s) && s >= 0)
        .join(', ');
      if (!minuteList || !setList) continue;

      lines.push(`${exerciseIndex}: ${name} — active minutes ${minuteList} → setIndex ${setList}`);
    }
  }

  if (lines.length <= 1) return null;

  lines.push(
    '*CRITICAL: Never use the global minute as setIndex for Alternating EMOMs. Use the mapped setIndex above.*',
  );
  return `\n\n${lines.join('\n')}`;
}

/**
 * Builds a deterministic exerciseIndex roster from stringified workout context JSON.
 * Returns null when JSON is invalid, truncated, or has no `exercises` array.
 * When `dictionaryByIndex` is provided, each line is suffixed with [dict:uuid] or [custom].
 * When `live_set_counts` aligns with `exercises`, each line includes `(N log rows)` and a bounds footer.
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
    let liveSetCounts: number[] | null = null;
    if (Array.isArray(parsed)) {
      ex = parsed;
    } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const raw = (parsed as Record<string, unknown>).exercises;
      ex = Array.isArray(raw) ? raw : [];
      liveSetCounts = parseLiveSetCountsFromContext(parsed, ex.length);
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
      const rowCountSuffix = liveSetCounts != null ? ` (${liveSetCounts[i]} log rows)` : '';
      let dictSuffix = '';
      if (dictionaryByIndex != null && Object.prototype.hasOwnProperty.call(dictionaryByIndex, i)) {
        const ent = dictionaryByIndex[i];
        dictSuffix = ent != null ? ` [dict:${ent.dictionary_id}]` : ' [custom]';
      }
      lines.push(`${i}: ${label}${rowCountSuffix}${dictSuffix}`);
    }
    const baseFooter =
      'Use this index for execution_patch.exerciseIndex (live grid; setIndex is 0-based) and personal_cues_patch[].exerciseIndex (only [dict:...] rows persist).';
    const boundsFooter =
      liveSetCounts != null ? ' setIndex must be 0 .. live_set_counts[exerciseIndex] - 1.' : '';
    const parsedRoot = Array.isArray(parsed)
      ? null
      : parsed && typeof parsed === 'object'
        ? parsed
        : null;
    const emomGuideBlock = parsedRoot != null ? formatEmomAlternatingGuideBlock(parsedRoot) : null;
    return (
      `\n\n${EXERCISE_INDEX_MAP_HEADER}\n` +
      lines.join('\n') +
      `\n\n${baseFooter}${boundsFooter}` +
      (emomGuideBlock ?? '')
    );
  } catch {
    return null;
  }
}

/** Header for outline structure co-pilot (pre-factory, pre-confirm). */
export const OUTLINE_CO_PILOT_MODE_HEADER = '--- OUTLINE CO-PILOT MODE ---';

const OUTLINE_DRAFT_PATCH_ROUTING_EXAMPLES =
  '\n--- OUTLINE DRAFT PATCH ROUTING EXAMPLES ---\n' +
  'GOOD (user: add 15-minute AMRAP main with 4 exercises):\n' +
  'outline_draft_patch: { "revision": <from CURRENT OUTLINE DRAFT>, "mode": "merge_by_name", "blocks": [{ "name": "Main AMRAP", "block_format": "amrap", "format_params": { "time_cap_minutes": 15 }, "exercises": [{ "name": "Station 1" }, { "name": "Station 2" }, { "name": "Station 3" }, { "name": "Station 4" }] }] }\n' +
  'BAD (forbidden — timing and counts in name):\n' +
  '"name": "Main Circuit 1 (AMRAP 15 min.) - 4 Exercises Each Block..."\n' +
  'Put member constraints only in format_params and exercises[]; reply_content may explain, but JSON name must stay short.\n';

/**
 * System-prompt contract when the member is editing workout structure only (outline phase).
 */
export function buildOutlineCoPilotModeCoachBlock(): string {
  return (
    `${OUTLINE_CO_PILOT_MODE_HEADER}\n` +
    'OUTLINE CO-PILOT MODE: The member is authoring **workout structure** (block names, block_format, format_params) before intake and before the AI workout factory runs. ' +
    'Your job is to collaborate on structure — not to generate full exercise prescriptions, sets/reps tables, or ai_workout_factory output in this turn. ' +
    'Do NOT emit proposed_workout_metadata on the task rail (no rich factory on this card yet). Do NOT emit coach_workout_outline in Call A JSON (outline is server-side Phase B or client draft sync). ' +
    'Use surgical, specific language referencing block names and format_params from --- CURRENT OUTLINE DRAFT --- when present. ' +
    'Encourage catalog structural tokens in chat (e.g. :main/emom/alternating, :finisher/hiit/classic, :main/tabata/power for strict 20/10 Tabata only) matching the BLOCK BLUEPRINT LIBRARY. ' +
    INTERVAL_TERMINOLOGY_PROMPT_BLOCK +
    ' ' +
    INTERVAL_CIRCUIT_CARDINALITY_PROMPT_BLOCK +
    ' ' +
    'This mode is distinct from LIVE CO-PILOT (rich workoutContext / factory blocks) and from TASK MODAL INTAKE (task_modal_intake_patch sliders). ' +
    'For structural edits (add/rename/reorder blocks, change block_format or format_params), emit outline_draft_patch with mode merge_by_name and only the changed or new blocks by name. ' +
    'outline_draft_patch.revision MUST equal the revision integer from --- CURRENT OUTLINE DRAFT ---. Set proposed_workout_metadata to null. ' +
    'Use replace_all only when replacing the entire outline. Omit outline_draft_patch when you are only answering questions without changing structure. ' +
    "CRITICAL FORMATTING RULE: When generating block names, keep them under 5 words. Do not put workout descriptions, constraints, or instructions inside the 'name' field. " +
    OUTLINE_DRAFT_PATCH_ROUTING_EXAMPLES
  );
}

export type ResolveOutlineDraftPromptPartsArgs = {
  taskItemType: string | null;
  taskMetadataForContext: unknown | null;
  messageMetadata: unknown;
  taskTitle?: string | null;
};

function resolveTaskItemTypeForOutlineCoPilot(
  taskItemType: string | null,
  taskMetadataForContext: unknown | null,
): string | null {
  const it = (taskItemType ?? '').trim().toLowerCase();
  if (it === 'workout') return 'workout';
  if (it) return it;
  const outlineMeta = readCoachOutlineMetadata(taskMetadataForContext);
  if (outlineMeta.outline?.length || outlineMeta.status !== 'empty') return 'workout';
  return taskItemType;
}

export function resolveOutlineDraftPromptParts(args: ResolveOutlineDraftPromptPartsArgs): {
  coPilotBlock: string | null;
  draftBlock: string | null;
} {
  const it = (
    resolveTaskItemTypeForOutlineCoPilot(args.taskItemType, args.taskMetadataForContext) ?? ''
  )
    .trim()
    .toLowerCase();
  if (it !== 'workout') return { coPilotBlock: null, draftBlock: null };

  const outlineMeta = readCoachOutlineMetadata(args.taskMetadataForContext);
  if (outlineMeta.hasFactory || outlineMeta.confirmedAt) {
    return { coPilotBlock: null, draftBlock: null };
  }

  const coPilotBlock = buildOutlineCoPilotModeCoachBlock();
  const fromMessage = readTaskModalOutlineDraftFromMessageMetadata(args.messageMetadata);
  let draftBlock: string | null = null;
  if (fromMessage) {
    draftBlock = buildOutlineDraftContextBlock(fromMessage, args.taskTitle);
  } else if (outlineMeta.outline?.length) {
    draftBlock = buildOutlineDraftContextBlockFromStored({
      outline: outlineMeta.outline,
      status: outlineMeta.status,
      revision: 0,
      title: args.taskTitle,
    });
  }
  return { coPilotBlock, draftBlock };
}

/** When true, suppress TASK MODAL INTAKE UI blocks in favor of outline co-pilot. */
export function shouldSuppressTaskModalIntakeForOutlineCoPilot(
  args: ResolveOutlineDraftPromptPartsArgs,
): boolean {
  const { coPilotBlock } = resolveOutlineDraftPromptParts(args);
  return coPilotBlock != null;
}

/** When true, suppress TASK MODAL INTAKE UI because preflight readiness was captured on Active Session. */
export function shouldSuppressTaskModalIntakeForPreflightReadiness(meta: unknown): boolean {
  const readiness = readSessionReadinessContextFromMessageMetadata(meta);
  if (!readiness) return false;
  if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) return false;
  const wctx = (meta as Record<string, unknown>).workout_context;
  if (wctx == null || typeof wctx !== 'object' || Array.isArray(wctx)) return false;
  return (wctx as Record<string, unknown>).surface === ACTIVE_SESSION_SURFACE_VALUE;
}
