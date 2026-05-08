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
 *   3. Active-workout clamp — when CURRENT WORKOUT CONTEXT is present, the user is in
 *      live execution. Clear `create_card`, `task_title`, `task_description`,
 *      `coach_task_notes`, `update_existing_task`, `updated_task_title`,
 *      `updated_task_description`, `proposed_workout_metadata`. Only `execution_patch`
 *      survives.
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

  // Guard 3: Active-workout clamp. Mirrors `bubble-agent-dispatch/index.ts:1716-1725`.
  if (fragment.currentWorkoutContextJson) {
    createCard = false;
    taskTitle = null;
    taskDescription = null;
    seedTaskCommentText = null;
    updateExistingTask = false;
    updatedTaskTitle = null;
    updatedTaskDescription = null;
    proposedWorkoutMetadata = null;
  }

  return {
    ...parsed,
    create_card: createCard,
    task_title: taskTitle,
    task_description: taskDescription,
    coach_task_notes: seedTaskCommentText,
    update_existing_task: updateExistingTask,
    updated_task_title: updatedTaskTitle,
    updated_task_description: updatedTaskDescription,
    proposed_workout_metadata: proposedWorkoutMetadata,
  };
}
