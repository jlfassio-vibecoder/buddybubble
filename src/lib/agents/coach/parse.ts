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
 *   - `sanitizeNumericString`                 — index.ts:498-504
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
  COACH_TASK_NOTES_MAX_CHARS,
  COACH_TASK_SEED_CTA,
  INTAKE_CATEGORIES,
  INTAKE_PHASES,
  type IntakeCategory,
  type IntakePhase,
} from './config';

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

/** Normalizes Gemini `proposed_workout_metadata` for `tasks.metadata` merge on finalize. */
export function parseProposedWorkoutMetadata(
  parsed: Record<string, unknown>,
): Record<string, unknown> {
  const raw = parsed.proposed_workout_metadata ?? parsed['proposed_workout_metadata'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof o.workout_type === 'string' && o.workout_type.trim()) {
    out.workout_type = o.workout_type.trim();
  }
  if (typeof o.duration_min === 'number' && Number.isFinite(o.duration_min) && o.duration_min > 0) {
    out.duration_min = Math.round(o.duration_min);
  }
  if (Array.isArray(o.exercises)) {
    const exercises: Record<string, unknown>[] = [];
    for (const ex of o.exercises) {
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
      exercises.push(row);
    }
    if (exercises.length > 0) out.exercises = exercises;
  }
  return out;
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
  if (n.includes('Generate Workout') && n.includes('adjustments')) return n;
  const combined = `${n}\n\n${COACH_TASK_SEED_CTA}`;
  if (combined.length <= COACH_TASK_NOTES_MAX_CHARS) return combined;
  return combined.slice(0, COACH_TASK_NOTES_MAX_CHARS - 3) + '...';
}

/**
 * Extract the first valid numeric sequence (optional decimal) from a string.
 * Returns null if no valid token or not parseable; does not throw.
 */
export function sanitizeNumericString(raw: string): string | null {
  const match = raw.match(/[0-9]+(?:\.[0-9]+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  if (!Number.isFinite(n)) return null;
  return match[0];
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
        if (typeof o.weight === 'string') {
          const s = sanitizeNumericString(o.weight);
          if (s !== null) item.weight = s;
        }
        // non-string or sanitize failure: omit field, do not drop the whole patch
      }
      if (o.reps !== undefined) {
        if (typeof o.reps === 'string') {
          const s = sanitizeNumericString(o.reps);
          if (s !== null) item.reps = s;
        }
      }
      if (o.rpe !== undefined) {
        if (typeof o.rpe === 'string') {
          const s = sanitizeNumericString(o.rpe);
          if (s !== null) item.rpe = s;
        }
      }
      if (o.done !== undefined) {
        if (typeof o.done !== 'boolean') return null;
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
 * Parse a Coach JSON-mode response text into the normalized shape every guard /
 * persister consumes. Throws `Error('gemini_json_parse_failed')` when the body is not
 * JSON and `Error('gemini_invalid_json_shape')` when required keys are missing or
 * empty. Preserves the legacy contract — see
 * `_shared/llm/vertex-gemini.classifyError` for the dispatcher's mapping.
 */
export function parseCoachJson(text: string): CoachGeminiJsonResponse {
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

  const proposed_workout_metadata = parseProposedWorkoutMetadata(parsed);
  const proposedMetaOrNull =
    Object.keys(proposed_workout_metadata).length > 0 ? proposed_workout_metadata : null;

  let execution_patch: CoachGeminiJsonResponse['execution_patch'] = null;
  try {
    execution_patch = parseExecutionPatchFromGemini(
      (parsed as Record<string, unknown>).execution_patch,
    );
  } catch {
    execution_patch = null;
  }

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
      execution_patch,
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
    execution_patch,
    ...intakeTail,
    ...updateTail,
  };
}

/** Returns the patch shape expected by the persistence RPCs (or null when empty). */
export function executionPatchForRpc(
  patch: CoachGeminiJsonResponse['execution_patch'],
): unknown | null {
  if (patch == null || patch.length === 0) return null;
  return patch;
}
