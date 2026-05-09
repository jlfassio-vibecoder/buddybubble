/**
 * MIRROR FILE — canonical lives at `src/lib/agents/coach/server-guards.ts`.
 *
 * Body below is byte-for-byte identical to the canonical Vitest-side file (excluding
 * this header) EXCEPT for the import path of `./parse` which uses the explicit `.ts`
 * extension required by Deno. Any change must be hand-mirrored — run
 * `pnpm check:agent-mirror` to verify body parity.
 */

import type { CoachGeminiJsonResponse } from './parse.ts';

/** Tight English phrase set: model claimed a write without structured output → fallback. */
const SELF_ATTESTATION_PHRASE_RE =
  /\b(i['']?ve\s+(updated|added|now\s+updated)|i\s+added|applied\s+to\s+your\s+card|written\s+to\s+your\s+card|pushed\s+(those\s+)?changes\s+to\s+(the\s+)?card|saved\s+(it|them)\s+to\s+your\s+(card|workout)|finalize(d)?\s+(the\s+)?(card|workout)\s+update)\b/i;

/**
 * Throws `{ kind: 'self_attestation_mismatch' }` when reply_content narrates a persisted
 * update but no structured write field is present.
 */
export function assertCoachReplySelfAttestation(parsed: CoachGeminiJsonResponse): void {
  if (!SELF_ATTESTATION_PHRASE_RE.test(parsed.reply_content)) return;
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
  if (!hasExecution && !hasPersonal && !hasCard) {
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
  };
  assertCoachReplySelfAttestation(out);
  return out;
}
