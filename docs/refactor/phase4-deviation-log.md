# Phase 4 deviation log

## Asset files not yet on disk

- **Canonical Coach + Organizer SVGs are referenced by URL only.** The migration at
  `supabase/migrations/20260723120000_swap_coach_organizer_avatars.sql` and the fallback
  map at `src/lib/agents/resolveAgentAvatar.ts:14-18` point at
  `/brand/BuddyBubble-Coach-mark.svg` and `/brand/BuddyBubble-Organizer-mark.svg`. Only
  `public/brand/BuddyBubble-mark.svg` exists today. The SVG files for Coach and Organizer
  must be added by design (Justin) before running the migration in a live environment;
  running it now would leave the UI showing broken `<img>` requests. The asset-swap
  migration itself is idempotent and safe to ship.

## Organizer write-gating without UI confirmation

- **Ship-with-flag-off deviation.** The spec asks for writes gated behind either a
  confirmation round-trip OR a feature flag. The existing dispatch architecture (Coach,
  Buddy) posts the agent reply as a plain `messages` row — there is no structured
  `proposedWrite` payload surfaced to the client UI. Rather than extend the reply schema
  to carry structured metadata mid-phase, Phase 4 ships with `ORGANIZER_WRITES_ENABLED`
  defaulting to `false` (see `supabase/functions/organizer-agent-dispatch/index.ts` and
  `docs/refactor/phase4-env-vars.md`). Organizer's `proposedWrite` field is returned in
  the HTTP response envelope for the webhook caller and surfaces in logs, but it is
  not round-tripped to the UI. Follow-up: when a dedicated `proposed_writes` table or
  `messages.metadata.proposed_write` column ships, remove the feature-flag gate and
  require a UI confirmation click.

## No `workspace_state` RPC exists today

- Spec asked Organizer to "append to a meeting/agenda notes store if one exists" via an
  existing RPC. Today there is no `workspace_state` store and no matching RPC — no
  migration in `supabase/migrations/` touches a `workspace_state` table. Organizer's RPC
  (`organizer_create_reply_and_task`) covers task creation only. The `append_agenda_note`
  branch of `parseOrganizerResponse` exists in the prompt + parser but has no server-side
  sink; it is logged as a proposedWrite and otherwise ignored. Follow-up: when an agenda
  store is introduced, extend the RPC or add a sibling
  `organizer_append_agenda_note(p_bubble_id uuid, p_note text)` RPC and re-run the gate.

## Prompt / helpers duplicated across function + src tree

- `supabase/functions/organizer-agent-dispatch/organizerPrompt.ts` and
  `src/lib/agents/organizerPromptFixture.ts` carry byte-for-byte copies of the Organizer
  system prompt. `parseOrganizerResponse` + `gateOrganizerWrite` + `mentionsHandle`
  likewise live in both the Deno function (`index.ts`) and
  `src/lib/agents/organizerResponse.ts`. Reason: Supabase Edge Functions cannot import
  from `../../../src/...` at deploy time; Vitest cannot import from a Deno-targeted file
  that uses `Deno.serve` / `jsr:` imports. The lint guardrail at
  `scripts/check-agent-coupling.ts` does NOT currently detect drift between the two
  copies. Follow-up: add a `check:organizer-mirror` script that diff-compares the two
  source strings and fails CI on drift.

## `bubble-agent-dispatch` Organizer exclusion

- The fitness @Coach dispatcher now filters `slug = 'organizer'` out of its agent list
  (`supabase/functions/bubble-agent-dispatch/index.ts`, near the `DISPATCHER_EXCLUDED_SLUGS`
  constant). This was the smallest change that avoided double-firing once Organizer has
  its own dispatcher webhook. A DB-level constraint (e.g. a `dispatcher` enum column on
  `agent_definitions`) would be cleaner but would touch the schema mid-phase.
  Follow-up: consider `agent_definitions.dispatcher text not null default 'bubble'` in a
  future phase.

## Integration test for binding rejection lives in E2E

- The spec asked for a unit test that `organizer-agent-dispatch` rejects requests for
  bubbles where Organizer is not bound. The function runs in Deno, which the Node/Vitest
  harness cannot execute. The binding check is covered by the Playwright spec at
  `e2e/agent-routing.spec.ts` (`Organizer bubble: @Organizer when can we meet tomorrow`)
  when `E2E_ORGANIZER_BUBBLE_ID` is set. The pure helpers it shares with the client
  (`parseOrganizerResponse`, `gateOrganizerWrite`, `mentionsHandle`) ARE covered in
  Vitest via `src/lib/agents/organizerResponse.test.ts`.

## Observability: console.info instead of a shared logger

- Per spec, `src/lib/agents/agentRoutingLogger.ts` uses `console.info('[agent-routing]', ...)`
  because no repo-wide structured logger exists yet. When one lands, the only change
  required is inside that file; call sites are stable.

## Perf bench threshold

- `src/lib/agents/resolveTargetAgent.perf.test.ts` asserts `< 5ms` mean (5× the spec
  target of `< 1ms`) because CI runners can be noisy. On a typical dev machine the
  mean should land well under 1ms; the looser CI bound prevents flake. The elapsed
  time is not logged in passing runs — when the assertion fails, the assertion message
  carries the observed mean.

## Files changed

- **Migrations** (DB):
  - `supabase/migrations/20260723120000_swap_coach_organizer_avatars.sql`
  - `supabase/migrations/20260723130000_agent_definitions_mention_handle_unique.sql`
  - `supabase/migrations/20260723140000_organizer_rpc.sql`
  - `supabase/migrations/20260723150000_add_organizer_webhook.sql`
- **Manual down** (for ops, not CLI-applied):
  - `docs/refactor/migrations-phase4-manual-down/swap_coach_organizer_avatars.down.sql`
  - `docs/refactor/migrations-phase4-manual-down/agent_definitions_mention_handle_unique.down.sql`
- **Edge functions**:
  - `supabase/functions/organizer-agent-dispatch/index.ts` (new)
  - `supabase/functions/organizer-agent-dispatch/organizerPrompt.ts` (new)
  - `supabase/functions/bubble-agent-dispatch/index.ts` (excluded Organizer)
  - `supabase/config.toml` (Organizer function declared, `verify_jwt=false`)
- **Client** (routing stays agent-agnostic; only additive):
  - `src/lib/agents/resolveAgentAvatar.ts` (+ `.test.ts`): added Coach / Organizer fallbacks
  - `src/lib/agents/organizerResponse.ts` / `.test.ts` (new helpers + tests)
  - `src/lib/agents/organizerPromptFixture.ts` (new; mirror of Deno prompt for Vitest)
  - `src/lib/agents/resolveTargetAgent.edgecases.test.ts` (new)
  - `src/lib/agents/resolveTargetAgent.perf.test.ts` (new)
  - `src/lib/agents/agentRoutingLogger.ts` (new)
  - `src/lib/agents/checkAgentCoupling.selftest.test.ts` (new)
  - `src/hooks/useAgentResponseWait.ts` (added `callbacks` option + `onExpire` / `onReceived`)
  - `src/hooks/useAgentResponseWait.hook.test.tsx` (+ send-fail, onExpire, onReceived)
  - `src/components/chat/ChatArea.tsx` (telemetry wiring)
  - `src/components/modals/task-modal/TaskModalCommentsPanel.tsx` (telemetry wiring)
- **Lint + CI**:
  - `scripts/check-agent-coupling.ts` (new)
  - `package.json` (added `check:agent-coupling` + chained into `test`)
- **E2E**:
  - `e2e/agent-routing.spec.ts` (Organizer meeting-scoped spec gated on `E2E_ORGANIZER_BUBBLE_ID`)
- **Docs**:
  - `docs/agents/adding-a-coach.md` (new)
  - `docs/agents/adding-an-organizer-variant.md` (new)
  - `docs/refactor/phase4-env-vars.md` (new)
  - `docs/refactor/phase4-deviation-log.md` (this file)
