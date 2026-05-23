/**
 * Coach response parser — pure module, canonical source.
 *
 * Lifts every parse helper from the legacy Coach implementation verbatim:
 *
 *   - `coalesceTaskDescription`               — index.ts:317-334
 *   - `parseProposedWorkoutMetadata`          — index.ts:338-367
 *   - `coalesceUpdatedTaskDescription`        — index.ts:369-385
 *   - `stripMarkdownCodeFences`               — index.ts:443-453
 *   - `parseIntakePhase`                      — index.ts:455-459
 *   - `parseSessionReadinessScore`            — index.ts:461-464
 *   - `parseMissingIntakeCategories`          — index.ts:466-476
 *   - `parseUserRequestedImmediateCard`       — index.ts:478-480
 *   - `parseSessionRequest`                   — index.ts:482-484
 *   - `parseCoachTaskNotes`                   — index.ts:486-492
 *   - `ensureCoachTaskNotesCta`               — index.ts:220-228
 *   - `sanitizeNumericString`                 — delegates to `execution-patch-numeric.ts`
 *   - `parseExecutionPatchFromGemini`         — index.ts:506-554
 *   - `parseCoachJson` (was `parseGeminiJsonText`) — index.ts:556-648
 *   - `executionPatchForRpc`                  — index.ts:650-653
 *
 * One delta vs the legacy implementation: `parseCoachJson` accepts a JSON-mode response
 * `text` string (the dispatcher does the candidate-text extraction upstream via
 * `_shared/llm/vertex-gemini.extractGeminiText`). Throws `Error('gemini_json_parse_failed')`
 * or `Error('gemini_invalid_json_shape')` to match the legacy contract; the dispatcher
 * catches and classifies these via `_shared/llm/vertex-gemini.classifyError`.
 *
 * A byte-for-byte mirror lives at `supabase/functions/agents/coach/parse.ts`. Run
 * `pnpm check:agent-mirror` to verify parity.
 *
 * Pure module: only depends on `./config`. No DB, no Deno globals, no logging.
 */

import {
  type BlockFormat,
  type BlockShapeDrop,
  isBlockFormat,
  mapLegacyTypeToBlockFormat,
  hydrateEmomAlternatingStations,
  normalizeFormatParams,
  validateBlockShape,
} from './block-blueprint-library';
import {
  COACH_TASK_NOTES_MAX_CHARS,
  COACH_TASK_SEED_CTA,
  INTAKE_CATEGORIES,
  INTAKE_PHASES,
  PERSONAL_CUES_FIELD_MAX_CHARS,
  type IntakeCategory,
  type IntakePhase,
} from './config';

export type { BlockShapeDrop } from './block-blueprint-library';
import type { ExerciseDictionaryIndexEntry } from './prompts';
import {
  coerceExecutionPatchNumericField,
  sanitizeNumericStringForPatch,
} from './execution-patch-numeric';
import {
  parseAndCollectTaskModalIntakePatchFromGemini,
  taskModalIntakePatchForRpc,
  type TaskModalIntakePatch,
  type TaskModalIntakePatchDrop,
} from './task-modal-intake-patch';

/**
 * Normalized Coach response shape. Lifted verbatim from
 * `bubble-agent-dispatch/index.ts:279-311`.
 */
export type CoachGeminiJsonResponse = {
  reply_content: string;
  create_card: boolean;
  task_title: string | null;
  task_description: string | null;
  /** When true with server-resolved task id, updates that task instead of creating a new card. */
  update_existing_task: boolean;
  updated_task_title: string | null;
  updated_task_description: string | null;
  intake_phase: IntakePhase;
  /** 0–100; 0 means unknown / not provided when the model omits or sends invalid data. */
  session_readiness_score: number;
  missing_intake_categories: IntakeCategory[];
  user_requested_immediate_card: boolean;
  /** Model: user wants a concrete workout / session soon (Layer B turn gate). */
  session_request: boolean;
  /** When create_card, optional body for task comment seed (null otherwise). */
  coach_task_notes: string | null;
  /** When update_existing_task: structured fields merged into tasks.metadata on finalize (exercises, workout_type, duration_min). */
  proposed_workout_metadata: Record<string, unknown> | null;
  /** Blocks dropped during parseProposedWorkoutMetadata (unknown format or invalid shape). */
  proposed_workout_metadata_drops: BlockShapeDrop[];
  /**
   * Apex Architect main chat: agreed parametric outline before factory generation.
   * Persisted to `tasks.metadata.coach_workout_outline` (not proposed_workout_metadata).
   */
  coach_workout_outline: Record<string, unknown>[] | null;
  coach_workout_outline_drops: BlockShapeDrop[];
  /**
   * Optional: live `WorkoutPlayer` grid updates (0-based indices vs CURRENT WORKOUT CONTEXT / workoutContext).
   * Persisted on the agent `messages` row for the client. Null/omit when not updating the live session.
   */
  execution_patch: Array<{
    exerciseIndex: number;
    setIndex: number;
    weight?: string;
    reps?: string;
    rpe?: string;
    done?: boolean;
  }> | null;
  /**
   * Resolved personal cues for RPC (`exercise_dictionary_id`); null when nothing to persist.
   */
  personal_cues_resolved: PersonalCueResolvedForRpc[] | null;
  /** Count of patch entries dropped because the exercise index had no catalog match. */
  personal_cues_dropped_unanchored: number;
  /**
   * Optional: Task Modal workout intake wizard (1–10 sliders, steps, duration, etc.).
   * Persisted on the agent reply `messages.metadata` for the client — does not write `tasks` rows.
   */
  task_modal_intake_patch: TaskModalIntakePatch | null;
  /** Parser telemetry: fields dropped or clamped while normalizing `task_modal_intake_patch`. */
  task_modal_intake_dropped: TaskModalIntakePatchDrop[];
  /** Optional UI command. Phase 12.1 only enum: 'trigger_generation'. */
  card_action: 'trigger_generation' | null;
};

/** Payload for `p_personal_cues` on agent RPCs (matches `apply_personal_cues_for_user`). */
export type PersonalCueResolvedForRpc = {
  exercise_dictionary_id: string;
  mode: 'append' | 'replace';
  instructions?: string;
  form_cues?: string;
  tips?: string;
  injury_prevention_tips?: string;
};

/**
 * Gemini may omit optional schema keys, use alternate keys, or return string[].
 * This value is stored on `tasks.description` via `p_task_description`.
 */
export function coalesceTaskDescription(parsed: Record<string, unknown>): string | null {
  const candidates: unknown[] = [
    parsed.task_description,
    parsed.description,
    (parsed as { taskDescription?: unknown }).taskDescription,
  ];
  for (const raw of candidates) {
    if (typeof raw === 'string') {
      const t = raw.trim();
      if (t.length > 0) return t;
    }
    if (Array.isArray(raw) && raw.length > 0 && raw.every((x) => typeof x === 'string')) {
      const t = raw.join('\n').trim();
      if (t.length > 0) return t;
    }
  }
  return null;
}

/** Normalizes a Gemini `exercises[]` array for proposed workout metadata. */
function normalizeExercisesFromGeminiArray(raw: unknown): Record<string, unknown>[] {
  const exercises: Record<string, unknown>[] = [];
  if (!Array.isArray(raw)) return exercises;
  for (const ex of raw) {
    if (!ex || typeof ex !== 'object' || Array.isArray(ex)) continue;
    const e = ex as Record<string, unknown>;
    const name = typeof e.name === 'string' ? e.name.trim() : '';
    if (!name) continue;
    const row: Record<string, unknown> = { name };
    if (typeof e.sets === 'number' && e.sets > 0) row.sets = Math.round(e.sets);
    if (e.reps != null) row.reps = e.reps;
    if (typeof e.coach_notes === 'string' && e.coach_notes.trim())
      row.coach_notes = e.coach_notes.trim();
    if (typeof e.equipment === 'string' && e.equipment.trim()) row.equipment = e.equipment.trim();
    if (
      typeof e.work_seconds === 'number' &&
      Number.isFinite(e.work_seconds) &&
      e.work_seconds > 0
    ) {
      row.work_seconds = Math.round(e.work_seconds);
    }
    if (
      typeof e.rest_seconds === 'number' &&
      Number.isFinite(e.rest_seconds) &&
      e.rest_seconds >= 0
    ) {
      row.rest_seconds = Math.round(e.rest_seconds);
    }
    exercises.push(row);
  }
  return exercises;
}

function resolveBlockFormat(blk: Record<string, unknown>): BlockFormat | 'unknown' {
  const rawFormat = blk.block_format;
  if (isBlockFormat(rawFormat)) return rawFormat;
  if (rawFormat != null && String(rawFormat).trim().length > 0) {
    const legacy = mapLegacyTypeToBlockFormat(blk.type);
    return legacy ?? 'unknown';
  }
  return mapLegacyTypeToBlockFormat(blk.type) ?? 'straight_sets';
}

function instructionLinesFromBlock(blk: Record<string, unknown>): string[] {
  if (!Array.isArray(blk.instructions)) return [];
  return blk.instructions
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Normalizes a Gemini blocks array with validation (shared by proposed metadata and coach outline). */
function normalizeBlocksFromGeminiArray(
  blocksRaw: unknown,
  fieldPrefix: string,
): { blocks: Record<string, unknown>[]; drops: BlockShapeDrop[] } {
  const drops: BlockShapeDrop[] = [];
  const blocks: Record<string, unknown>[] = [];
  if (!Array.isArray(blocksRaw)) return { blocks, drops };

  for (let i = 0; i < blocksRaw.length; i++) {
    const b = blocksRaw[i];
    if (!b || typeof b !== 'object' || Array.isArray(b)) continue;
    const blk = b as Record<string, unknown>;
    const inner = normalizeExercisesFromGeminiArray(blk.exercises);
    const instructions = instructionLinesFromBlock(blk);
    const instructionOnly = instructions.length > 0 && inner.length === 0;

    if (instructionOnly) {
      const row: Record<string, unknown> = {};
      if (typeof blk.name === 'string' && blk.name.trim()) row.name = blk.name.trim();
      row.instructions = instructions;
      if (Object.keys(row).length > 0) blocks.push(row);
      continue;
    }

    const blockName = typeof blk.name === 'string' ? blk.name.trim() : '';
    if (inner.length === 0 && !blockName) continue;

    const resolved = resolveBlockFormat(blk);
    if (resolved === 'unknown') {
      drops.push({ field: `${fieldPrefix}[${i}]`, reason: 'unknown_block_format' });
      continue;
    }
    const blockFormat = resolved;
    let formatParams = normalizeFormatParams(blockFormat, blk.format_params);
    if (blockFormat === 'emom') {
      formatParams = hydrateEmomAlternatingStations(inner.length, formatParams);
    }
    const shapeReason = validateBlockShape(blockFormat, inner.length, formatParams);
    if (shapeReason != null) {
      drops.push({ field: `${fieldPrefix}[${i}]`, reason: shapeReason });
      continue;
    }

    const row: Record<string, unknown> = { block_format: blockFormat };
    if (blockName) row.name = blockName;
    if (
      typeof blk.duration_min === 'number' &&
      Number.isFinite(blk.duration_min) &&
      blk.duration_min > 0
    ) {
      row.duration_min = Math.round(blk.duration_min);
    }
    if (typeof blk.coach_notes === 'string' && blk.coach_notes.trim()) {
      row.coach_notes = blk.coach_notes.trim();
    }
    if (Object.keys(formatParams).length > 0) row.format_params = formatParams;
    if (inner.length > 0) row.exercises = inner;
    if (instructions.length > 0) row.instructions = instructions;
    if (Object.keys(row).length > 0) blocks.push(row);
  }
  return { blocks, drops };
}

/** Normalizes Gemini `coach_workout_outline` (Apex Architect pre-factory; parametric allowed). */
export function parseCoachWorkoutOutlineWithDrops(parsed: Record<string, unknown>): {
  outline: Record<string, unknown>[] | null;
  drops: BlockShapeDrop[];
} {
  const raw = parsed.coach_workout_outline ?? parsed['coach_workout_outline'];
  if (raw == null) return { outline: null, drops: [] };
  if (!Array.isArray(raw)) return { outline: null, drops: [] };
  const { blocks, drops } = normalizeBlocksFromGeminiArray(raw, 'coach_workout_outline');
  return { outline: blocks.length > 0 ? blocks : null, drops };
}

/** Parses Phase B outline-only Vertex JSON (`{ blocks: [...] }`). */
export function parseCoachOutlineOnlyBlocksFromText(text: string): {
  outline: Record<string, unknown>[] | null;
  drops: BlockShapeDrop[];
} {
  const cleanText = stripMarkdownCodeFences(text);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleanText) as Record<string, unknown>;
  } catch {
    return { outline: null, drops: [{ field: 'blocks', reason: 'json_parse_failed' }] };
  }
  const raw = parsed.blocks ?? parsed['blocks'];
  if (!Array.isArray(raw)) {
    return { outline: null, drops: [{ field: 'blocks', reason: 'missing_blocks' }] };
  }
  return parseCoachWorkoutOutlineWithDrops({ coach_workout_outline: raw });
}

/** Normalizes Gemini `proposed_workout_metadata` with block-level drop telemetry. */
export function parseProposedWorkoutMetadataWithDrops(parsed: Record<string, unknown>): {
  meta: Record<string, unknown>;
  drops: BlockShapeDrop[];
} {
  const drops: BlockShapeDrop[] = [];
  const raw = parsed.proposed_workout_metadata ?? parsed['proposed_workout_metadata'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { meta: {}, drops };
  }
  const o = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof o.workout_type === 'string' && o.workout_type.trim()) {
    out.workout_type = o.workout_type.trim();
  }
  if (typeof o.duration_min === 'number' && Number.isFinite(o.duration_min) && o.duration_min > 0) {
    out.duration_min = Math.round(o.duration_min);
  }
  const topExercises = normalizeExercisesFromGeminiArray(o.exercises);
  if (topExercises.length > 0) out.exercises = topExercises;

  if (Array.isArray(o.blocks)) {
    const blockCollect = normalizeBlocksFromGeminiArray(o.blocks, 'blocks');
    drops.push(...blockCollect.drops);
    if (blockCollect.blocks.length > 0) out.blocks = blockCollect.blocks;
  }
  return { meta: out, drops };
}

/** Normalizes Gemini `proposed_workout_metadata` for `tasks.metadata` merge on finalize. */
export function parseProposedWorkoutMetadata(
  parsed: Record<string, unknown>,
): Record<string, unknown> {
  return parseProposedWorkoutMetadataWithDrops(parsed).meta;
}

/** Card body for update-existing-task flow (Gemini may use alternate keys). */
export function coalesceUpdatedTaskDescription(parsed: Record<string, unknown>): string | null {
  const candidates: unknown[] = [
    parsed.updated_task_description,
    (parsed as { updatedTaskDescription?: unknown }).updatedTaskDescription,
  ];
  for (const raw of candidates) {
    if (typeof raw === 'string') {
      const t = raw.trim();
      if (t.length > 0) return t;
    }
    if (Array.isArray(raw) && raw.length > 0 && raw.every((x) => typeof x === 'string')) {
      const t = raw.join('\n').trim();
      if (t.length > 0) return t;
    }
  }
  return null;
}

/** Strips optional ``` / ```json fences if the model wraps JSON in Markdown. */
export function stripMarkdownCodeFences(raw: string): string {
  let t = raw.trim();
  const fullFence = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/i;
  const m = t.match(fullFence);
  if (m) return m[1].trim();
  if (/^```(?:json)?\s*\r?\n?/i.test(t)) {
    t = t.replace(/^```(?:json)?\s*\r?\n?/i, '');
    t = t.replace(/\r?\n?```\s*$/, '');
  }
  return t.trim();
}

export function parseIntakePhase(raw: unknown): IntakePhase {
  if (typeof raw !== 'string') return 'other';
  const t = raw.trim() as IntakePhase;
  return (INTAKE_PHASES as readonly string[]).includes(t) ? t : 'other';
}

export function parseSessionReadinessScore(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function parseMissingIntakeCategories(raw: unknown): IntakeCategory[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(INTAKE_CATEGORIES as readonly string[]);
  const out: IntakeCategory[] = [];
  for (const x of raw) {
    if (typeof x === 'string' && allowed.has(x)) {
      out.push(x as IntakeCategory);
    }
  }
  return out;
}

export function parseUserRequestedImmediateCard(raw: unknown): boolean {
  return raw === true;
}

export function parseSessionRequest(raw: unknown): boolean {
  return raw === true;
}

export function parseCoachTaskNotes(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  if (t.length <= COACH_TASK_NOTES_MAX_CHARS) return t;
  return t.slice(0, COACH_TASK_NOTES_MAX_CHARS - 3) + '...';
}

/**
 * Append the verbatim Coach CTA when the model omits it; truncates to fit the
 * Postgres length cap. Mirrors `bubble-agent-dispatch/index.ts:220-228`.
 */
export function ensureCoachTaskNotesCta(notes: string | null): string | null {
  if (!notes) return null;
  const n = notes.trim();
  if (!n) return null;
  if (n.includes('Workout Intake') && n.includes('Generate Workout')) return n;
  const combined = `${n}\n\n${COACH_TASK_SEED_CTA}`;
  if (combined.length <= COACH_TASK_NOTES_MAX_CHARS) return combined;
  return combined.slice(0, COACH_TASK_NOTES_MAX_CHARS - 3) + '...';
}

/**
 * Extract the first valid numeric sequence (optional decimal) from a string.
 * Returns null if no valid token or not parseable; does not throw.
 */
export function sanitizeNumericString(raw: string): string | null {
  return sanitizeNumericStringForPatch(raw);
}

function capPersonalCueField(s: string): string {
  if (s.length <= PERSONAL_CUES_FIELD_MAX_CHARS) return s;
  return s.slice(0, PERSONAL_CUES_FIELD_MAX_CHARS - 3) + '...';
}

/**
 * Map Gemini `personal_cues_patch` to RPC rows using server-resolved dictionary ids per index.
 */
export function parsePersonalCuesPatchFromGemini(
  raw: unknown,
  dictionaryByIndex: Readonly<Record<number, ExerciseDictionaryIndexEntry | null>> | undefined,
): { entries: PersonalCueResolvedForRpc[]; droppedUnanchored: number } {
  const entries: PersonalCueResolvedForRpc[] = [];
  let droppedUnanchored = 0;
  if (raw == null || !Array.isArray(raw) || raw.length === 0) {
    return { entries, droppedUnanchored };
  }
  if (!dictionaryByIndex) {
    return { entries, droppedUnanchored: raw.length };
  }
  for (const el of raw) {
    if (el == null || typeof el !== 'object' || Array.isArray(el)) continue;
    const o = el as Record<string, unknown>;
    const ex = o.exerciseIndex;
    if (typeof ex !== 'number' || !Number.isInteger(ex) || ex < 0) continue;
    const row = dictionaryByIndex[ex];
    if (row == null) {
      droppedUnanchored += 1;
      continue;
    }
    const modeRaw = o.mode;
    const mode: 'append' | 'replace' =
      typeof modeRaw === 'string' && modeRaw.trim().toLowerCase() === 'replace'
        ? 'replace'
        : 'append';
    const pick = (key: string): string | undefined => {
      const v = o[key];
      if (typeof v !== 'string') return undefined;
      const t = v.trim();
      if (!t) return undefined;
      return capPersonalCueField(t);
    };
    const instructions = pick('instructions');
    const form_cues = pick('form_cues');
    const tips = pick('tips');
    const injury_prevention_tips = pick('injury_prevention_tips');
    if (!instructions && !form_cues && !tips && !injury_prevention_tips) continue;
    entries.push({
      exercise_dictionary_id: row.dictionary_id,
      mode,
      ...(instructions ? { instructions } : {}),
      ...(form_cues ? { form_cues } : {}),
      ...(tips ? { tips } : {}),
      ...(injury_prevention_tips ? { injury_prevention_tips } : {}),
    });
  }
  return { entries, droppedUnanchored };
}

export function parseExecutionPatchFromGemini(
  raw: unknown,
): CoachGeminiJsonResponse['execution_patch'] {
  try {
    if (raw == null) return null;
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const out: NonNullable<CoachGeminiJsonResponse['execution_patch']> = [];
    for (const el of raw) {
      if (el == null || typeof el !== 'object' || Array.isArray(el)) return null;
      const o = el as Record<string, unknown>;
      const ex = o.exerciseIndex;
      const st = o.setIndex;
      if (typeof ex !== 'number' || !Number.isInteger(ex) || ex < 0) return null;
      if (typeof st !== 'number' || !Number.isInteger(st) || st < 0) return null;
      const item: NonNullable<CoachGeminiJsonResponse['execution_patch']>[number] = {
        exerciseIndex: ex,
        setIndex: st,
      };
      if (o.weight !== undefined) {
        const s = coerceExecutionPatchNumericField(o.weight);
        if (s !== null) item.weight = s;
      }
      if (o.reps !== undefined) {
        const s = coerceExecutionPatchNumericField(o.reps);
        if (s !== null) item.reps = s;
      }
      if (o.rpe !== undefined) {
        const s = coerceExecutionPatchNumericField(o.rpe);
        if (s !== null) item.rpe = s;
      }
      if (o.done !== undefined && typeof o.done === 'boolean') {
        item.done = o.done;
      }
      out.push(item);
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

/**
 * Normalize `card_action` from Gemini JSON. The Vertex schema declares a string enum,
 * but the model intermittently echoes the persisted RPC shape `{ v: 1, kind:
 * 'trigger_generation' }` or a bare `{ kind: 'trigger_generation' }`. When we
 * only accepted the plain string, the field was silently dropped (`null`) and the
 * client never saw `messages.metadata.card_action` — Generation Hand-off stalled.
 *
 * Exported for unit tests; `parseCoachJson` is the primary consumer.
 */
export function parseCardActionTriggerGenerationFromGemini(
  raw: unknown,
): 'trigger_generation' | null {
  if (typeof raw === 'string') {
    return raw.trim() === 'trigger_generation' ? 'trigger_generation' : null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const kind = (raw as Record<string, unknown>).kind;
  return kind === 'trigger_generation' ? 'trigger_generation' : null;
}

/**
 * Parse a Coach JSON-mode response text into the normalized shape every guard /
 * persister consumes. Throws `Error('gemini_json_parse_failed')` when the body is not
 * JSON and `Error('gemini_invalid_json_shape')` when required keys are missing or
 * empty. Preserves the legacy contract — see
 * `_shared/llm/vertex-gemini.classifyError` for the dispatcher's mapping.
 */
export function parseCoachJson(
  text: string,
  exerciseDictionaryByIndex?: Readonly<Record<number, ExerciseDictionaryIndexEntry | null>>,
): CoachGeminiJsonResponse {
  const cleanText = stripMarkdownCodeFences(text);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleanText) as Record<string, unknown>;
  } catch {
    throw new Error('gemini_json_parse_failed');
  }
  const replyContent = typeof parsed.reply_content === 'string' ? parsed.reply_content : null;
  const createCard = typeof parsed.create_card === 'boolean' ? parsed.create_card : null;
  if (!replyContent?.trim() || createCard === null) {
    throw new Error('gemini_invalid_json_shape');
  }

  const rawTitle = parsed.task_title;
  const rawDesc = coalesceTaskDescription(parsed);

  const intake_phase = parseIntakePhase(parsed.intake_phase);
  const session_readiness_score = parseSessionReadinessScore(parsed.session_readiness_score);
  const missing_intake_categories = parseMissingIntakeCategories(parsed.missing_intake_categories);
  const user_requested_immediate_card = parseUserRequestedImmediateCard(
    parsed.user_requested_immediate_card,
  );
  const session_request = parseSessionRequest(parsed.session_request);

  const update_existing_task = parsed.update_existing_task === true;
  const updatedTitleRaw =
    typeof parsed.updated_task_title === 'string' ? parsed.updated_task_title.trim() : '';
  const updated_task_title = updatedTitleRaw.length > 0 ? updatedTitleRaw : null;
  const updated_task_description = coalesceUpdatedTaskDescription(parsed);

  const intakeTail = {
    intake_phase,
    session_readiness_score,
    missing_intake_categories,
    user_requested_immediate_card,
    session_request,
  };

  const updateTail = {
    update_existing_task,
    updated_task_title,
    updated_task_description,
  };

  const proposedCollect = parseProposedWorkoutMetadataWithDrops(parsed);
  const proposed_workout_metadata = proposedCollect.meta;
  const proposedMetaOrNull =
    Object.keys(proposed_workout_metadata).length > 0 ? proposed_workout_metadata : null;
  const proposed_workout_metadata_drops = proposedCollect.drops;

  const outlineCollect = parseCoachWorkoutOutlineWithDrops(parsed);
  const coach_workout_outline = outlineCollect.outline;
  const coach_workout_outline_drops = outlineCollect.drops;

  let execution_patch: CoachGeminiJsonResponse['execution_patch'] = null;
  try {
    execution_patch = parseExecutionPatchFromGemini(
      (parsed as Record<string, unknown>).execution_patch,
    );
  } catch {
    execution_patch = null;
  }

  const intakeCollect = parseAndCollectTaskModalIntakePatchFromGemini(
    (parsed as Record<string, unknown>).task_modal_intake_patch,
  );
  const task_modal_intake_patch = intakeCollect.patch;
  const task_modal_intake_dropped = intakeCollect.dropped;

  const cardActionRaw = (parsed as Record<string, unknown>).card_action;
  const card_action: CoachGeminiJsonResponse['card_action'] =
    parseCardActionTriggerGenerationFromGemini(cardActionRaw);

  const cuesResult = parsePersonalCuesPatchFromGemini(
    (parsed as Record<string, unknown>).personal_cues_patch,
    exerciseDictionaryByIndex,
  );
  const personal_cues_resolved = cuesResult.entries.length > 0 ? cuesResult.entries : null;
  const personal_cues_dropped_unanchored = cuesResult.droppedUnanchored;

  if (createCard) {
    const titleTrimmed = typeof rawTitle === 'string' ? rawTitle.trim() : '';
    if (!titleTrimmed) {
      throw new Error('gemini_invalid_json_shape');
    }
    return {
      reply_content: replyContent,
      create_card: true,
      task_title: titleTrimmed,
      task_description: rawDesc,
      coach_task_notes: ensureCoachTaskNotesCta(parseCoachTaskNotes(parsed.coach_task_notes)),
      proposed_workout_metadata: null,
      proposed_workout_metadata_drops: [],
      coach_workout_outline,
      coach_workout_outline_drops,
      execution_patch,
      task_modal_intake_patch,
      task_modal_intake_dropped,
      personal_cues_resolved,
      personal_cues_dropped_unanchored,
      card_action: null,
      ...intakeTail,
      ...updateTail,
    };
  }

  return {
    reply_content: replyContent,
    create_card: false,
    task_title: null,
    task_description: null,
    coach_task_notes: null,
    proposed_workout_metadata: proposedMetaOrNull,
    proposed_workout_metadata_drops,
    coach_workout_outline,
    coach_workout_outline_drops,
    execution_patch,
    task_modal_intake_patch,
    task_modal_intake_dropped,
    personal_cues_resolved,
    personal_cues_dropped_unanchored,
    card_action,
    ...intakeTail,
    ...updateTail,
  };
}

/** Versioned payload for `p_card_action` on agent RPCs (or null when empty). */
export function cardActionForRpc(action: 'trigger_generation' | null): unknown | null {
  if (action == null) return null;
  return { v: 1, kind: action };
}

/** Returns the patch shape expected by the persistence RPCs (or null when empty). */
export function executionPatchForRpc(
  patch: CoachGeminiJsonResponse['execution_patch'],
): unknown | null {
  if (patch == null || patch.length === 0) return null;
  return patch;
}

/** JSON array for `p_personal_cues` on agent RPCs (or null when empty). */
export function personalCuesPatchForRpc(
  resolved: PersonalCueResolvedForRpc[] | null,
): unknown | null {
  if (resolved == null || resolved.length === 0) return null;
  return resolved.map((e) => ({
    exercise_dictionary_id: e.exercise_dictionary_id,
    mode: e.mode,
    instructions: e.instructions ?? null,
    form_cues: e.form_cues ?? null,
    tips: e.tips ?? null,
    injury_prevention_tips: e.injury_prevention_tips ?? null,
  }));
}

export { taskModalIntakePatchForRpc } from './task-modal-intake-patch';
