/**
 * Buddy `AgentStrategy<BuddyParsedResponse>` — Deno-only.
 *
 * Wires the Vitest-mirrored pure modules (`config`, `schema`, `prompts`, `parse`)
 * into the dispatcher's `AgentStrategy` contract from `_shared/dispatch/types.ts`.
 *
 * Buddy is the workspace-global onboarding agent. The Phase 5 resolver refactor in
 * `agent-dispatch-v2/resolve.ts` is what makes this strategy reachable without a
 * `bubble_agent_bindings` row; this strategy declares the routing intent and the
 * dispatcher-side logic does the rest.
 *
 * Lift map (legacy → here):
 *   - history fetch (thread vs bubble): buddy-agent-dispatch/index.ts:199-263
 *   - implicit-trigger user-turn substitution: buddy-agent-dispatch/index.ts:451-453
 *   - response parsing: buddy-agent-dispatch/index.ts:509-528 (now via the shared
 *     `_shared/llm/vertex-gemini.extractGeminiText` + the pure `parseBuddyResponse`)
 *   - parent_id resolution for the RPC: buddy-agent-dispatch/index.ts:539-542
 *   - RPC call: buddy-agent-dispatch/index.ts:545-553 (now via the typed
 *     `buddyCreateOnboardingReply` wrapper in `_shared/dispatch/rpc.ts`)
 *
 * Logging: emits ONE strategy-owned `phase = 'persisted'` line containing only
 * metadata (`has_card`, `action_type`, `created_task_id`, `reply_message_id`). The
 * raw `replyContent` and `createCard.title/description` MUST NEVER be logged because
 * they can contain user-provided onboarding context (PII parity with the Phase 4
 * Organizer hardening).
 */

import { log } from '../../_shared/obs/log.ts';
import { buddyCreateOnboardingReply } from '../../_shared/dispatch/rpc.ts';
import {
  isBuddyOnboardingSentinel,
  shouldExcludeBuddyOnboardingFromHistory,
} from '../../_shared/dispatch/sentinel.ts';
import type {
  AgentStrategy,
  DispatchContext,
  HistoryRow,
  RpcEnvelope,
  RpcResult,
  SupabaseClient as SharedSupabaseClient,
} from '../../_shared/dispatch/types.ts';
import type { GeminiContent, VertexGenerateResponse } from '../../_shared/llm/types.ts';
import { extractGeminiText } from '../../_shared/llm/vertex-gemini.ts';

import {
  BUDDY_IMPLICIT_TRIGGER_USER_TEXT,
  BUDDY_MAX_OUTPUT_TOKENS,
  BUDDY_MODEL_DEFAULT,
  BUDDY_SAFE_REPLY_TEXT,
  BUDDY_SLUG,
  BUDDY_TEMPERATURE,
} from './config.ts';
import { parseBuddyResponse, type BuddyParsedResponse } from './parse.ts';
import { buddySystemPrompt } from './prompts.ts';
import { BUDDY_RESPONSE_SCHEMA } from './schema.ts';

const BUDDY_BUBBLE_HISTORY_LIMIT = 12;
const BUDDY_HISTORY_COLUMNS = 'id, user_id, content, created_at, parent_id';

type MessagesTable = {
  select: (columns: string) => MessagesQuery;
};

type MessagesQuery = {
  eq: (column: string, value: unknown) => MessagesQuery;
  neq: (column: string, value: unknown) => MessagesQuery;
  order: (column: string, options: { ascending: boolean }) => MessagesQuery;
  limit: (n: number) => Promise<{
    data: HistoryRow[] | null;
    error: { message: string } | null;
  }>;
};

/**
 * Fetch the last N bubble messages (chronological, oldest → newest) when the
 * trigger is a root message and the dispatcher has not pre-loaded `ctx.history`.
 * Mirrors `fetchBuddyHistory`'s no-parent_id branch at
 * buddy-agent-dispatch/index.ts:236-263.
 */
async function loadRootBubbleHistory(ctx: DispatchContext): Promise<HistoryRow[]> {
  if (!ctx.message.bubble_id) return [];

  const table = ctx.supabase.from('messages') as MessagesTable;
  // Exclude the trigger row so `buildBuddyContents` does not push it twice (once
  // as part of `history`, then again as the dedicated trigger user turn). Mirrors
  // the established pattern in `_shared/dispatch/history.ts:45` (`buildBaseQuery`).
  const result = await table
    .select(BUDDY_HISTORY_COLUMNS)
    .eq('bubble_id', ctx.message.bubble_id)
    .neq('id', ctx.message.id)
    .order('created_at', { ascending: false })
    .limit(BUDDY_BUBBLE_HISTORY_LIMIT);

  if (result.error) {
    log('warn', 'failed to fetch root bubble history for buddy', {
      request_id: ctx.requestId,
      slug: BUDDY_SLUG,
      message_id: ctx.message.id,
      bubble_id: ctx.message.bubble_id,
      error: result.error.message,
    });
    return [];
  }

  return [...((result.data ?? []) as HistoryRow[])].reverse();
}

async function buildBuddyContents(ctx: DispatchContext): Promise<GeminiContent[]> {
  const agentAuthIds = new Set<string>([ctx.agent.auth_user_id]);
  // For thread messages (parent_id != null), `build-context.ts` already loaded
  // history via `loadThreadHistoryByParent` so `ctx.history` is populated. For root
  // messages with no thread, the dispatcher returns an empty `ctx.history`; Buddy
  // still wants the last 12 bubble messages so the model can answer follow-ups
  // without an explicit @Buddy mention.
  const history =
    ctx.history.length === 0 && !ctx.message.parent_id && !ctx.message.target_task_id
      ? await loadRootBubbleHistory(ctx)
      : ctx.history;

  const out: GeminiContent[] = [];
  for (const row of history) {
    if (shouldExcludeBuddyOnboardingFromHistory(row)) continue;
    const text = typeof row.content === 'string' ? row.content.trim() : '';
    // Empty content rows cannot be sent as Vertex text parts.
    if (!text) continue;
    const role: 'user' | 'model' = agentAuthIds.has(row.user_id) ? 'model' : 'user';
    out.push({ role, parts: [{ text }] });
  }

  // User-turn substitution: when the trigger row IS the onboarding sentinel, swap
  // its (machine-only) content for the implicit-trigger paragraph that prompts
  // Buddy to greet + orient + offer one first step. Mirrors
  // buddy-agent-dispatch/index.ts:451-453.
  const triggerText = isBuddyOnboardingSentinel(ctx.message)
    ? BUDDY_IMPLICIT_TRIGGER_USER_TEXT
    : (ctx.message.content ?? '').trim();
  // Skip the push when there is no trigger text to add — sending an empty text
  // part would just confuse Vertex (parity with the Phase 4 Organizer fix).
  if (triggerText) {
    out.push({ role: 'user', parts: [{ text: triggerText }] });
  }

  return out;
}

/**
 * Resolve the `p_parent_id` argument for `buddy_create_onboarding_reply`. Slack-style
 * threading: thread the reply under the trigger when the trigger is a root message,
 * otherwise reuse the existing thread root. Mirrors buddy-agent-dispatch/index.ts:539-542.
 */
function resolveBuddyParentId(ctx: DispatchContext): string {
  const pid = ctx.message.parent_id;
  return typeof pid === 'string' && pid.length > 0 ? pid : ctx.message.id;
}

async function persistBuddyReply(
  ctx: DispatchContext,
  args: {
    replyContent: string;
    cardTitle: string | null;
    cardDescription: string | null;
    actionType: string | null;
  },
): Promise<RpcResult> {
  const supabase: SharedSupabaseClient = ctx.supabase;
  return buddyCreateOnboardingReply(supabase, {
    p_bubble_id: ctx.message.bubble_id!,
    p_buddy_user_id: ctx.agent.auth_user_id,
    p_parent_id: resolveBuddyParentId(ctx),
    p_reply_content: args.replyContent,
    p_card_title: args.cardTitle,
    p_card_desc: args.cardDescription,
    p_action_type: args.actionType,
  });
}

export const BuddyStrategy: AgentStrategy<BuddyParsedResponse> = {
  slug: BUDDY_SLUG,
  model: BUDDY_MODEL_DEFAULT,
  temperature: BUDDY_TEMPERATURE,
  maxOutputTokens: BUDDY_MAX_OUTPUT_TOKENS,
  responseSchema: BUDDY_RESPONSE_SCHEMA,
  safeReplyText: BUDDY_SAFE_REPLY_TEXT,

  routing: {
    acceptMention: true,
    // Buddy is never a root-default agent. Plain root messages without a `@Buddy`
    // mention or the onboarding sentinel only reach Buddy via the
    // `continuationLookback: 'bubble'` walk below.
    acceptRootDefault: false,
    acceptThreadContinuation: true,
    // Workspace-global: Buddy has no `bubble_agent_bindings` rows (see
    // supabase/migrations/20260701150000_buddy_agent_rls_workspace_global.sql).
    requireBubbleBinding: false,
    // If the user explicitly addressed Coach in this message, Buddy stays silent
    // even when the thread continuation rule would otherwise match. Mirrors
    // buddy-agent-dispatch/index.ts:391-397.
    excludeOnMentionOf: ['coach'],
    implicitTrigger: isBuddyOnboardingSentinel,
    // Buddy's "previous bubble message authored by me" continuation kicks in when
    // the user posts a plain root message right after Buddy spoke. Resolver does
    // the single-query bubble lookup and matches on `prev.user_id ===
    // ctx.agent.auth_user_id`. Mirrors buddy-agent-dispatch/index.ts:170-186.
    continuationLookback: 'bubble',
  },

  // No preflight — Buddy's only implicit trigger is the onboarding sentinel, which
  // the routing layer matches via `implicitTrigger`. There is no preflight LLM call
  // (unlike Coach's workout-player greeting).

  buildSystemPrompt(_ctx) {
    return Promise.resolve(buddySystemPrompt);
  },

  buildContents(ctx) {
    return buildBuddyContents(ctx);
  },

  parse(json, _ctx) {
    const response = json as VertexGenerateResponse;
    const text = extractGeminiText(response.candidates?.[0]);
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('gemini_empty_response');
    }
    const parsed = parseBuddyResponse(text);
    if (!parsed) {
      // Surfaces as `error_kind = 'shape'` via `classifyError` in the dispatcher's
      // catch block, which is fallback-eligible (safeReplyInsert / insertSafeReply).
      const err = new Error('buddy_json_parse_failed') as Error & {
        kind?: 'shape';
      };
      err.kind = 'shape';
      throw err;
    }
    return parsed;
  },

  // No applyServerGuards — Buddy has no Layer B / draft / active-workout overrides
  // and no writes feature flag. The product contract is enforced by the prompt +
  // strict responseSchema; the parser already drops malformed cards on its own.

  async persist(parsed, ctx): Promise<RpcEnvelope> {
    const card = parsed.createCard;
    const result = await persistBuddyReply(ctx, {
      replyContent: parsed.replyContent,
      cardTitle: card?.title ?? null,
      cardDescription: card?.description ?? null,
      actionType: card?.action_type ?? null,
    });

    if (!result.ok) {
      log('error', 'buddy persist rpc failed', {
        request_id: ctx.requestId,
        slug: BUDDY_SLUG,
        message_id: ctx.message.id,
        bubble_id: ctx.message.bubble_id ?? undefined,
        phase: 'persisted',
        error: result.error,
      });
      throw new Error(`rpc_failed:${result.error}`);
    }

    // Strategy-owned 'persisted' log line. Keep it metadata-only: replyContent and
    // card title/description can carry user-provided onboarding context.
    const data = (result.data ?? {}) as {
      created_task_id?: unknown;
      reply_message_id?: unknown;
    };
    const createdTaskId = typeof data.created_task_id === 'string' ? data.created_task_id : null;
    const replyMessageId = typeof data.reply_message_id === 'string' ? data.reply_message_id : null;
    log('info', 'buddy persisted', {
      request_id: ctx.requestId,
      slug: BUDDY_SLUG,
      message_id: ctx.message.id,
      bubble_id: ctx.message.bubble_id ?? undefined,
      phase: 'persisted',
      has_card: card != null,
      action_type: card?.action_type ?? null,
      created_task_id: createdTaskId,
      reply_message_id: replyMessageId,
    });

    return { ok: true, data: result.data };
  },

  /**
   * Override the universal `insertSafeReply` fallback. Buddy's `auth_user_id` is
   * not provisioned to call `agent_create_card_and_reply`; route the safe reply
   * through Buddy's own RPC instead, with no card.
   */
  safeReplyInsert(ctx, text) {
    return persistBuddyReply(ctx, {
      replyContent: text,
      cardTitle: null,
      cardDescription: null,
      actionType: null,
    });
  },
};
