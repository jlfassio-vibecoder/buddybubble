# Phase 5 — Port Buddy into `agent-dispatch-v2`

> Buddy is the trickiest router. It has workspace-global identity, an implicit
> onboarding sentinel, "previous bubble message" continuation that does not require
> a `parent_id`, and an explicit exclusion when the user mentions `@Coach`. All four
> rules must move into the strategy without slug strings leaking into
> `_shared/dispatch/routing.ts`.

## Inputs

- Phase 4 complete. Coach + Organizer are on v2.
- Legacy `buddy-agent-dispatch` still receives Buddy traffic via
  `buddy_dispatch_webhook` (Database Webhook).

## Deliverables

Files to **create**:

1. `src/lib/agents/buddy/config.ts` — model id (`gemini-2.5-flash`), temperature
   `0.4`, `maxOutputTokens` `1024`, `safeReplyText`, `onboardingSentinel`
   constant `'[SYSTEM_EVENT: ONBOARDING_STARTED]'`.
2. `src/lib/agents/buddy/schema.ts` — lift `BUDDY_RESPONSE_SCHEMA` from
   `buddy-agent-dispatch/index.ts:33`–`:66`.
3. `src/lib/agents/buddy/prompts.ts` — re-export from existing
   `supabase/functions/buddy-agent-dispatch/buddyPrompt.ts`. Then move the canonical
   string into `src/lib/agents/buddy/prompts.ts` and have the old Deno path
   re-export from there (parallel to the Organizer fold in Phase 4).
4. `src/lib/agents/buddy/parse.ts` — pure parser. Lift the four-step pipeline at
   `buddy-agent-dispatch/index.ts:581`–`:723`:
   `extractGeminiCandidateText`, `extractBalancedJsonAt`, `stripJsonCodeFences`,
   `sanitizeBuddyModelJsonText`, `parseBuddyJsonObject`, `parseBuddyResponse`.
   These are notably more aggressive than Coach's parser (Buddy is allowed to wrap
   JSON in prose; the parser walks `{` candidates with balanced-brace extraction).
5. `src/lib/agents/buddy/parse.test.ts` — Vitest cases for the prose-wrapped JSON,
   markdown fences, and the "model forgot the closing fence" path.
6. `src/lib/agents/buddy/strategy.ts` — `AgentStrategy<BuddyParsedResponse>`:
   - `slug: 'buddy'`
   - `routing`: `{ acceptMention: true, acceptRootDefault: false,
acceptThreadContinuation: true, requireBubbleBinding: false,
excludeOnMentionOf: ['coach'], implicitTrigger: isBuddyOnboardingSentinel }`.
   - `buildSystemPrompt`: returns `buddySystemPrompt` (no per-message context).
   - `buildContents`: parent-id-based history when `parent_id` is set, otherwise
     "last 12 bubble messages" (mirrors `fetchBuddyHistory` at
     `buddy-agent-dispatch/index.ts:199`–`:263`). When the trigger is the
     onboarding sentinel, replace the user-turn text with the existing implicit
     prompt:
     `'The user just landed on this feature for the first time (implicit onboarding trigger). Greet them briefly, orient them, offer ONE concrete first step, and consider proposing a small starter card.'`
     (`buddy-agent-dispatch/index.ts:451`–`:453`).
   - `parse`: `parseBuddyResponse(text)`; throw on `null`.
   - `applyServerGuards`: pass-through.
   - `persist`: call `buddy_create_onboarding_reply` with the card fields when the
     model returned a non-null `createCard`. Match
     `buddy-agent-dispatch/index.ts:545`–`:553`.
   - `safeReplyText`: keep the model voice. Suggested:
     `"I had trouble loading that just now. Mind trying once more?"`
7. `supabase/functions/agents/buddy.ts` — re-exports from `src/lib/agents/...`.
8. Smoke fixture: extend `scripts/smoke-agent-dispatch-v2.ts` with three Buddy cases:
   - `@buddy hello` in any bubble.
   - Onboarding sentinel post.
   - Plain follow-up after a Buddy turn (continuation).

Files to **modify**:

1. `supabase/functions/agents/index.ts` — add `buddy: BuddyStrategy`.
2. `_shared/dispatch/routing.ts` — ensure `routing.excludeOnMentionOf` is checked
   before returning a strategy match. The check must use any registered slug's
   handle, not a slug string. Example logic:

   ```ts
   for (const slugToExclude of strategy.routing.excludeOnMentionOf ?? []) {
     const other = registry[slugToExclude];
     if (!other) continue;
     // Look up the other agent's mention_handle from the bubble bindings
     const def = bindings.find((b) => b.slug === slugToExclude);
     const handle = def?.mention_handle;
     if (handle && mentionsHandle(message.content, handle)) {
       return null; // do not match this strategy
     }
   }
   ```

   This preserves `buddy-agent-dispatch/index.ts:391`–`:397`'s behavior (Buddy
   refuses to answer when the user explicitly mentioned `@Coach`).

3. `_shared/dispatch/routing.ts` — implement the "previous bubble message authored
   by this agent" continuation case for Buddy. Today's logic:

   ```ts
   // From buddy-agent-dispatch/index.ts:170–:186
   const { data } = await supabase
     .from('messages')
     .select('id, user_id')
     .eq('bubble_id', record.bubble_id)
     .neq('id', record.id)
     .order('created_at', { ascending: false })
     .limit(2);
   const prev = data?.[0];
   return prev?.user_id === buddyAuthUserId;
   ```

   Add a `RoutingDescriptor.continuationLookback?: 'thread' | 'bubble'` field with
   default `'thread'`. Buddy sets it to `'bubble'` for root messages. Coach and
   Organizer use the default.

4. `_shared/dispatch/sentinel.ts` — export `isBuddyOnboardingSentinel(message)`
   = `message.content === ONBOARDING_SYSTEM_EVENT`.

## Routing nuances to preserve (do not skip)

These all live in `buddy-agent-dispatch/index.ts` today and must port faithfully:

- **Workspace-global identity.** Buddy is not bubble-bound (RLS extension at
  `supabase/migrations/20260701150000_buddy_agent_rls_workspace_global.sql`).
  `routing.requireBubbleBinding = false` reflects this.
- **Loop guard reuses Buddy's auth_user_id specifically** — but the dispatcher's
  pre-routing loop guard already covers this generically (any message authored by
  any active agent is skipped). Confirm this guard ran before the strategy resolves;
  Phase 1's `agent-dispatch-v2/index.ts` does this.
- **Coach-mention exclusion** (`excludeOnMentionOf: ['coach']`) is the reason Buddy
  sometimes "doesn't reply" to a thread it started — the user explicitly addressed
  Coach. This is product behavior, not a bug.
- **Onboarding-sentinel filtering in history** — `_shared/dispatch/history.ts`
  already strips the sentinel via `shouldExcludeWorkoutSentinelFromHistory`'s sister
  helper. Add `shouldExcludeBuddyOnboardingFromHistory` to `_shared/dispatch/sentinel.ts`
  and call it from the Buddy strategy's `buildContents`.

## Cutover (mirrors Phase 4)

1. Deploy v2 with the Buddy strategy registered.
2. **Disable `buddy_dispatch_webhook` (legacy)** in Dashboard. Buddy's RPC
   (`buddy_create_onboarding_reply`) — verify whether it has an
   `agent_message_runs`-style PK dedupe. If it does not, do NOT run both webhooks
   in parallel; the duplicate Buddy reply would surface to the user. Disable
   immediately at v2 deploy time. Rollback is one toggle.
3. Soak 24 hours.
4. Commit `docs/refactor/vertex-agent-dispatch-consolidation/soak-log-buddy.md`.

## Verification

| Trigger                                                    | Expected                                                        |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| `@buddy hi` in any bubble                                  | Buddy reply via v2                                              |
| Onboarding sentinel insert                                 | Buddy welcome reply + optional starter card                     |
| User reply in a Buddy thread without `@buddy`              | Continuation reply via v2                                       |
| Plain user message and previous bubble message was Buddy's | Continuation reply via v2 (root continuation)                   |
| `@coach …` in a bubble where Buddy is also present         | Coach replies; Buddy stays silent (`excludeOnMentionOf`)        |
| `@buddy` in a thread an agent already owns                 | Buddy still answers because explicit mention beats continuation |

Cross-check the typing-indicator UI on the client: the existing
`useAgentResponseWait` hook + `data-pending-slug` attribute should not regress.
This was the focus of `docs/refactor/agent-routing-audit.md`; re-read §1 to confirm
the contract.

## Risk + rollback

- Re-enable `buddy_dispatch_webhook` and remove `buddy` from the v2 registry.
- Buddy traffic is the highest-velocity of the three agents (every onboarding
  triggers it), so monitor for the first hour after cutover specifically.

## Hand-off to next phase

Phase 6 expects:

- All three agents on v2.
- All three legacy webhooks disabled (not deleted).
- Three soak logs committed.
- No legacy function has received traffic for at least 48 hours.
