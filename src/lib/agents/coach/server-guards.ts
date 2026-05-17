/**
 * Coach server-side guards — pure module, canonical source.
 *
 * Encodes the three deterministic transformations the legacy file applies after
 * Gemini returns and before the persistence RPC runs. Reference:
 * `supabase/functions/bubble-agent-dispatch/index.ts:1683-1725`.
 *
 *   1. Draft override — when a server-resolved `knownTargetTaskId` exists and the
 *      model set `update_existing_task: true`, clear `create_card`, `task_title`,
 *      `task_description`, and `coach_task_notes`. The persistence path will route to
 *      `agent_insert_coach_workout_draft_reply` instead of `agent_create_card_and_reply`.
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
  const hasPayload = hasExecution || hasPersonal || hasCard || hasIntake;
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
  let taskModalIntakePatch = parsed.task_modal_intake_patch;

  // Guard 1: Draft override. Mirrors `bubble-agent-dispatch/index.ts:1683-1688`.
  if (fragment.knownTargetTaskId && updateExistingTask) {
    createCard = false;
    taskTitle = null;
    taskDescription = null;
    seedTaskCommentText = null;
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

  // The legacy file repeats Guard 1 here at lines 1709-1714 — preserved for
  // byte-for-byte fidelity (no-op when Guard 1 already cleared the fields, but the
  // duplicate keeps drift detection trivial).
  if (fragment.knownTargetTaskId && updateExistingTask) {
    createCard = false;
    taskTitle = null;
    taskDescription = null;
    seedTaskCommentText = null;
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
      taskModalIntakePatch = null;
    }
  }

  // Guard 4: Narrative vs Structure. Per docs/refactor/parametric-workout-blocks §11.3,
  // when proposed_workout_metadata.blocks is non-empty, structured JSON is the prescription
  // — prose in updated_task_description is forbidden.
  if (blocksArrayNonEmpty(proposedWorkoutMetadata as Record<string, unknown> | null)) {
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
    task_modal_intake_patch: taskModalIntakePatch,
  };
  assertCoachReplySelfAttestation(out);
  return out;
}
