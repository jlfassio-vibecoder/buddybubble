# Phase 2 — Coach strategy + `agent-dispatch-v2` entry

> Port the entire Coach pipeline (the hardest agent) onto the new shared foundations.
> Stand up `agent-dispatch-v2` as a parallel function. **No webhook is moved yet.**
> The legacy `bubble-agent-dispatch` continues to handle every Coach message in
> production until Phase 3 cuts the webhook over.

## Inputs

- Phase 1 merged. `_shared/llm`, `_shared/dispatch`, `_shared/obs`, `_shared/env.ts`,
  and the `AgentStrategy` types are available.
- `bb-agent-dispatch` SA + Vertex API enabled (Phase 0).
- The legacy Coach dispatcher remains at
  `supabase/functions/bubble-agent-dispatch/index.ts` and is still receiving traffic.

## Deliverables

Files to **create**:

1. `src/lib/agents/coach/config.ts` — model id, temperature, maxOutputTokens,
   `safeReplyText`, intake enums.
2. `src/lib/agents/coach/schema.ts` — the `responseSchema` literal (lifted verbatim
   from `bubble-agent-dispatch/index.ts:704`–`:860`).
3. `src/lib/agents/coach/prompts.ts` — `baseCoachPrompt`, the workout-open greeting
   prompt, the mid-workout directives, the active-execution-state directive. All
   string constants currently inlined in `bubble-agent-dispatch/index.ts:1548`–`:1573`,
   `:211`–`:218`, and `:1486`–`:1497`.
4. `src/lib/agents/coach/parse.ts` — pure parser exports:
   `parseCoachJson(text): CoachGeminiJsonResponse`, plus the helpers
   `coalesceTaskDescription`, `coalesceUpdatedTaskDescription`,
   `parseProposedWorkoutMetadata`, `parseExecutionPatchFromGemini`,
   `parseIntakePhase`, `parseSessionReadinessScore`,
   `parseMissingIntakeCategories`, `parseUserRequestedImmediateCard`,
   `parseSessionRequest`, `parseCoachTaskNotes`, `ensureCoachTaskNotesCta`,
   `sanitizeNumericString`, `stripMarkdownCodeFences`. Lift verbatim from
   `bubble-agent-dispatch/index.ts:317`–`:653`.
5. `src/lib/agents/coach/parse.test.ts` — Vitest suite. Port every existing edge case
   (alternate keys like `taskDescription`, oversized text → truncation, malformed
   `execution_patch` numeric fields, missing `task_description` on `create_card: true`,
   etc.). Coach has the most fragile parser; this is the highest-value test surface.
6. `src/lib/agents/coach/context.ts` — `fetchCoachUserContext(supabase, userId, bubbleId)`
   pure-ish module that returns the user/profile/last-workout/next-workout block.
   Port from `bubble-agent-dispatch/index.ts:1096`–`:1260`. Keep the prompt-tail copy
   intact (`'Use this context to highly personalize your advice…'`).
7. `src/lib/agents/coach/strategy.ts` — implements `AgentStrategy<CoachGeminiJsonResponse>`:
   - `slug: 'coach'`
   - `model: COACH_MODEL` (default `gemini-2.5-flash`)
   - `routing`: `{ acceptMention: true, acceptRootDefault: true,
acceptThreadContinuation: true, requireBubbleBinding: true }`
   - `preflight`: workout-player silent sentinel branch (see "Preflight" below).
   - `buildSystemPrompt`: composes `baseCoachPrompt` + optional CURRENT WORKOUT
     CONTEXT + mid-workout directive + active-execution directive + CURRENT TASK
     CONTEXT + USER CONTEXT, mirroring `:1637`–`:1645`.
   - `buildContents`: maps history rows + the trigger row, with the workout-sentinel
     filter (`shouldExcludeWorkoutSentinelFromHistory`).
   - `parse`: delegates to `parseCoachJson`.
   - `applyServerGuards`: implements **Layer B turn gate** + **active-workout clamp**
     - **draft-vs-create routing** (see "Server guards" below).
   - `persist`: chooses between `agent_create_card_and_reply` and
     `agent_insert_coach_workout_draft_reply` based on the guarded payload.
   - `safeReplyText`: `"I experienced a technical hiccup calculating your workout. Could you repeat that?"` (matches `:1747`).
8. `supabase/functions/agent-dispatch-v2/index.ts` — the new entry. Coach-only registry.
   Wires up `verifyAndParseWebhook` → `resolveAgent` → `loadStrategy` →
   `buildContext` → `strategy.preflight?` → `vertex-gemini.generateContent` →
   `strategy.parse` → `strategy.applyServerGuards?` → `strategy.persist`. On any
   classified LLM error, calls `insertSafeReply` and returns HTTP 200.
9. `supabase/functions/agents/coach.ts` — re-exports the strategy from
   `src/lib/agents/coach/strategy.ts` so Deno can import it without crossing the
   `_shared` boundary. (See Phase 1 mirror-vs-import note.)
10. `supabase/functions/agents/index.ts` — the registry:
    `export const REGISTRY = { coach: CoachStrategy } as const;`
11. `docs/agents/vertex-setup.md` — short ops doc capturing the GCP project + SA + key
    rotation procedure (cross-link from `docs/agents/coach/README.md`).

Files to **modify**:

- `supabase/config.toml` — add (if not already from Phase 1):

  ```toml
  # Authentication: AGENT_WEBHOOK_SECRET in the function (Bearer or x-agent-secret).
  # Consolidated dispatcher (parallel deploy alongside legacy *-agent-dispatch).
  [functions.agent-dispatch-v2]
  verify_jwt = false
  ```

Files **not** touched in this phase:

- `supabase/functions/bubble-agent-dispatch/index.ts` — keep running.
- `supabase/functions/buddy-agent-dispatch/index.ts`
- `supabase/functions/organizer-agent-dispatch/index.ts`
- Any DB webhook configuration (Phase 3 moves the Coach webhook).

## Preflight: workout-player silent sentinel

Coach has a special pre-flight path for the silent workout-open sentinel. Before
calling the main JSON Coach flow, the strategy detects:

```ts
isWorkoutContextSentinel(ctx.message);
// i.e. metadata.is_silent_sentinel === true && metadata.workout_context.source === 'workout_player'
```

When matched, `preflight` returns a `short_circuit_with_reply` action whose payload
mirrors `bubble-agent-dispatch/index.ts:1479`–`:1543`:

1. Build the dedicated short greeting prompt (port `geminiGenerateWorkoutOpenGreeting`
   inputs at `:1486`–`:1502`).
2. Call Vertex with the **smaller** `responseSchema` (only `reply_content`) and a
   higher temperature (`0.35`) and lower `maxOutputTokens` (`512`) — see
   `:907`–`:921`.
3. Persist via `agent_create_card_and_reply` with `p_create_card: false` and
   `p_execution_patch: null`.

The dispatcher honors the short-circuit and skips the main Coach flow when this
returns.

## Server guards (`applyServerGuards`)

Encode Coach's three policy overrides as pure transformations on the parsed
`CoachGeminiJsonResponse`:

1. **Draft override** when `knownTargetTaskId` is set and `update_existing_task` is
   true → clear `create_card`, `task_title`, `task_description`,
   `coach_task_notes`. (Port from `:1683`–`:1688`.)
2. **Layer B turn gate** when `user_requested_immediate_card` is false:
   - First user turn (`priorUserMessageCount === 0`) → block card creation.
   - Early `session_request` (priorUserMessageCount < 2) → block card creation.

   Either branch clears `create_card`, `task_title`, `task_description`,
   `coach_task_notes`. (Port from `:1690`–`:1707`.)

3. **Active-workout clamp** when `currentWorkoutContextJson != null` → clear
   `create_card`, `task_title`, `task_description`, `coach_task_notes`,
   `update_existing_task`, `updated_task_title`, `updated_task_description`,
   `proposed_workout_metadata`. Only `execution_patch` survives. (Port from
   `:1716`–`:1725`.)

The strategy must compute `priorUserMessageCount` and `currentWorkoutContextJson`
**before** parsing — pass them in via `DispatchContext.coach` (a Coach-specific
context fragment) or via `applyServerGuards`'s `ctx`. Either is fine; the test cases
in `parse.test.ts` should exercise the three overrides as separate
`applyCoachServerGuards(parsed, fixtureCtx)` calls.

## Persistence (`persist`)

Replicate the branching at `bubble-agent-dispatch/index.ts:1773`–`:1824`:

```text
if knownTargetTaskId && updateExistingTask && (hasUpdateBody || hasProposedMeta):
  call agent_insert_coach_workout_draft_reply with:
    p_proposed_title, p_proposed_description, p_proposed_metadata, p_execution_patch
else:
  call agent_create_card_and_reply with:
    p_create_card, p_task_title, p_task_description (only when create_card),
    p_seed_task_comment_text (only when create_card),
    p_execution_patch
```

Both RPCs must receive `p_thread_id = parent_id ?? message.id`. The thread-root
contract is enforced server-side (the RPC raises if you violate it; see
`agent_insert_coach_workout_draft_reply: p_thread_id must equal thread root` at
`supabase/migrations/20260623120000_coach_workout_draft_messages_metadata.sql:96`–`:99`).

## `agent-dispatch-v2/index.ts` skeleton

```ts
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { readDispatcherEnv } from '../_shared/env.ts';
import { verifyAndParseWebhook } from '../_shared/dispatch/webhook.ts';
import { log } from '../_shared/obs/log.ts';
import { generateContent, classifyError } from '../_shared/llm/vertex-gemini.ts';
import { insertSafeReply } from '../_shared/dispatch/fallback.ts';
import { REGISTRY } from '../agents/index.ts';
import { resolveAgent } from './resolve.ts'; // strategy-aware resolver

const env = readDispatcherEnv(); // throws once at boot if misconfigured

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const parsed = await verifyAndParseWebhook(req, env.webhookSecret);
  if (!parsed.ok) return parsed.response;
  const { payload, requestId } = parsed;

  const supabase = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const message = normalizeMessage(payload.record);

  log('info', 'received', {
    request_id: requestId,
    message_id: message.id,
    bubble_id: message.bubbleId,
  });

  // Loop guard.
  if (await isAuthorAnAgent(supabase, message.userId)) {
    return jsonOk({ skipped: 'author_is_agent' });
  }

  const resolved = await resolveAgent(supabase, message, REGISTRY);
  if (!resolved) return jsonOk({ skipped: 'not_handled' });

  const strategy = REGISTRY[resolved.slug];
  log('info', 'routed', { request_id: requestId, slug: resolved.slug, message_id: message.id });

  const ctx = await buildDispatchContext({ supabase, message, agent: resolved, requestId, env });

  // Pre-flight: handles Coach's workout-open silent sentinel.
  if (strategy.preflight) {
    const action = await strategy.preflight(ctx);
    if (action?.kind === 'short_circuit_with_reply') {
      return await runShortCircuit(strategy, ctx, action);
    }
    if (action?.kind === 'skip') {
      return jsonOk({ skipped: action.reason });
    }
  }

  let parsedResp;
  try {
    const systemPrompt = await strategy.buildSystemPrompt(ctx);
    const contents = await strategy.buildContents(ctx);
    log('info', 'llm_call', { request_id: requestId, slug: resolved.slug, model: strategy.model });
    const json = await generateContent({
      project: env.gcpProjectId,
      location: env.gcpLocation,
      model: strategy.model,
      systemPrompt,
      contents,
      generationConfig: {
        temperature: strategy.temperature,
        maxOutputTokens: strategy.maxOutputTokens,
        responseMimeType: 'application/json',
        responseSchema: strategy.responseSchema,
      },
      timeoutMs: env.llmTimeoutMs,
      signal: ctx.signal,
    });
    log('info', 'llm_done', { request_id: requestId, slug: resolved.slug });
    parsedResp = strategy.parse(json, ctx);
    log('info', 'parsed', { request_id: requestId, slug: resolved.slug });
    if (strategy.applyServerGuards) {
      parsedResp = strategy.applyServerGuards(parsedResp, ctx);
      log('info', 'guarded', { request_id: requestId, slug: resolved.slug });
    }
    const rpc = await strategy.persist(parsedResp, ctx);
    log('info', 'persisted', { request_id: requestId, slug: resolved.slug });
    return jsonOk({ ok: true, result: rpc.data });
  } catch (e) {
    const kind = classifyError(e);
    log('error', 'fallback', {
      request_id: requestId,
      slug: resolved.slug,
      error_kind: kind,
    });
    if (isFallbackEligible(kind)) {
      const r = await insertSafeReply(supabase, ctx, strategy.safeReplyText);
      if (r.error) return json500({ error: 'fallback_rpc_failed', detail: r.error.message });
      return jsonOk({ fallback_reply_inserted: true, result: r.data });
    }
    return json500({ error: 'dispatch_failed', detail: String(e) });
  }
});
```

`isFallbackEligible(kind)` returns true for `http`, `parse`, `shape`, `timeout`,
`auth`. For `auth` errors specifically, log as `level: 'error'` so monitoring can
alert (an SA token failure is operationally distinct from an LLM timeout).

## Routing in `resolveAgent`

Implement against the strategy's `RoutingDescriptor`:

1. Load `bubble_agent_bindings` for `message.bubbleId` (only entries where the slug
   has a registered strategy).
2. For each registered strategy in priority order
   (Coach > Buddy > Organizer; same as legacy `sortAgentEntries.ts`):
   - If `routing.implicitTrigger?.(message)` matches → return that strategy.
   - If `routing.acceptMention` and the message mentions the agent's `mention_handle`
     and no slug in `routing.excludeOnMentionOf` is also mentioned → return.
3. If no mention matched, for the first registered strategy with
   `routing.acceptRootDefault` and no `parent_id` and `metadata.default_agent_slug`
   matches that slug → return.
4. If still none matched, for each registered strategy with
   `routing.acceptThreadContinuation` and `parent_id` set → load thread history once,
   find the first authoring agent in the thread that matches a registered strategy →
   return.
5. Otherwise return null.

The thread-history fetch must be **shared** with `buildContents` to avoid
double-querying. Cache it on `DispatchContext.history`.

## Verification

1. Deploy locally: `supabase functions serve agent-dispatch-v2 --env-file .env.local`.
2. Smoke script (write `scripts/smoke-agent-dispatch-v2.ts`) that posts a synthetic
   webhook payload (a `messages` INSERT for a Coach-bound bubble) and asserts the
   reply row appears.
3. Vitest:
   - `pnpm test src/lib/agents/coach/parse.test.ts` passes (port the existing
     edge cases from the inline parser code).
   - Add `src/lib/agents/coach/strategy.guards.test.ts` for the three Layer B / draft
     / active-workout clamps.
4. Manually invoke against a staging bubble with a known Coach binding:
   - First-turn message → no card created (Layer B).
   - "Just put it on a card now" → card created (waiver).
   - Workout-player silent sentinel → short greeting reply, no card.
   - Mid-workout `execution_patch` request → reply with patch on the same INSERT
     (verify in the `messages.metadata` row).
5. Compare a sample of staging replies against the legacy dispatcher's output for the
   same prompts. Substantive shape parity (same `create_card` decisions, same
   `execution_patch` structure) is the bar; verbatim text equality is not expected
   because Vertex Gemini and Generative Language Gemini emit slightly different
   tokens for the same prompt.

## Risk + rollback

- The legacy `bubble-agent-dispatch` function is untouched; production traffic
  continues to flow there. `agent-dispatch-v2` exists but no DB webhook points at it.
- If `agent-dispatch-v2` is broken, revert the PR; legacy continues unaffected.
- The new function shares the same `agent_message_runs` dedupe table as legacy. If
  both functions are accidentally pointed at the same webhook in a later phase, the
  RPC's `(trigger_message_id, agent_auth_user_id)` PK collapses the duplicate into a
  single reply (idempotency holds).

## Hand-off to next phase

Phase 3 expects:

- `agent-dispatch-v2` deployed and reachable.
- Coach strategy verified against staging webhooks.
- Smoke script committed.
- Coach `parse.test.ts` and `strategy.guards.test.ts` passing in CI.
