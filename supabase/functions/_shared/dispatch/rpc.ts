/**
 * Typed RPC wrappers for the four Postgres functions the consolidated dispatcher invokes.
 *
 * The arg-shape literals are lifted from the legacy dispatchers so callers see exactly
 * the same payloads they do today. Definitions:
 *
 *   - `agent_create_card_and_reply` —
 *     `supabase/migrations/20260729120000_agent_rpcs_persist_execution_patch.sql:46-60`
 *     (signature mirrored at `bubble-agent-dispatch/index.ts:61-78`).
 *   - `agent_insert_coach_workout_draft_reply` — same migration, plus
 *     `p_execution_patch jsonb` extension; original at
 *     `supabase/migrations/20260623120000_coach_workout_draft_messages_metadata.sql:43-53`
 *     (signature mirrored at `bubble-agent-dispatch/index.ts:80-92`).
 *   - `agent_update_task_and_reply` —
 *     `supabase/migrations/20260825120000_agent_update_task_and_reply_metadata.sql`
 *     (rail-surface direct `tasks` title/description + optional shallow `metadata` merge + reply;
 *     bypasses coach_draft).
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
};

export type BuddyCreateOnboardingReplyArgs = {
  p_bubble_id: string;
  p_buddy_user_id: string;
  p_parent_id: string;
  p_reply_content: string;
  p_card_title: string | null;
  p_card_desc: string | null;
  p_action_type: string | null;
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

/**
 * Map PostgREST `{ data, error }` plus the RPC's own `{ ok, ... }` envelope into a
 * single `RpcResult`. The dispatcher's classifier consumes this uniform shape.
 */
export function parseRpcEnvelope<T extends Record<string, unknown> = Record<string, unknown>>(
  raw: unknown,
  pgError: { message: string; code?: string } | null,
): RpcResult<T> {
  if (pgError) {
    return { ok: false, error: pgError.message, code: pgError.code, raw };
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

async function callRpc<TArgs extends Record<string, unknown>>(
  supabase: SupabaseClient,
  name: string,
  args: TArgs,
): Promise<RpcResult> {
  const { data, error } = await supabase.rpc(name, args as Record<string, unknown>);
  return parseRpcEnvelope(data, error);
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

export function agentUpdateTaskAndReply(
  supabase: SupabaseClient,
  args: AgentUpdateTaskAndReplyArgs,
): Promise<RpcResult> {
  return callRpc(supabase, 'agent_update_task_and_reply', args);
}

export function buddyCreateOnboardingReply(
  supabase: SupabaseClient,
  args: BuddyCreateOnboardingReplyArgs,
): Promise<RpcResult> {
  return callRpc(supabase, 'buddy_create_onboarding_reply', args);
}

export function organizerCreateReplyAndTask(
  supabase: SupabaseClient,
  args: OrganizerCreateReplyAndTaskArgs,
): Promise<RpcResult> {
  return callRpc(supabase, 'organizer_create_reply_and_task', args);
}
