# Phase 5 — Port Buddy into `agent-dispatch-v2`

## Why this phase is harder than 2 or 4

Buddy has four routing rules that none of the previous strategies needed. They MUST move into the strategy + shared primitives without any `if (slug === 'buddy')` branches in `_shared/`:

- Workspace-global identity. Buddy has no `bubble_agent_bindings` rows by design ([`supabase/migrations/20260701150000_buddy_agent_rls_workspace_global.sql`](../../../supabase/migrations/20260701150000_buddy_agent_rls_workspace_global.sql)). The current resolver at [`supabase/functions/agent-dispatch-v2/resolve.ts`](../../../supabase/functions/agent-dispatch-v2/resolve.ts) only knows agents joined through that table — Buddy is invisible to it as written.
- "Previous bubble message authored by this agent" continuation, no `parent_id` required ([`supabase/functions/buddy-agent-dispatch/index.ts`](../../../supabase/functions/buddy-agent-dispatch/index.ts) lines 170–186). Coach/Organizer use thread continuation only.
- Onboarding sentinel `[SYSTEM_EVENT: ONBOARDING_STARTED]` as an implicit trigger plus a user-turn replacement string when that trigger fires ([`supabase/functions/buddy-agent-dispatch/index.ts`](../../../supabase/functions/buddy-agent-dispatch/index.ts) lines 451–453).
- `excludeOnMentionOf: ['coach']` even when Coach is not bound to the current bubble ([`supabase/functions/buddy-agent-dispatch/index.ts`](../../../supabase/functions/buddy-agent-dispatch/index.ts) lines 391–397).

Plus: Buddy's RPC `buddy_create_onboarding_reply` ([`supabase/migrations/20260701140000_buddy_rpc.sql`](../../../supabase/migrations/20260701140000_buddy_rpc.sql)) has no idempotency primitive, and the universal fallback `insertSafeReply` ([`supabase/functions/_shared/dispatch/fallback.ts`](../../../supabase/functions/_shared/dispatch/fallback.ts)) calls `agent_create_card_and_reply` — which was never designed to accept Buddy's `auth_user_id`.

## Inputs

- Phase 4 complete. Coach + Organizer are on v2.
- Legacy `buddy-agent-dispatch` still receives Buddy traffic via `buddy_dispatch_webhook`.
- Branch: `agent/buddy-strategy-port` cut from `main` after Phase 4 PR #89 merges.

## Architectural decisions (locked before implementation)

1. **Resolver refactor — single-query split.** Rewrite [`supabase/functions/agent-dispatch-v2/resolve.ts`](../../../supabase/functions/agent-dispatch-v2/resolve.ts) to do TWO targeted queries:
   - Query A: `agent_definitions WHERE slug IN <registered slugs> AND is_active` (no bindings join). Builds the canonical `defBySlug` map every routing rule reads from. Workspace-global agents (Buddy) and exclusion-only agents (Coach when not bound) both land here.
   - Query B: today's `bubble_agent_bindings` query, narrowed to `select sort_order, slug` only. Builds a `boundSlugs: Set<string>` membership set.
   - Routing rules:
     - Implicit trigger / mention / continuation walks gate `requireBubbleBinding === true` strategies on `boundSlugs.has(strategy.slug)`. `requireBubbleBinding === false` strategies (Buddy) match without the gate.
     - Iteration order remains driven by `bindings.sort_order` for bound strategies, then unbound strategies in `REGISTRY_ITERATION_ORDER` order so Buddy is deterministic without inventing a sort key.
     - `excludeOnMentionOf` lookup uses `defBySlug` (always present for any registered slug), not `boundSlugs`.
2. **`AgentStrategy.safeReplyInsert?(ctx, text): Promise<RpcResult>` hook.** Add to the contract in [`supabase/functions/_shared/dispatch/types.ts`](../../../supabase/functions/_shared/dispatch/types.ts) and its mirror at [`src/lib/agents/_shared/dispatch/types.ts`](../../../src/lib/agents/_shared/dispatch/types.ts). Dispatcher prefers it when present:

   ```ts
   const fallback = strategy.safeReplyInsert
     ? await strategy.safeReplyInsert(ctx, strategy.safeReplyText)
     : await insertSafeReply(ctx, strategy.safeReplyText);
   ```

   BuddyStrategy implements it via `buddyCreateOnboardingReply` with `p_card_*: null`. Coach/Organizer leave it undefined and keep today's behavior.

3. **`RoutingDescriptor.continuationLookback?: 'thread' | 'bubble'`** with default `'thread'`. Buddy sets `'bubble'`. Resolver behavior:
   - When `message.parent_id == null` and any registered strategy has `acceptThreadContinuation && continuationLookback === 'bubble'`, do a single bubble-scoped lookup of the immediate prior message (limit 2, exclude trigger row, ordered DESC) and check `prev.user_id === def.auth_user_id`. Mirrors [`supabase/functions/buddy-agent-dispatch/index.ts`](../../../supabase/functions/buddy-agent-dispatch/index.ts) lines 170–186.
   - Existing `parent_id != null` thread continuation walk is unchanged.
4. **Module layout mirrors Coach/Organizer.** The original Phase 5 spec's "create `supabase/functions/agents/buddy.ts`" shorthand is replaced with the established pattern: pure modules canonical at `src/lib/agents/buddy/{config,schema,prompts,parse}.ts` with byte-for-byte Deno mirrors at `supabase/functions/agents/buddy/{config,schema,prompts,parse}.ts`. The strategy is Deno-only at `supabase/functions/agents/buddy/strategy.ts`.
5. **Hard cutover (no parallel soak), same as Organizer.** `buddy_create_onboarding_reply` has no `agent_message_runs` dedupe and no advisory lock — running both webhooks would surface duplicate Buddy replies. Disable `buddy_dispatch_webhook` in the SAME Dashboard session as the v2 deploy.

## Deliverables

### New files — canonical pure modules (Vitest side)

- `src/lib/agents/buddy/config.ts` — exports `BUDDY_SLUG`, `BUDDY_MODEL_DEFAULT = 'gemini-2.5-flash'`, `BUDDY_TEMPERATURE = 0.4`, `BUDDY_MAX_OUTPUT_TOKENS = 1024`, `BUDDY_SAFE_REPLY_TEXT = 'I had trouble loading that just now. Mind trying once more?'`, `BUDDY_ONBOARDING_SENTINEL = '[SYSTEM_EVENT: ONBOARDING_STARTED]'` (re-exports `ONBOARDING_SYSTEM_EVENT` from `_shared/dispatch/sentinel.ts` mirror), `BUDDY_IMPLICIT_TRIGGER_USER_TEXT` (the 1-paragraph implicit trigger replacement string from [`supabase/functions/buddy-agent-dispatch/index.ts`](../../../supabase/functions/buddy-agent-dispatch/index.ts) line 452).
- `src/lib/agents/buddy/schema.ts` — lifts `BUDDY_RESPONSE_SCHEMA` verbatim from [`supabase/functions/buddy-agent-dispatch/index.ts`](../../../supabase/functions/buddy-agent-dispatch/index.ts) lines 33–66.
- `src/lib/agents/buddy/prompts.ts` — moves `buddySystemPrompt` from [`supabase/functions/buddy-agent-dispatch/buddyPrompt.ts`](../../../supabase/functions/buddy-agent-dispatch/buddyPrompt.ts) here as the canonical source. The Deno mirror picks it up below; the legacy Deno path becomes a one-line shim re-exporting from the mirror.
- `src/lib/agents/buddy/parse.ts` — pure parser. Lifts the 4-step pipeline from [`supabase/functions/buddy-agent-dispatch/index.ts`](../../../supabase/functions/buddy-agent-dispatch/index.ts) lines 581–723 verbatim: `extractGeminiCandidateText`, `extractBalancedJsonAt`, `stripJsonCodeFences`, `sanitizeBuddyModelJsonText`, `parseBuddyJsonObject`, `parseBuddyResponse`. Re-exports `BuddyParsedResponse`, `BuddyCreateCard` types.
- `src/lib/agents/buddy/parse.test.ts` — Vitest assertions covering:
  - direct JSON object;
  - ` ```json ` fenced output and ` ``` ` (no language) variant;
  - "model forgot the closing fence" path (opening fence only);
  - prose preamble + JSON object;
  - leading BOM (`\uFEFF`);
  - multiple `{` candidates where the first is a junk object embedded in prose and the real one is later (balanced-brace walk);
  - empty `replyContent` rejected;
  - `createCard` present but missing one of `{title, description, action_type}` → card dropped, reply still returned;
  - `createCard: null` returned as `null`.

### New files — Deno mirrors (byte-for-byte; `MIRROR FILE` header at the top of each)

- `supabase/functions/agents/buddy/config.ts`
- `supabase/functions/agents/buddy/schema.ts`
- `supabase/functions/agents/buddy/prompts.ts`
- `supabase/functions/agents/buddy/parse.ts`

### New file — Deno-only Buddy strategy

- `supabase/functions/agents/buddy/strategy.ts` implements `AgentStrategy<BuddyParsedResponse>`:
  - `slug: BUDDY_SLUG`, `model: BUDDY_MODEL_DEFAULT`, `temperature: BUDDY_TEMPERATURE`, `maxOutputTokens: BUDDY_MAX_OUTPUT_TOKENS`, `responseSchema: BUDDY_RESPONSE_SCHEMA`, `safeReplyText: BUDDY_SAFE_REPLY_TEXT`.
  - `routing`: `{ acceptMention: true, acceptRootDefault: false, acceptThreadContinuation: true, requireBubbleBinding: false, excludeOnMentionOf: ['coach'], implicitTrigger: isBuddyOnboardingSentinel, continuationLookback: 'bubble' }`.
  - `buildSystemPrompt(ctx)` returns `buddySystemPrompt` (no per-message templating).
  - `buildContents(ctx)` mirrors [`fetchBuddyHistory`](../../../supabase/functions/buddy-agent-dispatch/index.ts) (lines 199–263):
    - If `ctx.message.parent_id` is set, prefer `ctx.history` (already loaded by the resolver via `loadThreadHistoryByParent` for thread continuations) — else fall back to a thread fetch that mirrors legacy's `or(id.eq.${parentId},parent_id.eq.${parentId})` shape using a local `MessagesTable` cast (same Deno cast pattern as `OrganizerStrategy.buildContents`).
    - If `ctx.message.parent_id == null`, fetch the last 12 bubble messages chronologically (DESC limit 12 → reverse → ASC).
    - Filter out empty content and any row matching `shouldExcludeBuddyOnboardingFromHistory` (already in [`supabase/functions/_shared/dispatch/sentinel.ts`](../../../supabase/functions/_shared/dispatch/sentinel.ts) line 80).
    - Map history through `toGeminiContents` from [`supabase/functions/_shared/dispatch/history.ts`](../../../supabase/functions/_shared/dispatch/history.ts) using `agentAuthIds = new Set([ctx.agent.auth_user_id])`.
    - Append the user turn. When `isBuddyOnboardingSentinel(ctx.message)`, the user-turn text is `BUDDY_IMPLICIT_TRIGGER_USER_TEXT` (the legacy line 452 paragraph). Otherwise it is `ctx.message.content`. As in Phase 4's Organizer fix, skip the push entirely if the resulting trigger text is empty after trim.
  - `parse(json, ctx)` calls `extractGeminiText` (shared helper from [`supabase/functions/_shared/llm/vertex-gemini.ts`](../../../supabase/functions/_shared/llm/vertex-gemini.ts)) then `parseBuddyResponse`. Throws `{ kind: 'shape', detail }` when null so the dispatcher's `classifyError → fallback` path engages.
  - `applyServerGuards`: NOT defined (omit the field entirely; the legacy file has no equivalent).
  - `persist(parsed, ctx)` calls `buddyCreateOnboardingReply` from [`supabase/functions/_shared/dispatch/rpc.ts`](../../../supabase/functions/_shared/dispatch/rpc.ts) with:
    - `p_bubble_id: ctx.message.bubble_id!`
    - `p_buddy_user_id: ctx.agent.auth_user_id`
    - `p_parent_id`: legacy threading rule from [`supabase/functions/buddy-agent-dispatch/index.ts`](../../../supabase/functions/buddy-agent-dispatch/index.ts) lines 539–542 — `parent_id` if present and non-empty, else the trigger `id`. NOT `ctx.threadId` (which is identical here, but be explicit so the legacy parity is auditable).
    - `p_reply_content: parsed.replyContent`
    - `p_card_title / p_card_desc / p_action_type` from `parsed.createCard` or `null`.
    - Emits ONE structured log line: `log('info', 'buddy persisted', { ...baseFields, has_card: parsed.createCard != null, action_type: parsed.createCard?.action_type ?? null, reply_message_id, created_task_id })`. The `replyContent` and `createCard.title/description` are NEVER logged (PII parity with Organizer Fix #1).
  - `safeReplyInsert(ctx, text)` calls `buddyCreateOnboardingReply` with `p_card_*: null` and `p_parent_id` resolved the same way as the happy path. Returns the `RpcResult` directly.

### New file — operator runbook

- `docs/refactor/vertex-agent-dispatch-consolidation/soak-log-buddy.md` — copy `soak-log-organizer.md` and adapt:
  - Note: hard cutover (no parallel soak) because `buddy_create_onboarding_reply` is not idempotent.
  - Soak window: 24 hours total but with a heightened first-hour watch (Buddy fires on every onboarding; spike risk).
  - Verification matrix mirrors the matrix below.
  - Rollback table aligns to the same `rolled_back` / `kept` decision strings used in the Organizer log.

### Files to modify

- [`supabase/functions/_shared/dispatch/types.ts`](../../../supabase/functions/_shared/dispatch/types.ts):
  - Extend `RoutingDescriptor` with `continuationLookback?: 'thread' | 'bubble';` (default `'thread'`).
  - Extend `AgentStrategy<TParsed>` with `safeReplyInsert?(ctx: DispatchContext, text: string): Promise<RpcResult>;` — return type matches `_shared/dispatch/fallback.ts`'s `insertSafeReply`.
  - Mirror both edits to [`src/lib/agents/_shared/dispatch/types.ts`](../../../src/lib/agents/_shared/dispatch/types.ts) byte-for-byte.

- [`supabase/functions/_shared/dispatch/sentinel.ts`](../../../supabase/functions/_shared/dispatch/sentinel.ts):
  - Add `export function isBuddyOnboardingSentinel(message: Pick<NormalizedMessage, 'content'>): boolean { return isExactSentinel(message, ONBOARDING_SYSTEM_EVENT); }`.
  - `shouldExcludeBuddyOnboardingFromHistory` already exists; no change.

- [`supabase/functions/agent-dispatch-v2/resolve.ts`](../../../supabase/functions/agent-dispatch-v2/resolve.ts) — single-query split refactor:
  - Replace the current bindings-joined query with two queries (Query A + Query B above).
  - Build `defBySlug` from Query A; build `boundSlugs: Set<string>` from Query B.
  - Each rule walk now applies the gate: `if (strategy.routing.requireBubbleBinding && !boundSlugs.has(strategy.slug)) continue;`.
  - For `excludeOnMentionOf`, look up handles via `defBySlug` (always present for any registered slug).
  - Add a fall-through inside Rule 4 for `continuationLookback === 'bubble'` when `message.parent_id == null`. Single SELECT mirroring legacy lines 171–177:
    ```ts
    const result = await table
      .select('id, user_id')
      .eq('bubble_id', message.bubble_id)
      .neq('id', message.id)
      .order('created_at', { ascending: false })
      .limit(2);
    ```
    For each `acceptThreadContinuation && continuationLookback === 'bubble'` strategy, match if `result.data?.[0]?.user_id === def.auth_user_id`. Run this lookup at most once per request even if multiple strategies opt in.
  - Iteration order: `boundSlugs` strategies retain `bindings.sort_order` ASC; unbound strategies follow in `REGISTRY_ITERATION_ORDER` declared order.
  - Drop the obsolete "Copilot suggestion ignored: v2 is Coach-only…" comment — Phase 5 _is_ the resolution it referenced.

- [`supabase/functions/agent-dispatch-v2/index.ts`](../../../supabase/functions/agent-dispatch-v2/index.ts):
  - In the fallback branch, prefer `strategy.safeReplyInsert` when defined:
    ```ts
    const fallback = strategy.safeReplyInsert
      ? await strategy.safeReplyInsert(ctx, strategy.safeReplyText)
      : await insertSafeReply(ctx, strategy.safeReplyText);
    ```
  - No other change to this file.

- [`supabase/functions/agents/index.ts`](../../../supabase/functions/agents/index.ts):
  - Import `BuddyStrategy` from `./buddy/strategy.ts`.
  - Add to `REGISTRY` and to `REGISTRY_ITERATION_ORDER` AFTER Coach + Organizer (Buddy has no `bubble_agent_bindings.sort_order`, so its position only matters as a deterministic tiebreaker; trailing matches the original "fitness bubble Coach > Organizer > Buddy" implicit ordering and keeps the resolver's mention walk predictable).

- [`src/lib/agents/buddyResponse.ts`](../../../src/lib/agents/buddyResponse.ts) (if it exists; check during research) → if present, rewrite as a re-export shim from `./buddy/parse.ts`. If no current file exists, no change.

- [`supabase/functions/buddy-agent-dispatch/buddyPrompt.ts`](../../../supabase/functions/buddy-agent-dispatch/buddyPrompt.ts) → replace with `export { buddySystemPrompt } from '../agents/buddy/prompts.ts';` (legacy Deno shim, parallel to Phase 4's `organizerPrompt.ts` shim).

- [`scripts/smoke-agent-dispatch-v2.ts`](../../../scripts/smoke-agent-dispatch-v2.ts):
  - Extend the `--target` enum to include `buddy`.
  - Add three Buddy-specific smoke modes selectable via `--scenario mention | sentinel | continuation`:
    - `mention`: `--target buddy --scenario mention`, default trigger `'@Buddy hi'`, env vars `SMOKE_BUDDY_BUBBLE_ID` / `SMOKE_BUDDY_USER_ID` / `SMOKE_BUDDY_TRIGGER_TEXT`.
    - `sentinel`: trigger text forced to `[SYSTEM_EVENT: ONBOARDING_STARTED]`.
    - `continuation`: posts a plain (no-mention) message; documents that the previous bubble message must be Buddy-authored for the test to pass.
  - Default `--scenario` to `mention` for `--target buddy` to keep one-liner runs simple.

- [`scripts/check-agent-coupling.ts`](../../../scripts/check-agent-coupling.ts) — already allows `supabase/functions/agents/**`, so no change. Sanity-check after the strategy lands.

- [`docs/refactor/vertex-agent-dispatch-consolidation/secrets-matrix.md`](secrets-matrix.md):
  - Bump "Last updated" date.
  - Add a "Phase 5 cutover state" subsection documenting that `buddy_dispatch_webhook` is disabled at deploy time (no parallel soak), and that `BUDDY_AGENT_WEBHOOK_SECRET` / `BUDDY_GEMINI_MODEL` / `BUDDY_GEMINI_FETCH_TIMEOUT_MS` / `BUDDY_AGENT_DEBUG` remain live until Phase 6 retires the legacy function.

## Routing nuances to preserve (do not skip)

These all live in [`supabase/functions/buddy-agent-dispatch/index.ts`](../../../supabase/functions/buddy-agent-dispatch/index.ts) today and must port faithfully:

- Workspace-global identity (no `bubble_agent_bindings` row) — handled by the resolver refactor + `requireBubbleBinding: false`.
- Loop guard reuses Buddy's `auth_user_id` — already covered generically by `isAuthorAnAgent` in [`supabase/functions/agent-dispatch-v2/index.ts`](../../../supabase/functions/agent-dispatch-v2/index.ts) (lines 86–103). No change needed.
- Coach-mention exclusion — `excludeOnMentionOf: ['coach']` + the resolver looking up Coach's handle in `defBySlug` regardless of bindings.
- Onboarding-sentinel filtering in history — `shouldExcludeBuddyOnboardingFromHistory` already exists in `_shared/dispatch/sentinel.ts`; the strategy calls it.
- Implicit trigger user-turn substitution — handled by the strategy's `buildContents`.

## Cutover (mirrors Phase 4)

1. Deploy v2 with the Buddy strategy registered.
2. Disable `buddy_dispatch_webhook` (legacy) in Supabase Dashboard in the SAME session as the v2 deploy. The two windows of dual-active webhook fire MUST be measured in seconds, not minutes — duplicate Buddy replies are user-visible and `buddy_create_onboarding_reply` will not dedupe them.
3. Soak 24 hours with heightened watch in the first hour (Buddy is the highest-velocity agent of the three).
4. Commit `docs/refactor/vertex-agent-dispatch-consolidation/soak-log-buddy.md`.

## Verification matrix

| Trigger                                                        | Expected                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `@Buddy hi` in any bubble                                      | Buddy reply via v2                                                                   |
| `[SYSTEM_EVENT: ONBOARDING_STARTED]` insert                    | Buddy welcome reply + optional starter card; sentinel never echoed in `replyContent` |
| User reply in a Buddy thread without `@Buddy`                  | Continuation reply via v2 (thread lookback)                                          |
| Plain user root message; previous bubble message was Buddy's   | Continuation reply via v2 (bubble lookback)                                          |
| `@Coach …` in a bubble where Buddy is also present             | Coach replies; Buddy stays silent (`excludeOnMentionOf`)                             |
| `@Buddy` in a thread an agent already owns                     | Buddy still answers — explicit mention beats continuation                            |
| `@Buddy` in a bubble with NO `bubble_agent_bindings.buddy` row | Buddy still answers (workspace-global, `requireBubbleBinding: false`)                |

Cross-check the typing-indicator UI (`useAgentResponseWait` + `data-pending-slug`) per `docs/refactor/agent-routing-audit.md` §1 — should not regress.

Run the standard verification chain before committing:

- `pnpm test` (Vitest, must include the new `parse.test.ts`).
- `pnpm exec tsx scripts/check-agent-coupling.ts`.
- `deno check --node-modules-dir=auto supabase/functions/agents/buddy/strategy.ts supabase/functions/agent-dispatch-v2/resolve.ts supabase/functions/agent-dispatch-v2/index.ts`.
- The full `docs/pre-commit-checklist.md` (Next.js prerender + Astro `@ts-expect-error` warnings remain pre-existing — confirm no new breakage).

## Risk + rollback

- Re-enable `buddy_dispatch_webhook` and remove `buddy` from the v2 registry. Two changes, both reversible from Dashboard + a one-line registry edit.
- Highest-velocity agent: monitor `slug=buddy AND error_kind in (auth, http, parse, shape)` log queries every 10–15 min for the first hour after cutover.
- Resolver refactor risk surface: every Coach/Organizer turn flows through the new two-query path. Verify Coach + Organizer regressions in the soak log first hour by spot-checking 5 known Coach + 5 known Organizer turns.

## Hand-off to Phase 6

- All three agents on v2.
- All three legacy webhooks disabled (not deleted).
- Three soak logs committed (`soak-log-coach.md`, `soak-log-organizer.md`, `soak-log-buddy.md`).
- No legacy function has received traffic for at least 48 hours.
