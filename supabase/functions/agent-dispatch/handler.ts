/**
 * Consolidated agent dispatcher — request handler.
 *
 * This module owns the entire dispatch pipeline. It is exported as a plain
 * `(req: Request) => Promise<Response>` function so it can be:
 *
 * 1. Registered with `Deno.serve(...)` from `./index.ts` in production.
 * 2. Imported and called directly from Deno integration tests
 *    (`./index.integration.test.ts`) without spinning up a server port.
 *
 * Splitting `handleDispatchRequest` out of `index.ts` deliberately replaces
 * the previous `if (import.meta.main) Deno.serve(...)` pattern. In Supabase's
 * Edge runtime the entry module is sometimes imported with
 * `import.meta.main = false` during the bundle/serve handshake, which would
 * silently leave the function with no registered handler. Keeping `index.ts`
 * at "import + Deno.serve(handleDispatchRequest)" guarantees production
 * deploys always register a handler, and tests never accidentally start a
 * server.
 *
 * Pipeline (mirrors the phase doc):
 *
 *   handleDispatchRequest
 *     → verifyAndParseWebhook            (HTTP 200 on auth/skip per legacy contract)
 *     → loop guard (author-is-agent)
 *     → resolveAgent
 *     → buildDispatchContext
 *     → strategy.preflight (short_circuit_with_reply | skip | null)
 *     → generateContent  (Vertex AI Gemini publisher API)
 *     → strategy.parse
 *     → strategy.applyServerGuards?
 *     → strategy.persist
 *     → JSON 200 { ok: true, result }
 *
 *   Errors → classifyError → isFallbackEligible? insertSafeReply : 500
 *
 * Every phase emits one structured `log()` line with `request_id`, `slug`,
 * `message_id`, `bubble_id`, `phase`, plus `model`, `latency_ms`, `http_status`,
 * `error_kind` as appropriate.
 *
 * Secrets: see `docs/refactor/vertex-agent-dispatch-consolidation/secrets-matrix.md`.
 * Deploy with `verify_jwt = false` (already set in `supabase/config.toml` from Phase 1).
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { readDispatcherEnv } from '../_shared/env.ts';
import { log, type DispatchPhase, type LogFields } from '../_shared/obs/log.ts';
import { CORS_HEADERS, verifyAndParseWebhook } from '../_shared/dispatch/webhook.ts';
import { classifyError, generateContent } from '../_shared/llm/vertex-gemini.ts';
import { agentCreateCardAndReply } from '../_shared/dispatch/rpc.ts';
import { insertSafeReply } from '../_shared/dispatch/fallback.ts';
import type {
  AgentStrategy,
  DispatchContext,
  NormalizedMessage,
  PreflightAction,
  SupabaseClient,
} from '../_shared/dispatch/types.ts';
import type { VertexErrorKind } from '../_shared/llm/types.ts';

import { REGISTRY_ITERATION_ORDER, getStrategy } from '../agents/index.ts';
import { buildDispatchContext } from './build-context.ts';
import { resolveAgent } from './resolve.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}

function baseFields(
  requestId: string,
  message?: Pick<NormalizedMessage, 'id' | 'bubble_id'> | null,
  slug?: string | null,
  phase?: DispatchPhase,
): LogFields {
  const fields: LogFields = { request_id: requestId };
  if (message?.id) fields.message_id = message.id;
  if (message?.bubble_id) fields.bubble_id = message.bubble_id;
  if (slug) fields.slug = slug;
  if (phase) fields.phase = phase;
  return fields;
}

/**
 * Loop guard: skip the dispatch if the trigger author is itself a registered agent.
 *
 * Phase 2 hardening — DELIBERATELY broader than the legacy filter at
 * `bubble-agent-dispatch/index.ts:1312-1317`, which scoped the lookup to
 * `is_active = true`. v2 short-circuits on ANY `agent_definitions` row matching the
 * author, including deactivated agents, so a temporarily-disabled agent that gets
 * replayed into `messages` cannot trigger a self-reply loop. Do not re-introduce the
 * `is_active = true` filter without coordinating with the soak-log review.
 */
async function isAuthorAnAgent(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ matched: boolean; error?: string }> {
  const table = supabase.from('agent_definitions') as unknown as {
    select: (cols: string) => {
      eq: (
        col: string,
        val: unknown,
      ) => {
        maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
  };
  const result = await table.select('id').eq('auth_user_id', userId).maybeSingle();
  if (result.error) return { matched: false, error: result.error.message };
  return { matched: result.data != null };
}

function isFallbackEligible(kind: VertexErrorKind): boolean {
  return (
    kind === 'http' || kind === 'parse' || kind === 'shape' || kind === 'timeout' || kind === 'auth'
  );
}

async function runShortCircuit(
  ctx: DispatchContext,
  action: Extract<PreflightAction, { kind: 'short_circuit_with_reply' }>,
): Promise<Response> {
  const args = {
    ...action.rpcArgs,
    p_trigger_message_id: ctx.message.id,
    p_thread_id: ctx.threadId,
    p_agent_auth_user_id: ctx.agent.auth_user_id,
    p_invoker_user_id: ctx.message.user_id,
    p_reply_text: action.replyText,
  } as Parameters<typeof agentCreateCardAndReply>[1];
  const startedAt = Date.now();
  const result = await agentCreateCardAndReply(ctx.supabase, args);
  const latency = Date.now() - startedAt;
  if (!result.ok) {
    log(
      'error',
      'preflight short-circuit RPC failed',
      baseFields(ctx.requestId, ctx.message, ctx.agent.slug, 'preflight'),
    );
    return jsonResponse({ ok: false, error: 'rpc_failed', detail: result.error }, 500);
  }
  log('info', 'preflight short-circuit ok', {
    ...baseFields(ctx.requestId, ctx.message, ctx.agent.slug, 'preflight'),
    latency_ms: latency,
  });
  return jsonResponse({ ok: true, preflight_short_circuit: true, result: result.data }, 200);
}

export async function handleDispatchRequest(req: Request): Promise<Response> {
  const dispatchStartedAt = Date.now();
  let env: ReturnType<typeof readDispatcherEnv>;
  try {
    env = readDispatcherEnv();
  } catch (err) {
    const requestId = crypto.randomUUID();
    log('error', 'dispatcher env invalid', {
      request_id: requestId,
      error: err instanceof Error ? err.message : String(err),
    });
    return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500);
  }

  const verify = await verifyAndParseWebhook(req, env.AGENT_WEBHOOK_SECRET);
  if (!verify.ok) return verify.response;

  const { record, requestId } = verify;
  log('info', 'webhook received', baseFields(requestId, record, null, 'received'));

  const supabase: SupabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as SupabaseClient;

  // Loop guard.
  const guardResult = await isAuthorAnAgent(supabase, record.user_id);
  if (guardResult.error) {
    log('error', 'agent self lookup failed', {
      ...baseFields(requestId, record, null, 'received'),
      error: guardResult.error,
    });
    return jsonResponse({ ok: false, error: 'agent_lookup_failed' }, 200);
  }
  if (guardResult.matched) {
    log('info', 'loop guard skip (author is agent)', baseFields(requestId, record));
    return jsonResponse({ ok: true, skipped: 'author_is_agent' }, 200);
  }

  // Routing.
  const resolution = await resolveAgent({
    supabase,
    message: record,
    registry: REGISTRY_ITERATION_ORDER,
    requestId,
  });
  if (resolution == null || 'skipped' in resolution) {
    const reason = resolution == null ? 'no_strategy_registered' : resolution.reason;
    log('info', 'routing skip', {
      ...baseFields(requestId, record, null, 'routed'),
      skip_reason: reason,
    });
    return jsonResponse({ ok: true, skipped: reason }, 200);
  }
  const strategy = getStrategy(resolution.slug);
  if (!strategy) {
    log('error', 'resolved slug missing from registry', {
      ...baseFields(requestId, record, resolution.slug, 'routed'),
    });
    return jsonResponse({ ok: true, skipped: 'strategy_missing' }, 200);
  }
  log('info', 'routed to strategy', baseFields(requestId, record, strategy.slug, 'routed'));

  // Build context.
  const ctx = await buildDispatchContext({
    supabase,
    message: record,
    agent: resolution.agent,
    requestId,
    llmTimeoutMs: env.LLM_TIMEOUT_MS,
    history: resolution.history,
  });

  // Preflight.
  let preflight: PreflightAction | null = null;
  if (strategy.preflight) {
    try {
      preflight = await strategy.preflight(ctx);
    } catch (err) {
      log('error', 'strategy preflight threw', {
        ...baseFields(requestId, record, strategy.slug, 'preflight'),
        error: err instanceof Error ? err.message : String(err),
      });
      return jsonResponse({ ok: false, error: 'preflight_failed' }, 500);
    }
  }
  if (preflight && preflight.kind === 'short_circuit_with_reply') {
    return runShortCircuit(ctx, preflight);
  }
  if (preflight && preflight.kind === 'skip') {
    log('info', 'preflight skip', {
      ...baseFields(requestId, record, strategy.slug, 'preflight'),
      skip_reason: preflight.reason,
    });
    return jsonResponse({ ok: true, skipped: preflight.reason }, 200);
  }

  // Main path: build prompt + contents, call Vertex, parse, guard, persist.
  try {
    const systemPrompt = await strategy.buildSystemPrompt(ctx);
    const contents = await strategy.buildContents(ctx);

    log('info', 'llm call begin', {
      ...baseFields(requestId, record, strategy.slug, 'llm_call'),
      model: strategy.model,
    });
    const startedAt = Date.now();
    const response = await generateContent({
      project: env.GCP_PROJECT_ID,
      location: env.GCP_LOCATION,
      model: strategy.model,
      systemPrompt,
      contents,
      generationConfig: {
        temperature: strategy.temperature,
        maxOutputTokens: strategy.maxOutputTokens,
        responseMimeType: 'application/json',
        responseSchema: strategy.responseSchema,
      },
      timeoutMs: env.LLM_TIMEOUT_MS,
      signal: ctx.signal,
      env: { GCP_SERVICE_ACCOUNT_JSON: env.GCP_SERVICE_ACCOUNT_JSON },
      debug: env.LLM_DEBUG,
      slug: strategy.slug,
      requestId,
    });
    log('info', 'llm done', {
      ...baseFields(requestId, record, strategy.slug, 'llm_done'),
      model: strategy.model,
      latency_ms: Date.now() - startedAt,
      token_in: response.usageMetadata?.promptTokenCount,
      token_out: response.usageMetadata?.candidatesTokenCount,
    });

    const parsed = (strategy as AgentStrategy<unknown>).parse(response, ctx);
    log('info', 'parsed', baseFields(requestId, record, strategy.slug, 'parsed'));

    let guarded: unknown = parsed;
    if (strategy.applyServerGuards) {
      guarded = (strategy as AgentStrategy<unknown>).applyServerGuards!(parsed, ctx);
      log('info', 'guarded', baseFields(requestId, record, strategy.slug, 'guarded'));
    }

    const persistResult = await (strategy as AgentStrategy<unknown>).persist(guarded, ctx);
    log('info', 'persisted', baseFields(requestId, record, strategy.slug, 'persisted'));

    log('info', 'dispatch done', {
      ...baseFields(requestId, record, strategy.slug, 'done'),
      latency_ms: Date.now() - dispatchStartedAt,
    });
    return jsonResponse({ ok: true, result: persistResult }, 200);
  } catch (err: unknown) {
    const kind = classifyError(err);
    // `vertex-gemini.ts` throws POJO `VertexClassifiedError` shapes ({ kind, status, body, detail })
    // — never an Error subclass — so `err.message` would be undefined and `String(err)` would
    // yield "[object Object]". Pull the classified fields out so soak-log queries on
    // `error_kind=http` actually surface the Vertex response body.
    const pojo = (err && typeof err === 'object' ? (err as Record<string, unknown>) : {}) as {
      body?: unknown;
      detail?: unknown;
      status?: unknown;
    };
    const errorMessage =
      err instanceof Error
        ? err.message
        : pojo.body !== undefined
          ? typeof pojo.body === 'string'
            ? pojo.body
            : JSON.stringify(pojo.body)
          : typeof pojo.detail === 'string'
            ? pojo.detail
            : String(err);
    const status = typeof pojo.status === 'number' ? pojo.status : undefined;

    if (kind === 'auth') {
      log('error', 'vertex auth failed', {
        ...baseFields(requestId, record, strategy?.slug),
        error_kind: kind,
        error: errorMessage,
        http_status: status,
      });
    } else {
      log('warn', 'dispatch failed', {
        ...baseFields(requestId, record, strategy?.slug),
        error_kind: kind,
        error: errorMessage,
        http_status: status,
      });
    }

    if (isFallbackEligible(kind)) {
      // Phase 5: prefer the strategy's own `safeReplyInsert` hook when defined so
      // strategies whose `auth_user_id` is not provisioned for `agent_create_card_and_reply`
      // (e.g. Buddy → `buddy_create_onboarding_reply`) can land their fallback
      // reply via the correct RPC. Coach + Organizer leave the field undefined and
      // fall through to the universal `insertSafeReply` path.
      const fallback = strategy.safeReplyInsert
        ? await strategy.safeReplyInsert(ctx, strategy.safeReplyText)
        : await insertSafeReply(ctx, strategy.safeReplyText);
      log(fallback.ok ? 'info' : 'error', 'fallback insertion', {
        ...baseFields(requestId, record, strategy.slug, 'fallback'),
        error_kind: kind,
        fallback_ok: fallback.ok,
      });
      if (!fallback.ok) {
        return jsonResponse({ ok: false, error: 'dispatch_failed', detail: errorMessage }, 500);
      }
      return jsonResponse({ ok: true, fallback_reply_inserted: true, result: fallback.data }, 200);
    }

    return jsonResponse({ ok: false, error: 'dispatch_failed', detail: errorMessage }, 500);
  }
}
