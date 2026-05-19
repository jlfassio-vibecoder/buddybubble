/**
 * Deterministic simulator for the metadata-composition logic encoded in
 * `agent_create_card_and_reply` and `agent_insert_coach_workout_draft_reply`
 * (see `supabase/migrations/20260828120000_fix_card_action_sibling_merge.sql`).
 *
 * The integration tests under `supabase/functions/agent-dispatch/` mock PostgREST
 * entirely, so they can verify the **arguments** the Edge function passes to the
 * RPC, but cannot directly observe the metadata Postgres would write to
 * `messages.metadata`. This simulator closes that gap by mirroring the SQL
 * function's sibling-merge logic in pure TypeScript so tests can assert the
 * **persisted shape** for a given set of RPC arguments.
 *
 * The bug fixed in `20260828120000_*` (and the one we never want to ship again):
 * `p_card_action` was nested inside the `p_task_modal_intake_patch` guard, so
 * `card_action` only landed on metadata when an intake patch was also present.
 *
 * This file plus the SQL-structure regression test in
 * `agent-dispatch/card-action-sql-structure.test.ts` together encode the
 * invariant: each optional payload is its own sibling check.
 */

type Json = unknown;

function isNonEmptyJsonbObject(value: unknown): value is Record<string, unknown> {
  if (value == null) return false;
  if (typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  return Object.keys(value as Record<string, unknown>).length > 0;
}

function isNonEmptyJsonbArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

function nonEmptyTrimmed(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/**
 * Inputs for the simulator — names match the SQL function `p_*` parameters with
 * the `p_` prefix dropped for ergonomics.
 */
export type CreateCardAndReplyArgs = {
  execution_patch?: Json;
  personal_cues?: Json;
  task_modal_intake_patch?: Json;
  card_action?: Json;
};

/**
 * Simulates `agent_create_card_and_reply` reply-row metadata composition.
 *
 * Each optional payload is checked independently. Equivalent to the
 * `v_meta := '{}'::jsonb;` ... block in the SQL function — kept in lock-step.
 */
export function simulateCreateCardReplyMetadata(
  args: CreateCardAndReplyArgs,
): Record<string, unknown> {
  const meta: Record<string, unknown> = {};

  if (isNonEmptyJsonbArray(args.execution_patch)) {
    meta.execution_patch = args.execution_patch;
  }

  if (isNonEmptyJsonbArray(args.personal_cues)) {
    meta.personal_cues_patch = args.personal_cues;
  }

  if (isNonEmptyJsonbObject(args.task_modal_intake_patch)) {
    meta.task_modal_intake_patch = args.task_modal_intake_patch;
  }

  if (isNonEmptyJsonbObject(args.card_action)) {
    meta.card_action = args.card_action;
  }

  return meta;
}

/**
 * Inputs for the draft-reply simulator. `proposed_metadata` is always present
 * on the reply (the SQL function bundles it inside `coach_draft`); the other
 * payloads are optional sibling merges.
 */
export type InsertCoachDraftReplyArgs = {
  target_task_id: string;
  proposed_title?: string | null;
  proposed_description?: string | null;
  proposed_metadata?: Record<string, unknown> | null;
  execution_patch?: Json;
  personal_cues?: Json;
  task_modal_intake_patch?: Json;
  card_action?: Json;
};

/**
 * Simulates `agent_insert_coach_workout_draft_reply` reply-row metadata.
 *
 * The SQL emits a `coach_draft` object always, plus sibling merges for each
 * optional payload — the prior bug was a missing `end` in the `case ... end`
 * chain that swallowed the `card_action` branch inside the intake `else`.
 */
export function simulateCoachDraftReplyMetadata(
  args: InsertCoachDraftReplyArgs,
): Record<string, unknown> {
  const proposedMeta = args.proposed_metadata ?? {};
  const title = nonEmptyTrimmed(args.proposed_title);
  const desc = nonEmptyTrimmed(args.proposed_description);

  const meta: Record<string, unknown> = {
    coach_draft: {
      status: 'pending',
      proposed_title: title,
      proposed_description: desc,
      proposed_metadata: proposedMeta,
      target_task_id: args.target_task_id,
    },
  };

  if (isNonEmptyJsonbArray(args.execution_patch)) {
    meta.execution_patch = args.execution_patch;
  }

  if (isNonEmptyJsonbArray(args.personal_cues)) {
    meta.personal_cues_patch = args.personal_cues;
  }

  if (isNonEmptyJsonbObject(args.task_modal_intake_patch)) {
    meta.task_modal_intake_patch = args.task_modal_intake_patch;
  }

  if (isNonEmptyJsonbObject(args.card_action)) {
    meta.card_action = args.card_action;
  }

  return meta;
}

/**
 * Simulates `agent_update_task_and_reply` reply-row metadata (already correct
 * before the Phase 12.1.1 fix — included for parity / future regression).
 */
export function simulateUpdateTaskReplyMetadata(args: {
  card_action?: Json;
}): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  if (isNonEmptyJsonbObject(args.card_action)) {
    meta.card_action = args.card_action;
  }
  return meta;
}
