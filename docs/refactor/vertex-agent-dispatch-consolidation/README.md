# Vertex AI dispatch consolidation for Bubble Agents

**Goal.** One Deno-native, multi-agent dispatch stack that runs Coach, Organizer, Buddy
(and any future agent) on **Vertex AI Gemini** (publisher API), with strict JSON
contracts, IAM-based auth, structured logging, and idempotent persistence.

**Surgical-edit rule.** This refactor is staged so the three legacy dispatchers
(`bubble-agent-dispatch`, `buddy-agent-dispatch`, `organizer-agent-dispatch`) keep running
unchanged until each agent's webhook has been individually cut over to the new
`agent-dispatch` function and verified. No legacy file is deleted before its replacement
is live and soaked.

---

## How this folder is organized

Each phase is a standalone Markdown file you can paste into Plan mode as a single prompt.
They are sequenced and explicitly call out their inputs and exit criteria so a planning
agent can confirm prerequisites before starting work.

| #   | File                                                                                   | Purpose                                                                                                                     |
| --- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 0   | [`phase-0-gcp-and-secrets-prereqs.md`](./phase-0-gcp-and-secrets-prereqs.md)           | One-time GCP project / service-account / Vertex enablement; Supabase secret rotation prep. No code changes.                 |
| 1   | [`phase-1-shared-foundations.md`](./phase-1-shared-foundations.md)                     | New `_shared/llm`, `_shared/dispatch`, `_shared/obs`, typed env reader, and the `AgentStrategy` contract.                   |
| 2   | [`phase-2-coach-strategy-and-v2-entry.md`](./phase-2-coach-strategy-and-v2-entry.md)   | Port Coach (incl. workout-open sentinel, draft RPC, Layer B turn gate, `execution_patch`) and stand up `agent-dispatch-v2`. |
| 3   | [`phase-3-coach-cutover-and-soak.md`](./phase-3-coach-cutover-and-soak.md)             | Move the Coach DB webhook to v2; soak; keep legacy as cold backup.                                                          |
| 4   | [`phase-4-organizer-strategy-port.md`](./phase-4-organizer-strategy-port.md)           | Port Organizer (with `ORGANIZER_WRITES_ENABLED` and `proposedWrite` gating) into v2; cut over and soak.                     |
| 5   | [`phase-5-buddy-strategy-port.md`](./phase-5-buddy-strategy-port.md)                   | Port Buddy (onboarding sentinel, thread continuation, Coach-mention exclusion); cut over and soak.                          |
| 6   | [`phase-6-cutover-deletion-and-rename.md`](./phase-6-cutover-deletion-and-rename.md)   | Delete the three legacy functions and their secrets; rename `agent-dispatch-v2` → `agent-dispatch`.                         |
| 7   | [`phase-7-observability-tests-and-docs.md`](./phase-7-observability-tests-and-docs.md) | Structured-log query playbook, schema-vs-prompt lint, integration tests, doc updates.                                       |
| 7a  | [`phase-7a-schema-drift-linter.md`](./phase-7a-schema-drift-linter.md)                 | Schema/prompt/parser drift linter + mirror-parity linter (modular Phase 7 deliverable, independent of Phase 6).             |
| 7c  | [`phase-7c-deno-integration-tests.md`](./phase-7c-deno-integration-tests.md)           | Deno integration tests for retry, fallback, parse/shape, auth, and per-agent persistence paths (final Phase 7 deliverable). |

---

## Plan-vs-codebase review

The submitted plan is sound and the consolidation is the right call pre-MVP. The notes
below capture **codebase realities the plan does not yet account for** and small
corrections so the phased work below does not regress production behavior.

### Things the plan got right

- **Why Vertex publisher API, not Agent Builder.** Coach's Gemini call already uses
  `responseMimeType: 'application/json'` + a 13-key `responseSchema`
  (`supabase/functions/bubble-agent-dispatch/index.ts:704`–`:860`). Vertex publisher API
  honors the same shape, so the parser and `extractGeminiText`
  (`supabase/functions/bubble-agent-dispatch/index.ts:658`–`:668`) survive almost
  verbatim — only the endpoint URL and auth header change.
- **Deno + WebCrypto JWT for auth.** No `google-auth-library` is needed; Deno's runtime
  already has WebCrypto.
- **One consolidated dispatcher.** All three current dispatchers (1,849 + 723 + 631 lines)
  duplicate webhook verification, payload parsing, loop guard, history fetch, and
  fallback handling. A single `agent-dispatch` entry plus per-slug strategies removes the
  copy-paste tax and unifies secret rotation.
- **HTTP 200 on degraded paths.** Already a deliberate, well-commented contract in all
  three legacy functions — keep it as the dispatcher's default error policy.

### Codebase realities the plan must absorb

1. **Coach is not one flow — it is four interlocking modes.** A "single Coach strategy"
   needs to encode all of:
   - **New workout card** path → `agent_create_card_and_reply`
     (`supabase/migrations/20260729120000_agent_rpcs_persist_execution_patch.sql:46`).
   - **Revise existing card** path → `agent_insert_coach_workout_draft_reply`
     (`supabase/migrations/20260623120000_coach_workout_draft_messages_metadata.sql:43`),
     finalized client-side via `apply_workout_draft`. Out of dispatcher scope but the
     strategy must produce the right `messages.metadata.coach_draft` payload via the RPC.
   - **Workout-player silent sentinel** → smaller schema and dedicated greeting call
     (`supabase/functions/bubble-agent-dispatch/index.ts:893`–`:964`,
     `geminiGenerateWorkoutOpenGreeting`). Detected via `is_silent_sentinel: true`
     metadata + `workout_context.source = 'workout_player'`
     (`isWorkoutContextSentinel`, `:119`). Persisted as a reply-only `agent_create_card_and_reply`.
   - **Mid-workout `execution_patch`** → live `WorkoutPlayer` grid updates persisted on
     the same INSERT as the agent reply. Already supported by both Coach RPCs via
     `p_execution_patch`. Server clamps `create_card`/`update_existing_task` to false
     during active execution (`:1716`–`:1725`).

2. **Layer B server turn-gate must be preserved.** Coach blocks card creation on the
   first user turn and on early `session_request` turns
   (`supabase/functions/bubble-agent-dispatch/index.ts:1690`–`:1707`). This is server
   policy that overrides model output and must move into `CoachStrategy.applyServerGuards`,
   not into the prompt. The `user_requested_immediate_card` waiver also lives here.

3. **Idempotency is already in Postgres, not in `messages.metadata`.** The plan
   suggests _"a unique index on `messages.metadata->>'trigger_message_id'`"_. That key
   does not exist on the `messages` row today. Idempotency is enforced by
   `public.agent_message_runs (trigger_message_id, agent_auth_user_id)` plus
   `pg_advisory_xact_lock(hashtextextended(trigger||agent, 0))` inside every Coach RPC
   (e.g. `agent_create_card_and_reply` body in
   `supabase/migrations/20260729120000_agent_rpcs_persist_execution_patch.sql:77`–`:79`).
   Keep that contract; do not invent a parallel `metadata`-based dedupe.

4. **Per-agent RPCs differ; the strategy must own its persistence call.**
   - Coach: `agent_create_card_and_reply` and/or `agent_insert_coach_workout_draft_reply`.
   - Buddy: `buddy_create_onboarding_reply`
     (`supabase/functions/buddy-agent-dispatch/index.ts:545`).
   - Organizer: `organizer_create_reply_and_task`
     (`supabase/functions/organizer-agent-dispatch/index.ts:604`).
     `_shared/dispatch/rpc.ts` should expose typed wrappers per RPC; strategies pick which one to call.

5. **Routing is not uniform across agents.** The plan's
   "@mention → default → thread continuation" resolver matches Coach
   (`bubble-agent-dispatch/index.ts:1380`–`:1459`) but Buddy and Organizer add their own
   rules:
   - Buddy uses workspace-global identity (`buddy_agent_rls_workspace_global` migration),
     supports an implicit onboarding sentinel (`[SYSTEM_EVENT: ONBOARDING_STARTED]`,
     `buddy-agent-dispatch/index.ts:123`), explicitly **excludes** messages mentioning
     `@Coach` to avoid double-firing (`:391`–`:397`), and treats "previous bubble
     message authored by Buddy" as continuation even when there is no `parent_id`
     (`:144`–`:186`).
   - Organizer requires a `bubble_agent_bindings` row to be present (`:478`–`:494`)
     and only does continuation when `parent_id` is set (`:130`–`:156`).

   `_shared/dispatch/routing.ts` should expose composable primitives
   (`mentionsHandle`, `parseRootDefaultAgentSlug`, `loadThreadHistory`,
   `findAuthoringAgentInThread`, `bubbleHasBindingForSlug`) and let each strategy declare
   which primitives apply via a small `routing` descriptor on the strategy.

6. **Mention parsing is already DB-driven.** Both Buddy
   (`buddy-agent-dispatch/index.ts:354`–`:382`) and Organizer
   (`organizer-agent-dispatch/index.ts:449`–`:469`) read `mention_handle` from
   `agent_definitions` at request time. The new dispatcher must keep this — do **not**
   hardcode `@coach` / `@buddy` regexes in `_shared/dispatch/routing.ts`. The DB column
   is also the source of truth for the case-insensitive uniqueness index
   (`supabase/migrations/20260723130000_agent_definitions_mention_handle_unique.sql`).

7. **Coach-only filter is already in place — keep it generalizable.** The Coach
   dispatcher uses `DISPATCHER_ALLOWED_SLUGS = new Set(['coach'])` to filter out other
   agents (`bubble-agent-dispatch/index.ts:1350`). In the consolidated function, replace
   this with **strategy-registry membership** — the dispatcher only dispatches if a
   strategy is registered for the resolved slug; otherwise it returns
   `{ ok: true, skipped: 'not_handled' }` with HTTP 200.

8. **Vitest cannot import Deno modules.** Phase 4 already documented this in
   `docs/refactor/phase4-deviation-log.md` — `parseOrganizerResponse`, `gateOrganizerWrite`,
   and the prompt fixture exist in **mirrored** form under `src/lib/agents/` so
   `vitest` can exercise them. The new shared modules must be written so the **pure**
   helpers (parsers, schema validators, prompt builders) have **no Deno globals** and can
   be imported into both `supabase/functions/...` (Deno) and `src/...` (Node + Vitest).
   The dispatcher entry, `vertex-auth.ts`, and `vertex-gemini.ts` may use Deno-only
   primitives. The Phase 7a `pnpm check:agent-mirror` lint enforces parity between
   canonical and mirror in CI.

9. **`config.toml` requires an explicit function block.** Each Edge Function needs a
   `[functions.<name>] verify_jwt = false` entry
   (`supabase/config.toml:389`–`:401`). Phases 2 and 6 add and remove these blocks.

10. **Two name candidates for the SA env.** The submitted plan uses both
    `GOOGLE_SERVICE_ACCOUNT_JSON` (§3) and `GCP_SERVICE_ACCOUNT_JSON` (§7). Standardize
    on **`GCP_SERVICE_ACCOUNT_JSON`** to match the `GCP_PROJECT_ID` / `GCP_LOCATION`
    prefix the plan picks elsewhere. Phase 0 fixes the canonical names.

11. **Existing GEMINI envs stay until Phase 6.** Do not delete `GEMINI_API_KEY` /
    `GEMINI_MODEL` / `BUBBLE_AGENT_WEBHOOK_SECRET` / `BUDDY_AGENT_WEBHOOK_SECRET` /
    `ORGANIZER_AGENT_WEBHOOK_SECRET` until every webhook has been moved off the legacy
    function. Phase 6 is the only PR that performs deletions.

12. **Realtime contract: one `INSERT` per reply.** The current dispatchers carefully
    avoid post-insert `UPDATE`s for `execution_patch` (a live race documented and fixed
    in `docs/agents/coach/ARCHITECTURE_ASSESSMENT.md` §3.2; the fix is migration
    `20260729120000_agent_rpcs_persist_execution_patch.sql`). The new strategies must
    keep this — `applyServerGuards` runs in memory only; persistence is one RPC call,
    one row.

### Corrections to the proposed file layout

Most of the layout in the plan is good. Two adjustments based on the above:

- Move pure / Vitest-importable helpers (parsers, prompt strings, schemas) under
  `src/lib/agents/<slug>/` and **re-export** them from `supabase/functions/agents/<slug>.ts`.
  This eliminates the mirror-drift problem the Phase 4 deviation log describes
  (`docs/refactor/phase4-deviation-log.md:39`–`:50`).
- Add `_shared/dispatch/sentinel.ts` for the workout-open and onboarding-sentinel
  detection helpers. They are slug-aware (Coach owns `workout_player`; Buddy owns
  `ONBOARDING_STARTED`) but their detection primitives are generic enough to share.

### Out of scope (matches the plan)

- Streaming responses (`streamGenerateContent`).
- Tool / function-calling. `responseSchema` covers Coach today.
- Per-agent service accounts.
- Vertex Agent Builder / Reasoning Engine.
- DB-backed `agent_runtime_config` table. Per-agent knobs stay in code under
  `src/lib/agents/<slug>/config.ts` until non-engineers need to tune them.

---

## Conventions used in every phase doc

1. **"Inputs"** lists the prerequisite phase(s) and any environment artifacts.
2. **"Deliverables"** is an itemized list of files to create / modify, each as
   `path/to/file` so a planning agent can verify scope.
3. **"Step-by-step"** is sequenced and small enough to review one PR at a time.
4. **"Verification"** lists the exact log lines, DB queries, or tests that must pass
   before the phase is considered done.
5. **"Rollback"** is the explicit revert procedure if the cutover misbehaves.

Each phase ends with **"Hand-off to next phase"** so you can chain prompts cleanly.

---

## Reference reading (do not skip)

Before running any phase, the planning agent should re-read these files because they
encode behavior the new dispatcher must preserve byte-for-byte:

- `supabase/functions/bubble-agent-dispatch/index.ts` (Coach pipeline; the "hard" port).
- `supabase/functions/buddy-agent-dispatch/index.ts` (Buddy: sentinel + global identity).
- `supabase/functions/organizer-agent-dispatch/index.ts` (Organizer: write-gating).
- `supabase/migrations/20260729120000_agent_rpcs_persist_execution_patch.sql` (Coach RPCs).
- `supabase/migrations/20260623120000_coach_workout_draft_messages_metadata.sql` (draft RPC + finalize).
- `docs/agents/coach/README.md` (current Coach behavior matrix).
- `docs/agents/coach/ARCHITECTURE_ASSESSMENT.md` (known gaps + RESOLVED notes).
- `docs/refactor/phase4-deviation-log.md` (mirror-modules constraint, write-gating posture).
- `docs/bubble-agent-webhook.md` (legacy webhook setup; Phase 6 supersedes).
