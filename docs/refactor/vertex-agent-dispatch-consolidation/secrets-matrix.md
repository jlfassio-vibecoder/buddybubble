# Vertex Agent Dispatch Secrets Matrix

Last updated: 2026-05-07 (Phase 4 cutover note appended)

This file is the migration ledger for agent-dispatch secrets. Its purpose is to
prevent accidental secret deletion while `bubble-agent-dispatch`,
`buddy-agent-dispatch`, `organizer-agent-dispatch`, and the new
`agent-dispatch-v2` run in parallel during the Vertex AI consolidation.

Do not delete a legacy secret until the row below says Phase 6 deletes it and the
Phase 6 cutover has completed.

## Secret Status

| Secret                                 | Live consumers today                                                        | Phase 1 consumer    | Phase 6 status |
| -------------------------------------- | --------------------------------------------------------------------------- | ------------------- | -------------- |
| `GCP_PROJECT_ID`                       | none                                                                        | `agent-dispatch-v2` | live           |
| `GCP_LOCATION`                         | none                                                                        | `agent-dispatch-v2` | live           |
| `GCP_SERVICE_ACCOUNT_JSON`             | none                                                                        | `agent-dispatch-v2` | live           |
| `AGENT_WEBHOOK_SECRET`                 | none                                                                        | `agent-dispatch-v2` | live           |
| `LLM_TIMEOUT_MS`                       | none                                                                        | `agent-dispatch-v2` | live           |
| `GEMINI_API_KEY`                       | `bubble-agent-dispatch`, `buddy-agent-dispatch`, `organizer-agent-dispatch` | unchanged           | deleted        |
| `GEMINI_MODEL` / `VERTEX_GEMINI_MODEL` | `bubble-agent-dispatch`                                                     | unchanged           | deleted        |
| `BUDDY_GEMINI_MODEL`                   | `buddy-agent-dispatch`                                                      | unchanged           | deleted        |
| `ORGANIZER_GEMINI_MODEL`               | `organizer-agent-dispatch`                                                  | unchanged           | deleted        |
| `BUBBLE_AGENT_WEBHOOK_SECRET`          | `bubble-agent-dispatch`                                                     | unchanged           | deleted        |
| `BUDDY_AGENT_WEBHOOK_SECRET`           | `buddy-agent-dispatch`                                                      | unchanged           | deleted        |
| `ORGANIZER_AGENT_WEBHOOK_SECRET`       | `organizer-agent-dispatch`                                                  | unchanged           | deleted        |
| `*_GEMINI_FETCH_TIMEOUT_MS`            | respective legacy dispatchers                                               | unchanged           | deleted        |

## Update Protocol

Each phase PR that changes secret ownership must update this file in the same
commit:

- Phase 1 introduces `agent-dispatch-v2` as the first consumer of
  `GCP_PROJECT_ID`, `GCP_LOCATION`, `GCP_SERVICE_ACCOUNT_JSON`,
  `AGENT_WEBHOOK_SECRET`, and `LLM_TIMEOUT_MS`.
- Phases 2 through 5 may add notes as each agent is moved to `agent-dispatch-v2`,
  but must leave legacy secrets present until the matching legacy webhook is
  disabled and soaked.
- Phase 6 is the only phase that deletes the legacy Gemini API key, per-agent
  webhook secrets, per-agent model env vars, and per-agent timeout env vars.

Reference phases:

- [Phase 1 shared foundations](./phase-1-shared-foundations.md)
- [Phase 6 cutover, deletion, and rename](./phase-6-cutover-deletion-and-rename.md)

## Where Each Consumer Reads It

### New consolidated dispatcher

Operational guide for these secrets — including IAM, key rotation cadence, and
Cloud Logging alerts — lives in [`docs/agents/vertex-setup.md`](../../agents/vertex-setup.md).

Phase 2 wires the dispatcher entry: `agent-dispatch-v2/index.ts` calls
`readDispatcherEnv()` at boot, so all five Phase 1 variables are now actively
read at module load:

- `GCP_PROJECT_ID` — passed to `_shared/llm/vertex-gemini.ts:generateContent`.
- `GCP_LOCATION` — same.
- `GCP_SERVICE_ACCOUNT_JSON` — passed to `_shared/llm/vertex-auth.ts:getVertexAccessToken`.
- `AGENT_WEBHOOK_SECRET` — passed to `_shared/dispatch/webhook.ts:verifyAndParseWebhook`.
- `LLM_TIMEOUT_MS` — passed to `generateContent.timeoutMs` and (re-read inside the Coach preflight) to the workout-greeting sub-call.

No legacy secrets move yet — Phase 3 owns the webhook cutover for Coach.

### Coach legacy dispatcher

- `BUBBLE_AGENT_WEBHOOK_SECRET` is read in
  `supabase/functions/bubble-agent-dispatch/index.ts:1273`.
- `GEMINI_API_KEY` is read in
  `supabase/functions/bubble-agent-dispatch/index.ts:1274`.
- `GEMINI_MODEL` is read in
  `supabase/functions/bubble-agent-dispatch/index.ts:1466`.
- `VERTEX_GEMINI_MODEL` is read in
  `supabase/functions/bubble-agent-dispatch/index.ts:1467`.
- `GEMINI_FETCH_TIMEOUT_MS` is read in
  `supabase/functions/bubble-agent-dispatch/index.ts:1475`.

### Buddy legacy dispatcher

- `BUDDY_AGENT_WEBHOOK_SECRET` is read in
  `supabase/functions/buddy-agent-dispatch/index.ts:277`.
- `GEMINI_API_KEY` is read in
  `supabase/functions/buddy-agent-dispatch/index.ts:434`.
- `BUDDY_GEMINI_MODEL` is read in
  `supabase/functions/buddy-agent-dispatch/index.ts:441`.
- `GEMINI_MODEL` is read in
  `supabase/functions/buddy-agent-dispatch/index.ts:442`.
- `BUDDY_GEMINI_FETCH_TIMEOUT_MS` is read in
  `supabase/functions/buddy-agent-dispatch/index.ts:445`.
- `BUDDY_AGENT_DEBUG` is read in
  `supabase/functions/buddy-agent-dispatch/index.ts:520`.

### Organizer legacy dispatcher

- `ORGANIZER_AGENT_WEBHOOK_SECRET` is read in
  `supabase/functions/organizer-agent-dispatch/index.ts:399`.
- `GEMINI_API_KEY` is read in
  `supabase/functions/organizer-agent-dispatch/index.ts:505`.
- `ORGANIZER_GEMINI_MODEL` is read in
  `supabase/functions/organizer-agent-dispatch/index.ts:512`.
- `GEMINI_MODEL` is read in
  `supabase/functions/organizer-agent-dispatch/index.ts:513`.
- `ORGANIZER_GEMINI_FETCH_TIMEOUT_MS` is read in
  `supabase/functions/organizer-agent-dispatch/index.ts:516`.
- `ORGANIZER_AGENT_DEBUG` is read in
  `supabase/functions/organizer-agent-dispatch/index.ts:582`.
- `ORGANIZER_WRITES_ENABLED` is read in
  `supabase/functions/organizer-agent-dispatch/index.ts:596`.

## Phase 3 parallel-run state

Phase 3 cuts the Coach Database Webhook over to `agent-dispatch-v2` while
leaving the legacy `bubble-agent-dispatch` function deployed. Both webhooks
fire on every `messages` INSERT during the soak window:

- `bubble_agent_webhook` (legacy) → `bubble-agent-dispatch`, header
  `x-bubble-agent-secret`, value sourced from `BUBBLE_AGENT_WEBHOOK_SECRET`.
- `agent_dispatch_webhook_v2` (new) → `agent-dispatch-v2`, header
  `x-agent-secret`, value sourced from `AGENT_WEBHOOK_SECRET`.

Both Coach paths converge on `public.agent_create_card_and_reply`, which takes
`pg_advisory_xact_lock(hashtextextended(trigger_message_id || agent_auth_user_id, 0))`
and unique-keys on `agent_message_runs (trigger_message_id, agent_auth_user_id)`
(see `supabase/migrations/20260729120000_agent_rpcs_persist_execution_patch.sql`
lines 77–94). Whichever request wins the lock first writes the reply; the loser
returns `deduped: true` and exits. Net effect: dual-firing produces exactly one
user-visible reply per Coach turn.

Implications for this matrix:

- No legacy secret is deleted in Phase 3. `BUBBLE_AGENT_WEBHOOK_SECRET`,
  `GEMINI_API_KEY`, `GEMINI_MODEL`, `VERTEX_GEMINI_MODEL`, and
  `GEMINI_FETCH_TIMEOUT_MS` remain live consumers of `bubble-agent-dispatch`
  until Phase 6 deletes the legacy function (per the table's "Phase 6 status"
  column).
- Both `BUBBLE_AGENT_WEBHOOK_SECRET` and `AGENT_WEBHOOK_SECRET` should hold the
  **same value** during the soak so a single rotation event covers both
  webhooks. Phase 6 retires the legacy name.
- Secret rotation cadence and Cloud Logging alerts for the new consumer are
  documented in [`docs/agents/vertex-setup.md`](../../agents/vertex-setup.md)
  §4 and §6.

Operational state, per-trigger validation, induced-failure procedure, and the
final cut-over / roll-back decision are recorded in
[`./soak-log-coach.md`](./soak-log-coach.md).

## Phase 4 cutover state

Phase 4 registers Organizer in `agent-dispatch-v2` and **disables** the legacy
`organizer_dispatch_webhook` in the same Dashboard session. Unlike Phase 3,
this is a hard cutover, not a parallel soak. The reason is structural:

- `public.agent_create_card_and_reply` (Coach) holds an advisory lock and a
  unique key on `agent_message_runs (trigger_message_id, agent_auth_user_id)`,
  so dual-firing collapses into one reply (see `supabase/migrations/20260729120000_agent_rpcs_persist_execution_patch.sql`).
- `public.organizer_create_reply_and_task` (Organizer) has **no** equivalent
  idempotency layer (see `supabase/migrations/20260723140000_organizer_rpc.sql`):
  no `p_trigger_message_id` arg, no advisory lock, no `agent_message_runs` row.
  Two webhooks firing in parallel would produce two visible Organizer replies.

Phase 4 chooses Phase 4 spec option (b) — disable the legacy webhook the moment
v2 picks Organizer up — rather than retro-adding an idempotency table to the
Organizer RPC, because Organizer traffic is low and rollback is one Dashboard
toggle (re-enable `organizer_dispatch_webhook`).

Implications for this matrix:

- **Active webhooks after Phase 4**: `bubble_agent_webhook` (legacy Coach,
  retained per Phase 3 dual-soak — see prior section), `agent_dispatch_webhook_v2`
  (Coach + Organizer via `REGISTRY_ITERATION_ORDER`). The Organizer-only
  `organizer_dispatch_webhook` is **disabled** but not deleted; rollback flips it
  back on.
- **No legacy secret is deleted in Phase 4.** `ORGANIZER_AGENT_WEBHOOK_SECRET`,
  `GEMINI_API_KEY`, `ORGANIZER_GEMINI_MODEL`, `GEMINI_MODEL`,
  `ORGANIZER_GEMINI_FETCH_TIMEOUT_MS`, and `ORGANIZER_AGENT_DEBUG` remain live
  consumers of the deployed-but-idle `organizer-agent-dispatch` function until
  Phase 6 deletes the legacy directory (per the table's "Phase 6 status" column).
- **`ORGANIZER_WRITES_ENABLED` is now read by `agent-dispatch-v2`** via
  `_shared/env.ts:readDispatcherEnv()` — typed as `ORGANIZER_WRITES_ENABLED:
boolean` on `DispatcherEnv`, with the same `=== '1'` semantic the legacy
  function uses at `organizer-agent-dispatch/index.ts:596`. Set the same value on
  both functions during the Phase 4 deploy window so a rollback to the legacy
  webhook does not flip the writes-gating flag implicitly.

Operational state, per-trigger validation, induced-failure procedure
(`ORGANIZER_WRITES_ENABLED=1` toggle), and the final cut-over / roll-back
decision are recorded in [`./soak-log-organizer.md`](./soak-log-organizer.md).
