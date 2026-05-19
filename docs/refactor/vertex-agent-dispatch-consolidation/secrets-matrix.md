# Vertex Agent Dispatch Secrets Matrix

Last updated: 2026-05-08 (Phase 5 cutover note appended)

## Critical: do not delete or empty `AGENT_WEBHOOK_SECRET`

If **`AGENT_WEBHOOK_SECRET`** is removed or cleared on the hosted **`agent-dispatch`** Edge Function while the Supabase **Database Webhook** (or `pg_net`) still sends `x-agent-secret` / `Authorization: Bearer …`, every invocation fails **`verifyAndParseWebhook`** with `{ "ok": false, "error": "unauthorized" }` and **HTTP 200**. No strategy runs, **no `messages` rows are inserted by agents**, and the product looks like “routing or Vertex is broken” for all bubbles.

**Safe practices**

- **Rotate, do not delete:** set the new value first (`supabase secrets set AGENT_WEBHOOK_SECRET=…` or Dashboard), update the webhook header to the same value, redeploy the function if required, then retire the old value from your password manager only.
- **To intentionally stop dispatch:** disable the Database Webhook (or the trigger), not by blanking secrets.
- **Pair check:** after any Dashboard edit to Edge secrets, confirm the webhook’s **`x-agent-secret`** still matches (copy/paste error causes the same symptom).

---

This file is the migration ledger for agent-dispatch secrets. Its purpose is to
prevent accidental secret deletion while `bubble-agent-dispatch`,
`buddy-agent-dispatch`, `organizer-agent-dispatch`, and the new
`agent-dispatch-v2` run in parallel during the Vertex AI consolidation.

Do not delete a legacy secret until the row below says Phase 6 deletes it and the
Phase 6 cutover has completed.

## Secret Status

| Secret                                 | Live consumers today                                                             | Phase 1 consumer    | Phase 6 status |
| -------------------------------------- | -------------------------------------------------------------------------------- | ------------------- | -------------- |
| `GCP_PROJECT_ID`                       | **`agent-dispatch`** (`readDispatcherEnv` → Vertex `generateContent`)            | `agent-dispatch-v2` | live           |
| `GCP_LOCATION`                         | **`agent-dispatch`** (same)                                                      | `agent-dispatch-v2` | live           |
| `GCP_SERVICE_ACCOUNT_JSON`             | **`agent-dispatch`** (same)                                                      | `agent-dispatch-v2` | live           |
| `AGENT_WEBHOOK_SECRET`                 | **`agent-dispatch`** Edge Function + Database Webhook `x-agent-secret` / Bearer  | `agent-dispatch`    | live           |
| `LLM_TIMEOUT_MS`                       | **`agent-dispatch`** (same)                                                      | `agent-dispatch-v2` | live           |
| `COACH_MERGE_WORKOUT_METADATA`         | **`agent-dispatch`** (optional; `readDispatcherEnv` → Coach rail metadata merge) | `agent-dispatch-v2` | live           |
| `COACH_BLOCK_APPEND_MICRO_REPLY`       | **`agent-dispatch`** (optional; Lane 1 templated reply polish only)              | `agent-dispatch-v2` | live           |
| `GEMINI_API_KEY`                       | `bubble-agent-dispatch`, `buddy-agent-dispatch`, `organizer-agent-dispatch`      | unchanged           | deleted        |
| `GEMINI_MODEL` / `VERTEX_GEMINI_MODEL` | `bubble-agent-dispatch`                                                          | unchanged           | deleted        |
| `BUDDY_GEMINI_MODEL`                   | `buddy-agent-dispatch`                                                           | unchanged           | deleted        |
| `ORGANIZER_GEMINI_MODEL`               | `organizer-agent-dispatch`                                                       | unchanged           | deleted        |
| `BUBBLE_AGENT_WEBHOOK_SECRET`          | `bubble-agent-dispatch`                                                          | unchanged           | deleted        |
| `BUDDY_AGENT_WEBHOOK_SECRET`           | `buddy-agent-dispatch`                                                           | unchanged           | deleted        |
| `ORGANIZER_AGENT_WEBHOOK_SECRET`       | `organizer-agent-dispatch`                                                       | unchanged           | deleted        |
| `*_GEMINI_FETCH_TIMEOUT_MS`            | respective legacy dispatchers                                                    | unchanged           | deleted        |

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
- `COACH_MERGE_WORKOUT_METADATA` (optional) — when set to `1`, Coach rail `persist` runs `mergeCoachProposedIntoTaskMetadata` before `agent_update_task_and_reply` so `ai_workout_factory.workout_set` and flat `exercises` stay aligned. **Required for Lane 1/2 `:` composer block append** (preflight `short_circuit_with_persist`). Omit or any value other than `1`: block-mention turns fall through to Lane 3 (full Coach schema).
- `COACH_BLOCK_APPEND_MICRO_REPLY` (optional) — when set to `1`, Lane 1 deterministic block append runs a short text-only micro-call to polish the templated `reply_content`. Default off (zero LLM for Lane 1 structure).

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

## Phase 5 cutover state

Phase 5 registers Buddy in `agent-dispatch-v2` and **disables** the legacy
`buddy_dispatch_webhook` in the same Dashboard session. Like Phase 4 and unlike
Phase 3, this is a hard cutover — no parallel soak window. The reason is the
same idempotency gap:

- `public.buddy_create_onboarding_reply` (Buddy) has **no** `agent_message_runs`
  dedupe and **no** advisory lock (see
  `supabase/migrations/20260701140000_buddy_rpc.sql`). The RPC takes neither a
  `p_trigger_message_id` nor any unique-key arg, so two webhooks firing in
  parallel would produce two visible Buddy replies — and Buddy fires on every
  onboarding event, making duplicate replies user-visible immediately.
- Buddy is also workspace-global (no `bubble_agent_bindings` rows; see
  `supabase/migrations/20260701150000_buddy_agent_rls_workspace_global.sql`),
  so a parallel soak would touch every workspace's onboarding flow at once.

Implications for this matrix:

- **Active webhooks after Phase 5**: `bubble_agent_webhook` (legacy Coach,
  retained per the Phase 3 dual-soak), `agent_dispatch_webhook_v2` (Coach +
  Organizer + Buddy via `REGISTRY_ITERATION_ORDER`). The Buddy-only
  `buddy_dispatch_webhook` is **disabled** but not deleted; rollback flips it
  back on. The Organizer-only `organizer_dispatch_webhook` remains disabled
  per Phase 4.
- **No legacy secret is deleted in Phase 5.** `BUDDY_AGENT_WEBHOOK_SECRET`,
  `BUDDY_GEMINI_MODEL`, `BUDDY_GEMINI_FETCH_TIMEOUT_MS`, `BUDDY_AGENT_DEBUG`,
  `GEMINI_API_KEY`, and `GEMINI_MODEL` remain live consumers of the
  deployed-but-idle `buddy-agent-dispatch` function until Phase 6 deletes the
  legacy directory (per the table's "Phase 6 status" column).
- **Resolver behavior change is workspace-wide.** Phase 5 rewrites
  `agent-dispatch-v2/resolve.ts` from a single bindings-joined query to a
  two-query split (`agent_definitions` for all registered slugs +
  `bubble_agent_bindings` for sort_order). Every Coach and Organizer turn now
  flows through this new path. Spot-check 5 known Coach + 5 known Organizer
  turns in the first hour of the soak per `soak-log-buddy.md` §rollback.
- **No new env var is introduced.** Buddy reads only the shared Phase 1
  variables (`GCP_PROJECT_ID`, `GCP_LOCATION`, `GCP_SERVICE_ACCOUNT_JSON`,
  `LLM_TIMEOUT_MS`, `AGENT_WEBHOOK_SECRET`) plus the `is_active` flag on its
  `agent_definitions` row — no `BUDDY_*` env var is migrated to v2; the
  legacy ones remain only because the legacy dispatcher is still deployed.

Operational state, per-trigger validation, induced-failure procedure
(onboarding sentinel + Coach-mention exclusion), and the final cut-over /
roll-back decision are recorded in
[`./soak-log-buddy.md`](./soak-log-buddy.md).
