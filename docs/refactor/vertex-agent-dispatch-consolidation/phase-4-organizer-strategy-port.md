# Phase 4 — Port Organizer into `agent-dispatch-v2`

> Organizer is the smallest agent (`organizer-agent-dispatch/index.ts` is 631 lines
> and well-structured). The port is mostly mechanical, but there is one product
> contract to preserve: **`ORGANIZER_WRITES_ENABLED` defaults OFF**, and the
> `proposedWrite` payload must continue to surface in the response envelope so the
> existing webhook caller / logs see it.

## Inputs

- Phase 3 complete. Coach is live on `agent-dispatch-v2`.
- The legacy `organizer-agent-dispatch` function is still receiving Organizer traffic
  via the `organizer_dispatch_webhook` Database Webhook
  (see `docs/refactor/phase4-env-vars.md`).

## Deliverables

Files to **create**:

1. `src/lib/agents/organizer/config.ts` — model id (default `gemini-2.5-flash`),
   temperature `0.3`, `maxOutputTokens` `1024`, `safeReplyText`,
   `writesEnabledFlag = 'ORGANIZER_WRITES_ENABLED'`.
2. `src/lib/agents/organizer/schema.ts` — lift `ORGANIZER_RESPONSE_SCHEMA` from
   `organizer-agent-dispatch/index.ts:43`–`:83`.
3. `src/lib/agents/organizer/prompts.ts` — re-export from existing
   `supabase/functions/organizer-agent-dispatch/organizerPrompt.ts`. Eventually fold
   the prompt source into `src/lib/agents/organizer/prompts.ts` and have the legacy
   Deno file re-export from there. **Do this fold during Phase 4** so Phase 6 can
   delete `organizer-agent-dispatch/organizerPrompt.ts` cleanly. The fixture mirror
   `src/lib/agents/organizerPromptFixture.ts` should also re-export from the new
   canonical location to fix the byte-for-byte drift documented in
   `docs/refactor/phase4-deviation-log.md:39`–`:50`.
4. `src/lib/agents/organizer/parse.ts` — lift `parseOrganizerResponse` and
   `gateOrganizerWrite` and `mentionsHandle` from
   `organizer-agent-dispatch/index.ts:276`–`:382`. Re-export from
   `src/lib/agents/organizerResponse.ts` so the existing Vitest suite at
   `src/lib/agents/organizerResponse.test.ts` keeps passing without modification.
5. `src/lib/agents/organizer/strategy.ts` — `AgentStrategy<OrganizerParsedResponse>`
   implementation:
   - `slug: 'organizer'`
   - `routing`: `{ acceptMention: true, acceptRootDefault: false,
acceptThreadContinuation: true, requireBubbleBinding: true }`. Organizer
     intentionally has no root-default behavior today
     (`organizer-agent-dispatch/index.ts:130`–`:156` shows continuation only when
     `parent_id` is set).
   - `buildSystemPrompt`: returns `organizerSystemPrompt` (no per-message context
     fragments today).
   - `buildContents`: history rows mapped via `_shared/dispatch/history.ts`
     `loadThreadHistoryByParent` with `maxMessages: 12`, plus the trigger row.
     Strip the Buddy onboarding sentinel string (preserve current behavior at
     `organizer-agent-dispatch/index.ts:198`, `:226`).
   - `parse`: `parseOrganizerResponse(text)`; throw on `null`.
   - `applyServerGuards`: pass-through (no Layer B equivalent).
   - `persist`: call `organizer_create_reply_and_task` with the gated task fields
     from `gateOrganizerWrite(parsed, env.organizerWritesEnabled)`. **Always pass
     the un-gated `parsed.proposedWrite` into the dispatcher response envelope** so
     ops tools that read the response payload still see the model's intent. Add
     `proposedWrite` to the structured log line at `phase = 'persisted'` so it lands
     in Supabase Logs.
   - `safeReplyText`: a generic Organizer-flavored fallback. Suggested:
     `"I had trouble compiling that meeting note. Can you say it again?"`
6. `supabase/functions/agents/organizer.ts` — re-exports from `src/lib/agents/...`.
7. Smoke fixture: extend `scripts/smoke-agent-dispatch-v2.ts` (introduced in Phase 2)
   with an Organizer-bound bubble case.

Files to **modify**:

1. `supabase/functions/agents/index.ts`:

   ```ts
   import { CoachStrategy } from './coach.ts';
   import { OrganizerStrategy } from './organizer.ts';
   export const REGISTRY = {
     coach: CoachStrategy,
     organizer: OrganizerStrategy,
   } as const;
   ```

2. `supabase/functions/_shared/env.ts` — extend `readDispatcherEnv()` to read
   `ORGANIZER_WRITES_ENABLED` and expose it as `organizerWritesEnabled: boolean`.
   Keep the `Deno.env.get('ORGANIZER_WRITES_ENABLED')?.trim() === '1'` semantics
   (matches `organizer-agent-dispatch/index.ts:596`).

Files **not** touched in this phase:

- `supabase/functions/organizer-agent-dispatch/index.ts` — keep running.
- `supabase/functions/buddy-agent-dispatch/index.ts`
- The legacy Coach function (already orphaned by Phase 3).

## Routing nuances to preserve

1. **Bubble-binding requirement.** Organizer only answers in bubbles where it is
   bound (`organizer-agent-dispatch/index.ts:478`–`:494`). Encode via
   `routing.requireBubbleBinding = true` and let `_shared/dispatch/routing.ts`
   enforce.
2. **No root-default.** Organizer is never the default for plain-text root messages.
   `routing.acceptRootDefault = false` enforces this.
3. **Loop guard.** Same as Coach — already covered by the dispatcher's pre-routing
   loop guard.

## Cutover (mirrors Phase 3)

1. Create `agent_dispatch_webhook_v2` if it does not already exist (Phase 3 did this).
   It will already deliver Organizer messages once `OrganizerStrategy` is registered.
2. **Deploy** `agent-dispatch-v2` with the Organizer strategy added.
3. **Soak** for 24 hours with **both** legacy and v2 webhooks active. Idempotency:
   `organizer_create_reply_and_task` does not have an `agent_message_runs`-style
   PK dedupe (verify this — search the migration). If it does not, you must either:
   - **(a)** Add an idempotency table for Organizer in this PR, OR
   - **(b)** Disable the legacy `organizer_dispatch_webhook` immediately when
     Organizer registers in v2, accepting the brief "no soak with both running"
     window.

   Pick (b) unless adding (a) is trivial. The risk window is small (Organizer
   traffic is low) and rollback is one Dashboard toggle.

4. Watch logs filtered to `slug = 'organizer'` for 24 hours.
5. Commit `docs/refactor/vertex-agent-dispatch-consolidation/soak-log-organizer.md`.

## Verification

| Trigger                                                                | Expected behavior                                              |
| ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| `@organizer please summarize` in a bound bubble                        | Organizer reply via v2; no task row created (writes flag off)  |
| `@organizer create a task to follow up next Tuesday` (writes flag off) | Reply only; `proposedWrite` visible in structured log line     |
| Same prompt with `ORGANIZER_WRITES_ENABLED=1`                          | Reply + task row created via `organizer_create_reply_and_task` |
| `@organizer …` in an **unbound** bubble                                | Skipped (`routing.requireBubbleBinding`)                       |
| Reply in a thread Organizer started (no `@organizer`)                  | Continuation reply via v2                                      |

## Risk + rollback

- Re-enable `organizer_dispatch_webhook` and remove `organizer` from the v2
  registry to revert.
- The legacy function still has all its env vars (Phase 0 did not delete them).

## Hand-off to next phase

Phase 5 expects:

- Coach + Organizer are both on v2.
- Legacy `organizer_dispatch_webhook` disabled, legacy function untouched.
- Soak log committed.
- Organizer prompt + parser are now sourced from `src/lib/agents/organizer/...`
  (Phase 4 fold complete).
