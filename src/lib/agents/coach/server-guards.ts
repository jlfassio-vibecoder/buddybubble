/**
 * Coach server-side guards — pure module, canonical source.
 *
 * Encodes the three deterministic transformations the legacy file applies after
 * Gemini returns and before the persistence RPC runs. Reference:
 * `supabase/functions/bubble-agent-dispatch/index.ts:1683-1725`.
 *
 *   1. Open Canvas — when a server-resolved `knownTargetTaskId` exists, never
 *      `create_card` (PCC: Canvas is source of truth; Rail must not spawn sibling cards).
 *      Erroneous `task_title` / `task_description` on the create path are remapped to
 *      `updated_task_*` + `update_existing_task: true`. When the model already set
 *      `update_existing_task: true`, seed fields are cleared so persistence routes to
 *      draft/update RPCs instead of `agent_create_card_and_reply`.
 *   2. Layer B turn gate — when `user_requested_immediate_card` is false, block first
 *      messages from creating a card (`first_message_card_blocked`) and block second
 *      session-request messages until the user has had at least two prior turns
 *      (`session_request_turn_gate`). Block clears `create_card`, `task_title`,
 *      `task_description`, `coach_task_notes`.
 *   3. Active-workout clamp — when CURRENT WORKOUT CONTEXT is present, the user may be
 *      in live execution OR only viewing planned workout JSON on the card. When the
 *      trigger row indicates an **active** workout session, clear `create_card`,
 *      `task_title`, `task_description`, `coach_task_notes`, `update_existing_task`,
 *      `updated_task_title`, `updated_task_description`, `proposed_workout_metadata`,
 *      and `task_modal_intake_patch`. `execution_patch` and `personal_cues_resolved`
 *      survive. When workout context exists only from task metadata (planning / Task
 *      Modal), block **new** card creation (`create_card` / seed fields) but preserve
 *      `update_existing_task`, title/description updates, `proposed_workout_metadata`,
 *      and `task_modal_intake_patch` so the Coach can rewrite the open workout card.
 *
 * Returns a new object — never mutates the caller's `parsed` argument — so guards-
 * focused unit tests can compose fragments freely.
 *
 * A byte-for-byte mirror lives at `supabase/functions/agents/coach/server-guards.ts`.
 * Run `pnpm check:agent-mirror` to verify parity.
 *
 * Pure module: only depends on `./parse` for the `CoachGeminiJsonResponse` type. No DB,
 * no Deno globals.
 */

import type { CoachGeminiJsonResponse } from './parse';

/** Tight English phrase set: model claimed a write without structured output → fallback. */
const SELF_ATTESTATION_PHRASE_RE =
  /\b(i['']?ve\s+(updated|added|now\s+updated)|i\s+added|applied\s+to\s+your\s+card|written\s+to\s+your\s+card|pushed\s+(those\s+)?changes\s+to\s+(the\s+)?card|saved\s+(it|them)\s+to\s+your\s+(card|workout)|finalize(d)?\s+(the\s+)?(card|workout)\s+update)\b/i;

function hasTaskModalIntakePatch(p: CoachGeminiJsonResponse['task_modal_intake_patch']): boolean {
  return p != null && Object.keys(p).length > 0;
}

function blocksArrayNonEmpty(meta: Record<string, unknown> | null): boolean {
  if (!meta) return false;
  const b = meta.blocks;
  if (!Array.isArray(b) || b.length === 0) return false;
  return b.some((x) => x != null && typeof x === 'object' && !Array.isArray(x));
}

function flatExercisesNonEmpty(meta: Record<string, unknown> | null): boolean {
  if (!meta) return false;
  const ex = meta.exercises;
  if (!Array.isArray(ex) || ex.length === 0) return false;
  return ex.some((x) => x != null && typeof x === 'object' && !Array.isArray(x));
}

const WORKOUT_SECTION_HEADER_RE =
  /(^|\n)\s*(warm[\s-]?up|finisher|cool[\s-]?down|main|strength|mobility|cardio)\s*:/im;

const SETS_REPS_PRESCRIPTION_RE = /\b\d+\s*x\s*\d+\b|\b\d+\s*sets?\b|\b\d+\s*reps?\b/i;

/**
 * True when description text looks like a full workout prescription dump (not a short summary).
 * Short rail description-only updates (e.g. under ~80 chars) are allowed.
 */
export function looksLikeWorkoutPrescriptionDump(text: string | null | undefined): boolean {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t || t.length < 80) return false;
  if (WORKOUT_SECTION_HEADER_RE.test(t)) return true;
  const hasSetsReps = SETS_REPS_PRESCRIPTION_RE.test(t);
  if (t.length >= 120 && hasSetsReps) return true;
  const bulletLines = t.split(/\n/).filter((line) => /^\s*[-*•]\s+/.test(line));
  if (bulletLines.length >= 2 && hasSetsReps) return true;
  return false;
}

/**
 * Throws `{ kind: 'self_attestation_mismatch' }` when reply_content narrates a persisted
 * update but no structured write field is present.
 */
export function assertCoachReplySelfAttestation(parsed: CoachGeminiJsonResponse): void {
  const claimsUpdate = SELF_ATTESTATION_PHRASE_RE.test(parsed.reply_content);
  if (!claimsUpdate) return;
  const hasExecution = parsed.execution_patch != null && parsed.execution_patch.length > 0;
  const hasPersonal =
    parsed.personal_cues_resolved != null && parsed.personal_cues_resolved.length > 0;
  const meta = parsed.proposed_workout_metadata;
  const hasProposed = meta != null && typeof meta === 'object' && Object.keys(meta).length > 0;
  const hasCard =
    parsed.create_card ||
    (parsed.update_existing_task &&
      (Boolean(parsed.updated_task_title?.trim()) ||
        Boolean(parsed.updated_task_description?.trim()) ||
        hasProposed));
  const hasIntake = hasTaskModalIntakePatch(parsed.task_modal_intake_patch);
  const hasCardAction = parsed.card_action === 'trigger_generation';
  const hasOutline =
    parsed.coach_workout_outline != null && parsed.coach_workout_outline.length > 0;
  const hasPayload =
    hasExecution || hasPersonal || hasCard || hasIntake || hasCardAction || hasOutline;
  if (!hasPayload) {
    throw { kind: 'self_attestation_mismatch' as const };
  }
}

/**
 * Request-scoped fragment the strategy assembles before applying guards. The Coach
 * strategy stashes these on `DispatchContext.extras.coach` during `buildSystemPrompt`
 * and reads them back here.
 */
export type CoachGuardsFragment = {
  /** Server-resolved task under discussion, or null if none. */
  knownTargetTaskId: string | null;
  /** Count of prior non-agent messages in the thread. Used by Layer B. */
  priorUserMessageCount: number;
  /** Stringified CURRENT WORKOUT CONTEXT JSON or null when no live workout context. */
  currentWorkoutContextJson: string | null;
  /**
   * True when the **trigger** message indicates a live workout session (player /
   * sentinel), not merely that the task row carries planned workout JSON.
   */
  isActiveWorkoutSession: boolean;
};

/**
 * Apply the three Coach server-side guards in order. Returns a NEW
 * `CoachGeminiJsonResponse` object; never mutates `parsed`.
 */
export function applyCoachServerGuards(
  parsed: CoachGeminiJsonResponse,
  fragment: CoachGuardsFragment,
): CoachGeminiJsonResponse {
  let createCard = parsed.create_card;
  let taskTitle = parsed.task_title;
  let taskDescription = parsed.task_description;
  let seedTaskCommentText = createCard ? parsed.coach_task_notes : null;
  let updateExistingTask = parsed.update_existing_task;
  let updatedTaskTitle = parsed.updated_task_title;
  let updatedTaskDescription = parsed.updated_task_description;
  let proposedWorkoutMetadata = parsed.proposed_workout_metadata;
  let coachWorkoutOutline = parsed.coach_workout_outline;
  let taskModalIntakePatch = parsed.task_modal_intake_patch;
  let cardAction = parsed.card_action;

  // Guard 1: Open Canvas — never create a sibling card when a target task is known.
  if (fragment.knownTargetTaskId) {
    if (createCard) {
      const draftTitle = taskTitle?.trim() ?? '';
      const draftDesc = taskDescription?.trim() ?? '';
      if (draftTitle && !updatedTaskTitle?.trim()) {
        updatedTaskTitle = taskTitle;
        updateExistingTask = true;
      }
      if (draftDesc && !updatedTaskDescription?.trim()) {
        updatedTaskDescription = taskDescription;
        updateExistingTask = true;
      }
      createCard = false;
      taskTitle = null;
      taskDescription = null;
      seedTaskCommentText = null;
    } else if (updateExistingTask) {
      createCard = false;
      taskTitle = null;
      taskDescription = null;
      seedTaskCommentText = null;
    }
  }

  // Guard 2: Layer B turn gate. Mirrors `bubble-agent-dispatch/index.ts:1694-1707`.
  if (!parsed.user_requested_immediate_card) {
    let layerBReason: string | null = null;
    if (fragment.priorUserMessageCount === 0) {
      layerBReason = 'first_message_card_blocked';
    } else if (parsed.session_request && fragment.priorUserMessageCount < 2) {
      layerBReason = 'session_request_turn_gate';
    }
    if (layerBReason !== null) {
      createCard = false;
      taskTitle = null;
      taskDescription = null;
      seedTaskCommentText = null;
    }
  }

  // Guard 3: Workout-context clamp. Whenever planned/workout JSON is in context, block
  // creating a *new* card from this turn. Only an active live session strips structured
  // updates to the task card (draft/metadata/intake); Task Modal / planning keeps them.
  if (fragment.currentWorkoutContextJson) {
    createCard = false;
    taskTitle = null;
    taskDescription = null;
    seedTaskCommentText = null;
    if (fragment.isActiveWorkoutSession) {
      updateExistingTask = false;
      updatedTaskTitle = null;
      updatedTaskDescription = null;
      proposedWorkoutMetadata = null;
      coachWorkoutOutline = null;
      taskModalIntakePatch = null;
      cardAction = null;
    }
  }

  // Guard 4: Narrative vs Structure. Per docs/refactor/parametric-workout-blocks §11.3,
  // when proposed_workout_metadata.blocks is non-empty, structured JSON is the prescription
  // — prose in updated_task_description is forbidden.
  if (
    blocksArrayNonEmpty(proposedWorkoutMetadata as Record<string, unknown> | null) ||
    (coachWorkoutOutline != null && coachWorkoutOutline.length > 0)
  ) {
    updatedTaskDescription = null;
  }

  // Guard 5: Action exclusivity — card_action is a UI command, not a workout draft.
  if (cardAction === 'trigger_generation') {
    proposedWorkoutMetadata = null;
    coachWorkoutOutline = null;
    updatedTaskDescription = null;
  }

  // Guard 6: When planned workout context exists, strip prescription dumps in description
  // when the model omitted structured proposed_workout_metadata (blocks or exercises).
  const metaRecord = proposedWorkoutMetadata as Record<string, unknown> | null;
  if (
    fragment.currentWorkoutContextJson &&
    !fragment.isActiveWorkoutSession &&
    !blocksArrayNonEmpty(metaRecord) &&
    !flatExercisesNonEmpty(metaRecord) &&
    looksLikeWorkoutPrescriptionDump(updatedTaskDescription)
  ) {
    updatedTaskDescription = null;
  }

  const out: CoachGeminiJsonResponse = {
    ...parsed,
    create_card: createCard,
    task_title: taskTitle,
    task_description: taskDescription,
    coach_task_notes: seedTaskCommentText,
    update_existing_task: updateExistingTask,
    updated_task_title: updatedTaskTitle,
    updated_task_description: updatedTaskDescription,
    proposed_workout_metadata: proposedWorkoutMetadata,
    coach_workout_outline: coachWorkoutOutline,
    task_modal_intake_patch: taskModalIntakePatch,
    card_action: cardAction,
  };
  assertCoachReplySelfAttestation(out);
  return out;
}
