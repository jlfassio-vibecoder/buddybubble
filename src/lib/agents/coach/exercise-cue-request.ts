/**
 * Hidden `messages.metadata.exercise_cue_request` — UI → Coach handoff for M3 cue generation.
 * Mirror: `supabase/functions/agents/coach/exercise-cue-request.ts`. Run `pnpm check:agent-mirror`.
 */

export type CueFieldKey = 'instructions' | 'form_cues' | 'tips' | 'injury_prevention_tips';

/** Minimal field shape for `computeEmptyCueFields` (client passes `ResolvedCueBundle` fields). */
export type CueFieldLike = {
  value?: string;
  /** Workout-scoped when `workout` or legacy `flat`; personal/library do not fill Ask Coach. */
  provenance?: string;
} | null;

/** Minimal bundle shape for `computeEmptyCueFields` (client passes `ResolvedCueBundle`). */
export type CueBundleLike = {
  instructions?: CueFieldLike;
  form_cues?: CueFieldLike;
  tips?: CueFieldLike;
  injury_prevention_tips?: CueFieldLike;
};

export type ExerciseCueRequestV1 = {
  v: 1;
  resolution_key: string;
  exercise_name: string;
  prescription?: { sets?: number; reps?: number | string };
  empty_fields: CueFieldKey[];
  workout_exercise_index?: number;
};

export const CUE_FIELD_LABELS: Record<CueFieldKey, string> = {
  instructions: 'Instructions',
  form_cues: 'Form cues',
  tips: 'Tips',
  injury_prevention_tips: 'Injury notes',
};

const CUE_FIELD_KEYS: ReadonlySet<CueFieldKey> = new Set([
  'instructions',
  'form_cues',
  'tips',
  'injury_prevention_tips',
]);

function trimFieldValue(field: { value?: string } | null | undefined): string {
  return typeof field?.value === 'string' ? field.value.trim() : '';
}

/** True when the field has card-scoped content (workout or legacy flat provenance). */
function isWorkoutScopedFilled(field: CueFieldLike | undefined): boolean {
  if (!trimFieldValue(field)) return false;
  const p = field?.provenance;
  return p === 'workout' || p === 'flat';
}

/**
 * Cue fields still blank for workout-scoped Ask Coach fill.
 * Personal/library-only values count as empty so Coach can still write card cues.
 */
export function computeEmptyCueFields(
  bundle: CueBundleLike,
  options: { includeInjuryField: boolean },
): CueFieldKey[] {
  const out: CueFieldKey[] = [];
  if (!isWorkoutScopedFilled(bundle.instructions)) out.push('instructions');
  if (!isWorkoutScopedFilled(bundle.form_cues)) out.push('form_cues');
  if (!isWorkoutScopedFilled(bundle.tips)) out.push('tips');
  if (options.includeInjuryField && !isWorkoutScopedFilled(bundle.injury_prevention_tips)) {
    out.push('injury_prevention_tips');
  }
  return out;
}

export function readInjuriesOnFileFromBiometrics(raw: unknown): {
  onFile: boolean;
  snippet: string | null;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { onFile: false, snippet: null };
  }
  const injuries = (raw as Record<string, unknown>).injuries;
  if (typeof injuries !== 'string' || !injuries.trim()) {
    return { onFile: false, snippet: null };
  }
  const snippet = injuries.trim();
  return { onFile: true, snippet };
}

function parsePrescription(raw: unknown): ExerciseCueRequestV1['prescription'] | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const sets = o.sets;
  const reps = o.reps;
  const prescription: NonNullable<ExerciseCueRequestV1['prescription']> = {};
  if (typeof sets === 'number' && Number.isInteger(sets) && sets > 0) {
    prescription.sets = sets;
  }
  if (typeof reps === 'number' && Number.isInteger(reps) && reps > 0) {
    prescription.reps = reps;
  } else if (typeof reps === 'string' && reps.trim()) {
    prescription.reps = reps.trim();
  }
  return Object.keys(prescription).length > 0 ? prescription : undefined;
}

function parseEmptyFields(raw: unknown): CueFieldKey[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: CueFieldKey[] = [];
  for (const el of raw) {
    if (typeof el !== 'string' || !CUE_FIELD_KEYS.has(el as CueFieldKey)) return null;
    if (!out.includes(el as CueFieldKey)) out.push(el as CueFieldKey);
  }
  return out.length > 0 ? out : null;
}

export function parseExerciseCueRequestFromMetadata(raw: unknown): ExerciseCueRequestV1 | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.resolution_key !== 'string' || !o.resolution_key.trim()) return null;
  if (typeof o.exercise_name !== 'string' || !o.exercise_name.trim()) return null;
  const empty_fields = parseEmptyFields(o.empty_fields);
  if (!empty_fields) return null;
  const workout_exercise_index = o.workout_exercise_index;
  const indexOk =
    workout_exercise_index === undefined
      ? undefined
      : typeof workout_exercise_index === 'number' &&
          Number.isInteger(workout_exercise_index) &&
          workout_exercise_index >= 0
        ? workout_exercise_index
        : null;
  if (indexOk === null) return null;
  return {
    v: 1,
    resolution_key: o.resolution_key.trim(),
    exercise_name: o.exercise_name.trim(),
    prescription: parsePrescription(o.prescription),
    empty_fields,
    ...(indexOk !== undefined ? { workout_exercise_index: indexOk } : {}),
  };
}

export function parseExerciseCueRequestFromMessageMetadata(
  metadata: unknown,
): ExerciseCueRequestV1 | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  return parseExerciseCueRequestFromMetadata(
    (metadata as Record<string, unknown>).exercise_cue_request,
  );
}

export type DispatchHistoryRowLike = {
  metadata?: unknown;
  user_id?: string;
};

/** Reads `metadata.workout_cues_patch.resolution_key` when present on a persisted reply. */
export function parseWorkoutCuesPatchFromMessageMetadata(
  metadata: unknown,
): { resolution_key: string } | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>).workout_cues_patch;
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const resolution_key = (raw as Record<string, unknown>).resolution_key;
  if (typeof resolution_key !== 'string' || !resolution_key.trim()) return null;
  return { resolution_key: resolution_key.trim() };
}

function coachEmittedWorkoutCuesPatchForKey(
  history: ReadonlyArray<DispatchHistoryRowLike>,
  agentAuthUserId: string,
  resolutionKey: string,
): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    const row = history[i];
    if (row.user_id !== agentAuthUserId) continue;
    const patch = parseWorkoutCuesPatchFromMessageMetadata(row.metadata);
    if (patch?.resolution_key === resolutionKey) return true;
  }
  return false;
}

/**
 * True when the user is asking to write exercise **coach notes** (structural_patch.coach_notes),
 * not workout-scoped cue fields. Used to escape stale Ask Coach cue-lock on follow-ups.
 *
 * Accepts common typo "coach not" (missing final e) seen in production asks.
 */
export function messageRequestsCoachNotes(content: string | null | undefined): boolean {
  if (typeof content !== 'string' || !content.trim()) return false;
  // "coach notes" / "coach note" / "coach_notes" / typo "coach not" —
  // exclude coach_task_notes / task notes.
  return (
    /\bcoach[_\s-]*not(?:e|es)?\b/i.test(content) &&
    !/\bcoach[_\s-]*task[_\s-]*not(?:e|es)?\b/i.test(content)
  );
}

/**
 * True when the model claimed a coach-notes write (reply) but emitted an identity-only
 * structural_patch with no `coach_notes` field — the production no-op shape.
 */
export function structuralPatchIsEmptyCoachNotesClaim(
  replyContent: string | null | undefined,
  structuralPatch: ReadonlyArray<{ [key: string]: unknown }> | null | undefined,
): boolean {
  if (typeof replyContent !== 'string' || !replyContent.trim()) return false;
  if (!/\bcoach[_\s-]*not(?:e|es)?\b/i.test(replyContent)) return false;
  if (!structuralPatch?.length) return false;
  return structuralPatch.every((op) => {
    const fieldKeys = Object.keys(op).filter(
      (k) => k !== 'op' && k !== 'block_id' && k !== 'exercise_id',
    );
    return fieldKeys.length === 0;
  });
}

/**
 * Active exercise-cue flow for this dispatch: trigger metadata, else latest user
 * `exercise_cue_request` in thread history (legacy affirmation / continuation).
 *
 * A fresh Ask Coach click (trigger carries `exercise_cue_request`) always wins so
 * re-asks still run after an earlier `workout_cues_patch` in history — history
 * suppression only applies to the fallthrough path.
 *
 * When resolving from history only, an explicit "coach notes" follow-up exits cue mode
 * so the rich-rail schema (structural_patch.coach_notes) is available.
 */
export function resolveExerciseCueRequestForDispatch(
  triggerMetadata: unknown,
  history: ReadonlyArray<DispatchHistoryRowLike>,
  agentAuthUserId: string,
  triggerContent?: string | null,
): ExerciseCueRequestV1 | null {
  const fromTrigger = parseExerciseCueRequestFromMessageMetadata(triggerMetadata);
  if (fromTrigger) return fromTrigger;

  let req: ExerciseCueRequestV1 | null = null;
  for (let i = history.length - 1; i >= 0; i--) {
    const row = history[i];
    if (row.user_id === agentAuthUserId) continue;
    const fromHistory = parseExerciseCueRequestFromMessageMetadata(row.metadata);
    if (fromHistory) {
      req = fromHistory;
      break;
    }
  }
  if (!req) return null;
  if (coachEmittedWorkoutCuesPatchForKey(history, agentAuthUserId, req.resolution_key)) {
    return null;
  }
  // Stale Ask Coach lock must not trap follow-ups that ask for coach notes.
  if (messageRequestsCoachNotes(triggerContent)) return null;
  return req;
}

export const EXERCISE_CUE_REQUEST_HEADER = '--- EXERCISE_CUE_REQUEST ---';

export function formatPrescriptionLine(
  prescription: ExerciseCueRequestV1['prescription'],
): string | null {
  if (!prescription) return null;
  const sets = prescription.sets;
  const reps = prescription.reps;
  if (sets != null && reps != null) return `${sets}×${reps}`;
  if (sets != null) return `${sets} sets`;
  if (reps != null) return `${reps} reps`;
  return null;
}
