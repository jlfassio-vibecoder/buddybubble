/**
 * Organizer `AgentStrategy<OrganizerParsedResponse>` — Deno-only.
 *
 * Wires the Vitest-mirrored pure modules (`config`, `schema`, `prompts`, `parse`)
 * into the dispatcher's `AgentStrategy` contract from
 * `_shared/dispatch/types.ts`. No preflight, no server guards: Organizer's product
 * contract is "always reply, optionally propose a write" (see
 * `docs/refactor/vertex-agent-dispatch-consolidation/phase-4-organizer-strategy-port.md`).
 *
 * Lift map (legacy → here):
 *   - history filter (Buddy-sentinel skip):
 *       organizer-agent-dispatch/index.ts:194-231
 *   - response shape parsing:
 *       organizer-agent-dispatch/index.ts:573-594  (now via `_shared/llm/vertex-gemini.extractGeminiText`
 *       + the pure `parseOrganizerResponse`)
 *   - write-gating + RPC call:
 *       organizer-agent-dispatch/index.ts:596-618 (now via `gateOrganizerWrite`
 *       + the typed `organizerCreateReplyAndTask` wrapper in
 *       `_shared/dispatch/rpc.ts`)
 *
 * Logging: emits one strategy-owned `phase = 'persisted'` line including
 * metadata only (`proposed_write_kind`, `created_task_id`). Do not log the raw
 * proposed-write payload because it can contain meeting notes, task descriptions,
 * or other user data. The dispatcher's generic 'persisted' line at
 * `agent-dispatch-v2/index.ts:280` still fires after this method returns; the
 * strategy line is the queryable artifact for Organizer-specific ops queries
 * (`slug = 'organizer'`).
 */

import { readDispatcherEnv } from '../../_shared/env.ts';
import { log } from '../../_shared/obs/log.ts';
import { organizerCreateReplyAndTask } from '../../_shared/dispatch/rpc.ts';
import type {
  AgentStrategy,
  DispatchContext,
  HistoryRow,
  RpcEnvelope,
  SupabaseClient as SharedSupabaseClient,
} from '../../_shared/dispatch/types.ts';
import type { GeminiContent, VertexGenerateResponse } from '../../_shared/llm/types.ts';
import { extractGeminiText } from '../../_shared/llm/vertex-gemini.ts';

import {
  ORGANIZER_MAX_OUTPUT_TOKENS,
  ORGANIZER_MODEL_DEFAULT,
  ORGANIZER_SAFE_REPLY_TEXT,
  ORGANIZER_SLUG,
  ORGANIZER_TEMPERATURE,
} from './config.ts';
import {
  gateOrganizerWrite,
  parseOrganizerResponse,
  type OrganizerParsedResponse,
} from './parse.ts';
import { BUDDY_ONBOARDING_SYSTEM_EVENT, organizerSystemPrompt } from './prompts.ts';
import { ORGANIZER_RESPONSE_SCHEMA } from './schema.ts';

const ORGANIZER_ROOT_HISTORY_LIMIT = 12;
const ORGANIZER_HISTORY_COLUMNS =
  'id, user_id, content, created_at, parent_id, target_task_id, attached_task_id, metadata';

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

async function loadRootBubbleHistory(ctx: DispatchContext): Promise<HistoryRow[]> {
  if (!ctx.message.bubble_id) return [];

  const table = ctx.supabase.from('messages') as MessagesTable;
  const result = await table
    .select(ORGANIZER_HISTORY_COLUMNS)
    .eq('bubble_id', ctx.message.bubble_id)
    .neq('id', ctx.message.id)
    .order('created_at', { ascending: false })
    .limit(ORGANIZER_ROOT_HISTORY_LIMIT);

  if (result.error) {
    log('warn', 'failed to fetch root bubble history for organizer', {
      request_id: ctx.requestId,
      slug: ORGANIZER_SLUG,
      message_id: ctx.message.id,
      bubble_id: ctx.message.bubble_id,
      error: result.error.message,
    });
    return [];
  }

  return [...((result.data ?? []) as HistoryRow[])].reverse();
}

async function buildOrganizerContents(ctx: DispatchContext): Promise<GeminiContent[]> {
  const agentAuthIds = new Set<string>([ctx.agent.auth_user_id]);
  const history =
    ctx.history.length === 0 && !ctx.message.parent_id && !ctx.message.target_task_id
      ? await loadRootBubbleHistory(ctx)
      : ctx.history;
  const out: GeminiContent[] = [];
  for (const row of history) {
    const text = typeof row.content === 'string' ? row.content.trim() : '';
    // Empty content rows cannot be sent as Vertex text parts. The Buddy onboarding
    // sentinel is a frontend-owned trigger string, never user-meaningful — strip
    // it from history (parity with `organizer-agent-dispatch/index.ts:198, :226`).
    if (!text) continue;
    if (text === BUDDY_ONBOARDING_SYSTEM_EVENT) continue;
    const role: 'user' | 'model' = agentAuthIds.has(row.user_id) ? 'model' : 'user';
    out.push({ role, parts: [{ text }] });
  }
  out.push({ role: 'user', parts: [{ text: (ctx.message.content ?? '').trim() }] });
  return out;
}

export const OrganizerStrategy: AgentStrategy<OrganizerParsedResponse> = {
  slug: ORGANIZER_SLUG,
  model: ORGANIZER_MODEL_DEFAULT,
  temperature: ORGANIZER_TEMPERATURE,
  maxOutputTokens: ORGANIZER_MAX_OUTPUT_TOKENS,
  responseSchema: ORGANIZER_RESPONSE_SCHEMA,
  safeReplyText: ORGANIZER_SAFE_REPLY_TEXT,

  routing: {
    acceptMention: true,
    // Organizer is never the implicit default for plain-text root messages. The
    // legacy dispatcher only fires on @mention or thread continuation
    // (organizer-agent-dispatch/index.ts:496-503).
    acceptRootDefault: false,
    acceptThreadContinuation: true,
    requireBubbleBinding: true,
  },

  // No preflight — Organizer has no implicit-trigger sentinel like Coach's
  // workout-player open event.

  buildSystemPrompt(_ctx) {
    return Promise.resolve(organizerSystemPrompt);
  },

  buildContents(ctx) {
    return buildOrganizerContents(ctx);
  },

  parse(json, _ctx) {
    const response = json as VertexGenerateResponse;
    const text = extractGeminiText(response.candidates?.[0]);
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('gemini_empty_response');
    }
    const parsed = parseOrganizerResponse(text);
    if (!parsed) {
      // Surfaces as `error_kind = 'shape'` via `classifyError` in the dispatcher's
      // catch block, which is fallback-eligible (insertSafeReply).
      const err = new Error('organizer_json_parse_failed') as Error & {
        kind?: 'shape';
      };
      err.kind = 'shape';
      throw err;
    }
    return parsed;
  },

  // No applyServerGuards — Organizer has no Layer B / draft / active-workout
  // policy overrides. The product contract is enforced by the prompt + strict
  // responseSchema; the only server-side gate is the writes feature flag, which
  // belongs in `persist` because it consumes ctx-scoped env state, not parsed
  // shape.

  async persist(parsed, ctx): Promise<RpcEnvelope> {
    const env = readDispatcherEnv();
    const writesEnabled = env.ORGANIZER_WRITES_ENABLED;
    const writeGate = gateOrganizerWrite(parsed, writesEnabled);
    const supabase: SharedSupabaseClient = ctx.supabase;

    // Legacy passes `parent_id ?? message.id` (organizer-agent-dispatch/index.ts:599-602);
    // ctx.threadId is computed identically by `build-context.ts:44`.
    const result = await organizerCreateReplyAndTask(supabase, {
      p_bubble_id: ctx.message.bubble_id!,
      p_organizer_user_id: ctx.agent.auth_user_id,
      p_parent_id: ctx.threadId,
      p_reply_content: parsed.replyContent,
      p_task_title: writeGate.p_task_title,
      p_task_description: writeGate.p_task_description,
      p_task_due_on: writeGate.p_task_due_on,
      p_task_assignee_user_id: writeGate.p_task_assignee_user_id,
    });

    if (!result.ok) {
      log('error', 'organizer persist rpc failed', {
        request_id: ctx.requestId,
        slug: ORGANIZER_SLUG,
        message_id: ctx.message.id,
        bubble_id: ctx.message.bubble_id ?? undefined,
        phase: 'persisted',
        error: result.error,
      });
      throw new Error(`rpc_failed:${result.error}`);
    }

    // Strategy-owned 'persisted' log line. Keep it metadata-only: proposed writes
    // may include user-provided meeting notes or task descriptions.
    const data = (result.data ?? {}) as { created_task_id?: unknown; reply_message_id?: unknown };
    const createdTaskId = typeof data.created_task_id === 'string' ? data.created_task_id : null;
    const replyMessageId = typeof data.reply_message_id === 'string' ? data.reply_message_id : null;
    log('info', 'organizer write intent', {
      request_id: ctx.requestId,
      slug: ORGANIZER_SLUG,
      message_id: ctx.message.id,
      bubble_id: ctx.message.bubble_id ?? undefined,
      phase: 'persisted',
      writes_enabled: writesEnabled,
      proposed_write_kind: parsed.proposedWrite?.kind ?? null,
      created_task_id: createdTaskId,
      reply_message_id: replyMessageId,
    });

    return { ok: true, data: result.data };
  },
};
