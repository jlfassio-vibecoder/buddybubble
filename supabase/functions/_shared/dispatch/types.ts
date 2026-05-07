/**
 * Canonical AgentStrategy contract for the consolidated agent dispatcher.
 *
 * This file is the single source of truth for `AgentStrategy<TParsed>`,
 * `DispatchContext`, `RoutingDescriptor`, `PreflightAction`, and the supporting
 * payload types. A byte-for-byte mirror lives at
 * `src/lib/agents/_shared/dispatch/types.ts` so Vitest can compile against the same
 * contract; any change here MUST be mirrored there. A drift-detection lint is planned
 * for Phase 7 — until then, mirror by hand.
 *
 * Pure types only. No runtime, no Deno globals, no `import type` from runtime-specific
 * packages. `SupabaseClient` is declared as a structural placeholder: both the real
 * Deno (`jsr:@supabase/supabase-js@2`) and Node (`@supabase/supabase-js`) clients
 * satisfy it; strategy modules cast back to the runtime-native type at their call sites.
 */

import type { GeminiContent, VertexResponseSchema } from '../llm/types.ts';

/** Slug identifier for an agent. Treated as opaque string everywhere in `_shared`. */
export type AgentSlug = string;

/**
 * Structural placeholder for the Supabase service-role client. The dispatcher entry
 * point passes the real client (Deno: `jsr:@supabase/supabase-js@2`, Node:
 * `@supabase/supabase-js`); both satisfy this shape.
 */
export interface SupabaseClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
  from(table: string): unknown;
}

/** Generic envelope returned by every dispatcher RPC; matches `RpcEnvelope` callers. */
export type RpcEnvelope<T = Record<string, unknown>> = {
  ok: boolean;
  deduped?: boolean;
  reason?: string;
  data?: T;
};

/** Definition row pulled from `agent_definitions` plus joined identity fields. */
export interface AgentDef {
  slug: AgentSlug;
  auth_user_id: string;
  mention_handle: string;
  display_name: string;
  is_active: boolean;
}

/** Resolved agent for a single dispatch attempt. */
export interface ResolvedAgent {
  slug: AgentSlug;
  auth_user_id: string;
  mention_handle: string;
  display_name: string;
}

/**
 * Webhook payload's `record` row, normalized so every strategy reads the same fields.
 * Mirrors the columns selected by every legacy dispatcher.
 */
export interface NormalizedMessage {
  id: string;
  bubble_id: string | null;
  user_id: string;
  parent_id: string | null;
  target_task_id: string | null;
  attached_task_id: string | null;
  content: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

/** History row loaded by `_shared/dispatch/history.ts`. */
export interface HistoryRow {
  id: string;
  user_id: string;
  content: string | null;
  created_at: string;
  parent_id: string | null;
  target_task_id: string | null;
  attached_task_id: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Coach's preflight short-circuit (e.g. workout-player silent greeting). Slug-agnostic
 * union so other strategies can extend.
 */
export type PreflightAction =
  | {
      kind: 'short_circuit_with_reply';
      replyText: string;
      rpc: 'agent_create_card_and_reply';
      rpcArgs: Record<string, unknown>;
    }
  | { kind: 'skip'; reason: string };

/**
 * Routing rules a strategy opts into so the dispatcher does not branch on slug. Each
 * rule is composable; the dispatcher OR-s the matches across registered strategies.
 */
export interface RoutingDescriptor {
  acceptMention: boolean;
  acceptRootDefault: boolean;
  acceptThreadContinuation: boolean;
  excludeOnMentionOf?: AgentSlug[];
  implicitTrigger?: (msg: NormalizedMessage) => boolean;
  requireBubbleBinding: boolean;
}

/** Context handed to every `AgentStrategy` method for a single dispatch attempt. */
export interface DispatchContext {
  supabase: SupabaseClient;
  requestId: string;
  message: NormalizedMessage;
  agent: ResolvedAgent;
  threadId: string;
  history: HistoryRow[];
  signal: AbortSignal;
  /**
   * Strategy-owned scratch space, request-scoped. Each strategy SHOULD namespace its
   * keys under its own slug (e.g. `extras.coach = { ... }`) so registrations cannot
   * collide. Phase 2 added this field; the dispatcher initializes it to `{}` per request
   * and never reads from it.
   */
  extras?: Record<string, unknown>;
}

/**
 * Per-agent strategy. `TParsed` is the strategy-specific normalized response shape
 * produced by `parse` and consumed by `applyServerGuards` + `persist`.
 */
export interface AgentStrategy<TParsed> {
  slug: AgentSlug;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  responseSchema: VertexResponseSchema;

  preflight?(ctx: DispatchContext): Promise<PreflightAction | null>;
  buildSystemPrompt(ctx: DispatchContext): Promise<string>;
  buildContents(ctx: DispatchContext): Promise<GeminiContent[]>;
  parse(json: unknown, ctx: DispatchContext): TParsed;
  applyServerGuards?(parsed: TParsed, ctx: DispatchContext): TParsed;
  persist(parsed: TParsed, ctx: DispatchContext): Promise<RpcEnvelope>;

  routing?: RoutingDescriptor;
  safeReplyText: string;
}
