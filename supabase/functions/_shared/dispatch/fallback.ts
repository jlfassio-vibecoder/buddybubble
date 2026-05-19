/**
 * Slug-agnostic safe-reply fallback used when an LLM call fails in a way that should
 * still result in a user-visible reply (rather than only an HTTP 500).
 *
 * Today every consolidated agent that uses `agent_create_card_and_reply` for its happy
 * path can also use it for the fallback path with `p_create_card: false`. Buddy and
 * Organizer get strategy-specific fallback overloads in Phase 4 / 5; this module
 * intentionally only covers the universal path so Phase 1 ships a minimum viable
 * surface that Phase 2 (Coach) can rely on.
 *
 * Mirrors the legacy fallback at `supabase/functions/bubble-agent-dispatch/index.ts:1741-1752`.
 */

import {
  agentCreateCardAndReply,
  AGENT_CREATE_CARD_CANONICAL_NULL_PATCHES,
  type RpcResult,
} from './rpc.ts';
import type { DispatchContext } from './types.ts';

/**
 * Insert a `text` reply on the trigger thread without creating a task. Returns the same
 * `RpcResult` shape every other RPC wrapper produces; the caller decides how to react
 * to a fallback failure (today: log + return HTTP 500).
 */
export async function insertSafeReply(ctx: DispatchContext, text: string): Promise<RpcResult> {
  return agentCreateCardAndReply(ctx.supabase, {
    p_trigger_message_id: ctx.message.id,
    p_thread_id: ctx.threadId,
    p_agent_auth_user_id: ctx.agent.auth_user_id,
    p_invoker_user_id: ctx.message.user_id,
    p_reply_text: text,
    p_create_card: false,
    p_task_type: 'workout',
    p_task_status: 'todo',
    ...AGENT_CREATE_CARD_CANONICAL_NULL_PATCHES,
  });
}
