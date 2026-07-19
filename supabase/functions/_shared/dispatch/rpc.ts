/**
 * Typed RPC wrappers for the four Postgres functions the consolidated dispatcher invokes.
 *
 * The arg-shape literals are lifted from the legacy dispatchers so callers see exactly
 * the same payloads they do today. Definitions:
 *
 *   - `agent_create_card_and_reply` —
 *     `supabase/migrations/20260829140000_agent_create_card_coach_workout_outline.sql`
 *     (single 16-arg signature including `p_card_action` and `p_coach_workout_outline`; always pass explicit nulls).
 *   - `agent_insert_coach_workout_draft_reply` — same migration, plus
 *     `p_execution_patch jsonb` extension; original at
 *     `supabase/migrations/20260623120000_coach_workout_draft_messages_metadata.sql:43-53`
 *     (signature mirrored at `bubble-agent-dispatch/index.ts:80-92`).
 *   - `agent_update_task_and_reply` —
 *     `supabase/migrations/20261018130000_agent_update_task_and_reply_collapse_overloads.sql`
 *     (single signature including `p_proposed_workout_metadata`; rail-surface direct `tasks`
 *     title/description + optional shallow `metadata` merge + reply; bypasses coach_draft).
 *   - `buddy_create_onboarding_reply` —
 *     `supabase/migrations/20260701140000_buddy_rpc.sql:16-23`
 *     (call site at `buddy-agent-dispatch/index.ts:545-553`).
 *   - `organizer_create_reply_and_task` —
 *     `supabase/migrations/20260723140000_organizer_rpc.sql:19-27`
 *     (call site at `organizer-agent-dispatch/index.ts:604-613`).
 *
 * `apply_workout_draft` is intentionally NOT wrapped here — it is an authenticated
 * client RPC, not a dispatcher RPC.
 *
 * Each wrapper returns `{ data, error }` straight from PostgREST plus a typed
 * `parseRpcEnvelope` parser that surfaces RPC bodies of the form `{ ok: false, ... }`
 * as errors so the dispatcher can classify them uniformly.
 */

import type { RpcEnvelope, RpcResult, SupabaseClient } from './types.ts';

// Re-export RpcResult so existing import sites keep working unchanged. The canonical
// definition was hoisted to `./types.ts` in Phase 5 so `AgentStrategy.safeReplyInsert`
// can reference it without creating a circular dependency.
export type { RpcResult } from './types.ts';

/**
 * Explicit nulls for optional JSONB RPC args. PostgREST cannot disambiguate
 * `agent_create_card_and_reply` overloads when these keys are omitted; always spread
 * this object on every call site.
 */
export const AGENT_CREATE_CARD_CANONICAL_NULL_PATCHES = {
  p_execution_patch: null,
  p_personal_cues: null,
  p_task_modal_intake_patch: null,
  p_card_action: null,
  p_coach_workout_outline: null,
  p_workout_cues_patch: null,
} as const satisfies Pick<
  AgentCreateCardArgs,
  | 'p_execution_patch'
  | 'p_personal_cues'
  | 'p_task_modal_intake_patch'
  | 'p_card_action'
  | 'p_coach_workout_outline'
  | 'p_workout_cues_patch'
>;

export type AgentCreateCardArgs = {
  p_trigger_message_id: string;
  /** Slack-style thread root: parent_id of the agent reply (parent_id of trigger if in thread, else trigger id). */
  p_thread_id: string;
  p_agent_auth_user_id: string;
  p_invoker_user_id: string;
  p_reply_text: string;
  p_create_card: boolean;
  p_task_type: string;
  p_task_status: string;
  p_task_title?: string | null;
  p_task_description?: string | null;
  p_seed_task_comment_text?: string | null;
  p_execution_patch?: unknown;
  /** Resolved personal cues for `apply_personal_cues_for_user` + message metadata. */
  p_personal_cues?: unknown;
  /** Coach task-modal workout intake wizard patch (merged into reply `metadata`). */
  p_task_modal_intake_patch?: unknown;
  /** Coach UI command (e.g. `{ v: 1, kind: 'trigger_generation' }`). */
  p_card_action?: unknown;
  /** Workout-scoped cue patch from EXERCISE_CUE_REQUEST flow (reply metadata). */
  p_workout_cues_patch?: unknown;
  /** Apex Architect agreed outline blocks → `tasks.metadata.coach_workout_outline`. */
  p_coach_workout_outline?: unknown;
};

export type AgentInsertCoachDraftArgs = {
  p_trigger_message_id: string;
  p_thread_id: string;
  p_agent_auth_user_id: string;
  p_invoker_user_id: string;
  p_target_task_id: string;
  p_reply_text: string;
  p_proposed_title: string | null;
  p_proposed_description: string | null;
  p_proposed_metadata: Record<string, unknown>;
  p_execution_patch?: unknown;
  p_personal_cues?: unknown;
  p_task_modal_intake_patch?: unknown;
  p_card_action?: unknown;
  p_workout_cues_patch?: unknown;
};

export type AgentUpdateTaskAndReplyArgs = {
  p_trigger_message_id: string;
  p_thread_id: string;
  p_agent_auth_user_id: string;
  p_invoker_user_id: string;
  p_target_task_id: string;
  p_reply_text: string;
  /** Nullable; RPC requires at least one of title, description, or non-empty metadata. */
  p_new_title: string | null;
  p_new_description: string | null;
  /** Shallow-merge into `tasks.metadata` when non-null (rail auto-apply). */
  p_new_metadata?: Record<string, unknown> | null;
  p_card_action?: unknown;
  /** Outline co-pilot: client sweep reads `outline_draft_applied` from reply metadata. */
  p_outline_draft_applied?: Record<string, unknown> | null;
  /** Workout-scoped cue patch from EXERCISE_CUE_REQUEST flow (reply metadata). */
  p_workout_cues_patch?: unknown;
  /** Pre-merge Coach proposed_workout_metadata for client canvas sweep (reply metadata). */
  p_proposed_workout_metadata?: Record<string, unknown> | null;
  /** Surgical field-level canvas ops for client draft apply (reply metadata). */
  p_structural_patch?: unknown[] | null;
};

export type BuddyCreateOnboardingReplyArgs = {
  p_bubble_id: string;
  p_buddy_user_id: string;
  p_parent_id: string;
  p_reply_content: string;
  p_card_title: string | null;
  p_card_desc: string | null;
  p_action_type: string | null;
  p_target_task_id: string | null;
  p_surface: string | null;
};

export type IncrementStorefrontBuddyUsageArgs = {
  p_workspace_id: string;
  p_char_count: number;
  p_auth_user_id: string;
};

export type OrganizerCreateReplyAndTaskArgs = {
  p_bubble_id: string;
  p_organizer_user_id: string;
  p_parent_id: string;
  p_reply_content: string;
  p_task_title: string | null;
  p_task_description: string | null;
  p_task_due_on: string | null;
  p_task_assignee_user_id: string | null;
};

/** PostgREST error fields we surface for Edge log diagnosis. */
export type PostgrestRpcError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

/**
 * Map PostgREST `{ data, error }` plus the RPC's own `{ ok, ... }` envelope into a
 * single `RpcResult`. The dispatcher's classifier consumes this uniform shape.
 */
export function parseRpcEnvelope<T extends Record<string, unknown> = Record<string, unknown>>(
  raw: unknown,
  pgError: PostgrestRpcError | null,
): RpcResult<T> {
  if (pgError) {
    return {
      ok: false,
      error: pgError.message,
      code: pgError.code,
      ...(typeof pgError.details === 'string' && pgError.details
        ? { details: pgError.details }
        : {}),
      ...(typeof pgError.hint === 'string' && pgError.hint ? { hint: pgError.hint } : {}),
      raw,
    };
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const env = raw as RpcEnvelope<T> & Record<string, unknown>;
    if (env.ok === false) {
      const reason =
        typeof env.reason === 'string' && env.reason
          ? env.reason
          : 'rpc envelope returned ok=false';
      return { ok: false, error: reason, raw };
    }
    return { ok: true, data: (env.data ?? env) as T, raw };
  }
  return { ok: false, error: 'rpc returned non-object payload', raw };
}

function postgrestErrorFields(error: unknown): PostgrestRpcError | null {
  if (error == null || typeof error !== 'object') return null;
  const e = error as Record<string, unknown>;
  const message = typeof e.message === 'string' ? e.message : '';
  if (!message) return null;
  return {
    message,
    ...(typeof e.code === 'string' ? { code: e.code } : {}),
    ...(typeof e.details === 'string' ? { details: e.details } : {}),
    ...(typeof e.hint === 'string' ? { hint: e.hint } : {}),
  };
}

async function callRpc<TArgs extends Record<string, unknown>>(
  supabase: SupabaseClient,
  name: string,
  args: TArgs,
): Promise<RpcResult> {
  const { data, error } = await supabase.rpc(name, args as Record<string, unknown>);
  const pgError = postgrestErrorFields(error);
  const result = parseRpcEnvelope(data, pgError);
  if (!result.ok && pgError) {
    console.error('[rpc] PostgREST rpc failed', {
      rpc: name,
      message: pgError.message,
      code: pgError.code ?? null,
      details: pgError.details ?? null,
      hint: pgError.hint ?? null,
      arg_keys: Object.keys(args),
    });
  }
  return result;
}

export function agentCreateCardAndReply(
  supabase: SupabaseClient,
  args: AgentCreateCardArgs,
): Promise<RpcResult> {
  return callRpc(supabase, 'agent_create_card_and_reply', args);
}

export function agentInsertCoachWorkoutDraftReply(
  supabase: SupabaseClient,
  args: AgentInsertCoachDraftArgs,
): Promise<RpcResult> {
  return callRpc(supabase, 'agent_insert_coach_workout_draft_reply', args);
}

function isAgentUpdateTaskSchemaMiss(error: string | undefined): boolean {
  if (!error) return false;
  const e = error.toLowerCase();
  return (
    e.includes('could not find the function') ||
    e.includes('pgrst202') ||
    e.includes('schema cache') ||
    e.includes('does not exist') ||
    e.includes('no matches') ||
    e.includes('ambiguous') ||
    e.includes('could not choose')
  );
}

/**
 * True when PostgREST rejected the call because `p_proposed_workout_metadata`
 * is missing from the live RPC signature (migration not applied / schema cache /
 * overload ambiguity).
 */
export function isProposedWorkoutMetadataRpcUnavailable(error: string | undefined): boolean {
  if (!error) return false;
  const e = error.toLowerCase();
  const mentionsParam =
    e.includes('p_proposed_workout_metadata') || e.includes('proposed_workout_metadata');
  return (
    mentionsParam ||
    (isAgentUpdateTaskSchemaMiss(error) && e.includes('agent_update_task_and_reply'))
  );
}

/**
 * True when PostgREST rejected the call because `p_structural_patch` is missing
 * from the live RPC signature (migration not applied / schema cache).
 */
export function isStructuralPatchRpcUnavailable(error: string | undefined): boolean {
  if (!error) return false;
  const e = error.toLowerCase();
  const mentionsParam = e.includes('p_structural_patch') || e.includes('structural_patch');
  return (
    mentionsParam ||
    (isAgentUpdateTaskSchemaMiss(error) && e.includes('agent_update_task_and_reply'))
  );
}

/**
 * Call `agent_update_task_and_reply`.
 * - Omits optional JSONB params when null/empty so older signatures still resolve.
 * - Passes `p_structural_patch` as a plain JS array (Supabase serializes to JSONB).
 *   Do **not** `JSON.stringify` — that double-encodes and fails `jsonb_typeof = 'array'`.
 * - Retries without unknown optional params when PostgREST reports a schema miss.
 */
export async function agentUpdateTaskAndReply(
  supabase: SupabaseClient,
  args: AgentUpdateTaskAndReplyArgs,
): Promise<RpcResult> {
  const {
    p_proposed_workout_metadata: proposed,
    p_structural_patch: structuralPatch,
    ...rest
  } = args;

  const hasStructural = structuralPatch != null && structuralPatch.length > 0;
  const hasProposed = proposed != null;

  const buildArgs = (opts: {
    includeProposed: boolean;
    includeStructural: boolean;
  }): Record<string, unknown> => {
    const out: Record<string, unknown> = { ...rest };
    if (opts.includeProposed && hasProposed) {
      out.p_proposed_workout_metadata = proposed;
    }
    // Plain array → JSONB array. Never JSON.stringify.
    if (opts.includeStructural && hasStructural) {
      out.p_structural_patch = structuralPatch;
    }
    return out;
  };

  const logFailure = (label: string, result: RpcResult, argKeys: string[]) => {
    if (result.ok) return;
    console.error(label, {
      error: result.error,
      code: result.code,
      details: result.details ?? null,
      hint: result.hint ?? null,
      arg_keys: argKeys,
      had_proposed_workout_metadata: hasProposed,
      had_structural_patch: hasStructural,
      structural_patch_len: hasStructural ? structuralPatch!.length : 0,
      raw: result.raw,
    });
  };

  let includeProposed = true;
  let includeStructural = true;
  let current = buildArgs({ includeProposed, includeStructural });
  let result = await callRpc(supabase, 'agent_update_task_and_reply', current);
  if (result.ok) return result;
  logFailure('[rpc] agent_update_task_and_reply failed', result, Object.keys(current));

  if (includeStructural && hasStructural && isStructuralPatchRpcUnavailable(result.error)) {
    console.error(
      '[rpc] agent_update_task_and_reply rejected p_structural_patch; retrying without it',
      {
        error: result.error,
        code: result.code,
        details: result.details ?? null,
        hint: result.hint ?? null,
      },
    );
    includeStructural = false;
    current = buildArgs({ includeProposed, includeStructural });
    result = await callRpc(supabase, 'agent_update_task_and_reply', current);
    if (result.ok) return result;
    logFailure(
      '[rpc] agent_update_task_and_reply still failed after dropping p_structural_patch',
      result,
      Object.keys(current),
    );
  }

  if (includeProposed && hasProposed && isProposedWorkoutMetadataRpcUnavailable(result.error)) {
    console.error(
      '[rpc] agent_update_task_and_reply rejected p_proposed_workout_metadata; retrying without it',
      {
        error: result.error,
        code: result.code,
        details: result.details ?? null,
        hint: result.hint ?? null,
      },
    );
    includeProposed = false;
    current = buildArgs({ includeProposed, includeStructural });
    result = await callRpc(supabase, 'agent_update_task_and_reply', current);
    if (result.ok) return result;
    logFailure(
      '[rpc] agent_update_task_and_reply still failed after dropping optional params',
      result,
      Object.keys(current),
    );
  }

  return result;
}

export function buddyCreateOnboardingReply(
  supabase: SupabaseClient,
  args: BuddyCreateOnboardingReplyArgs,
): Promise<RpcResult> {
  return callRpc(supabase, 'buddy_create_onboarding_reply', args);
}

export function incrementStorefrontBuddyUsage(
  supabase: SupabaseClient,
  args: IncrementStorefrontBuddyUsageArgs,
): Promise<RpcResult> {
  return callRpc(supabase, 'increment_storefront_buddy_usage', args);
}

export function organizerCreateReplyAndTask(
  supabase: SupabaseClient,
  args: OrganizerCreateReplyAndTaskArgs,
): Promise<RpcResult> {
  return callRpc(supabase, 'organizer_create_reply_and_task', args);
}
