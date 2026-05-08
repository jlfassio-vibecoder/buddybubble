/**
 * Canonical AgentStrategy contract for the consolidated agent dispatcher.
 *
 * This file is the single source of truth for `AgentStrategy<TParsed>`,
 * `DispatchContext`, `RoutingDescriptor`, `PreflightAction`, and the supporting
 * payload types. A byte-for-byte mirror lives at
 * `src/lib/agents/_shared/dispatch/types.ts` so Vitest can compile against the same
 * contract; any change here MUST be mirrored there. Run `pnpm check:agent-mirror` to
 * verify parity.
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

/**
 * Uniform classifier-friendly result the typed RPC wrappers in `_shared/dispatch/rpc.ts`
 * produce. Hoisted from `rpc.ts` to `types.ts` in Phase 5 so the `AgentStrategy.safeReplyInsert`
 * hook can reference it from inside the strategy contract without importing `rpc.ts`
 * (which would create a circular dependency: rpc.ts already imports from types.ts).
 *
 * `rpc.ts` re-exports this type so existing import sites (`fallback.ts`, strategies) keep
 * working unchanged.
 */
export type RpcResult<T extends Record<string, unknown> = Record<string, unknown>> =
  | { ok: true; data: T; raw: unknown }
  | { ok: false; error: string; code?: string; raw?: unknown };

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
  /**
   * How `acceptThreadContinuation` should source the "is this an active conversation?"
   * signal when the trigger row has NO `parent_id` (root message):
   *
   *   - `'thread'` (default): the resolver only walks `parent_id != null` history, so a
   *     root message NEVER counts as a continuation. Coach + Organizer behavior.
   *   - `'bubble'`: when `parent_id == null`, the resolver runs a single bubble-scoped
   *     lookup of the immediate prior message and matches if it was authored by this
   *     strategy's agent. Mirrors Buddy's legacy "previous bubble message authored by
   *     me" continuation at `buddy-agent-dispatch/index.ts:170-186`.
   */
  continuationLookback?: 'thread' | 'bubble';
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

  /**
   * Optional override for the dispatcher's universal `insertSafeReply` fallback path.
   * When defined, the dispatcher prefers this hook over `_shared/dispatch/fallback.ts`
   * for fallback-eligible LLM failures. Buddy uses this to land its safe reply via
   * `buddy_create_onboarding_reply` (with `p_card_*: null`); Coach + Organizer leave
   * the field unset and fall through to `agent_create_card_and_reply`.
   *
   * Return shape matches `RpcResult` so the dispatcher's logging path is uniform.
   */
  safeReplyInsert?(ctx: DispatchContext, text: string): Promise<RpcResult>;

  routing?: RoutingDescriptor;
  safeReplyText: string;
}
