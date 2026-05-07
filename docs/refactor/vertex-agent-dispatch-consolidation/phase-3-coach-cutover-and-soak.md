# Phase 3 — Cut the Coach DB webhook over to `agent-dispatch-v2` and soak

> No code changes. This phase moves Coach traffic from `bubble-agent-dispatch` to
> `agent-dispatch-v2` and validates parity. Buddy and Organizer remain on their
> legacy functions.

## Inputs

- Phase 2 merged. `agent-dispatch-v2` is deployed and Coach-only.
- The Supabase Database Webhook for Coach today exists as
  `bubble_agent_webhook` (or whatever you named it; verify via Dashboard →
  Database → Webhooks). It POSTs `messages` INSERT events to
  `/functions/v1/bubble-agent-dispatch` with `x-bubble-agent-secret`.
- `AGENT_WEBHOOK_SECRET` is set in Supabase secrets (Phase 0).

## Deliverables

1. A second Database Webhook **`agent_dispatch_webhook_v2`** that points at
   `agent-dispatch-v2` and uses the new header `x-agent-secret`. It runs **alongside**
   the legacy webhook for the soak window.
2. Updated `secrets-matrix.md` reflecting the parallel-run state.
3. Soak log committed at
   `docs/refactor/vertex-agent-dispatch-consolidation/soak-log-coach.md`.
4. Decision: cut over (delete legacy webhook) or roll back.

## Step-by-step

### 1. Stand up the parallel webhook

Create a new Database Webhook in Supabase Dashboard:

- Name: `agent_dispatch_webhook_v2`
- Table: `public.messages`
- Events: INSERT
- URL: `https://<project-ref>.supabase.co/functions/v1/agent-dispatch-v2`
- Method: POST
- Headers:
  - `x-agent-secret: <AGENT_WEBHOOK_SECRET>`

**Both webhooks now fire on every messages INSERT.** This is safe because:

- The legacy `bubble-agent-dispatch` only handles slug `coach`
  (`bubble-agent-dispatch/index.ts:1350`–`:1357`). Buddy/Organizer messages are
  short-circuited.
- `agent-dispatch-v2`'s registry today contains only `coach`, so Buddy/Organizer
  short-circuit there too.
- Both Coach paths call the same `agent_create_card_and_reply` RPC, which dedupes
  on `(trigger_message_id, agent_auth_user_id)` via
  `agent_message_runs` PK + advisory lock
  (`supabase/migrations/20260729120000_agent_rpcs_persist_execution_patch.sql:77`–`:79`).
  Whichever request wins the lock first inserts the reply; the other returns
  `deduped: true` and exits cleanly.

In other words: **double-firing produces exactly one reply, not two.**

### 2. Choose ONE for production by disabling the other

After 24–48 hours of parallel-run with both webhooks pointed at the same RPC, the
dedupe contract is exercised continuously. To actually flip the production path
without touching code:

1. **Disable `bubble_agent_webhook` (legacy) in the Dashboard.** Do not delete it
   yet; disabling preserves the URL/header config for instant re-enable on rollback.
2. Verify `agent-dispatch-v2` is now the sole source of Coach replies by inspecting
   structured logs filtered to `slug = 'coach'`.

### 3. Soak window — what to watch

Watch the new function's structured logs (Phase 1's `_shared/obs/log.ts` output) for
**at least 48 hours of real traffic**. Look for:

- `error_kind` distribution: `http` retries should be rare; `parse` and `shape`
  should be near zero (Coach has the most defensive parser of the three).
- `latency_ms` per `phase = 'llm_done'`: median should be similar to legacy
  (instrumentation in legacy is thin; compare against eyeball baseline of ~3–8s).
- `phase = 'fallback'` rate: spikes here indicate either Vertex auth failures
  (rotate the SA key), schema drift (Vertex returning a payload the parser
  rejects), or quota throttling.
- Realtime: clients receive **one** Coach `INSERT` per turn. No `UPDATE` follow-up
  for `execution_patch` (the migration already eliminated that — see
  `docs/agents/coach/ARCHITECTURE_ASSESSMENT.md` §3.2).

### 4. Manual verification matrix

For each of these, fire the trigger from a real client session in staging or
production (with monitoring window) and confirm the expected behavior:

| Trigger                                                             | Expected reply                                                        |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `@coach Hi` (first thread message)                                  | Conversational reply, **no** card created (Layer B turn gate)         |
| Plain message in fitness bubble (no `@coach`, default slug = coach) | Coach replies (root-default routing)                                  |
| Workout-player open (silent sentinel)                               | Short greeting via `geminiGenerateWorkoutOpenGreeting`, no card       |
| Mid-workout: "set 1 of bench at 135x8 done"                         | Reply + `execution_patch` on the same `messages` INSERT row           |
| `@coach update this card to add a fourth set`                       | `coach_draft` row inserted (`agent_insert_coach_workout_draft_reply`) |
| Vertex 5xx (induce by setting an invalid model id temporarily)      | Safe-reply text inserted via fallback path; HTTP 200 to webhook       |

For the Vertex-5xx case, do NOT use a real outage; set
`COACH_MODEL=invalid-model-name` via a Supabase secret override (or test in a local
function-serve session) to force a 404 from Vertex. Revert immediately after.

### 5. Soak log

Commit `docs/refactor/vertex-agent-dispatch-consolidation/soak-log-coach.md` with:

- Window dates and traffic volume.
- Per-error-kind counts.
- Any user-visible regressions (and their fixes).
- Final decision: **cut over** or **roll back**.

## Rollback

Two-step, both reversible:

1. **Re-enable `bubble_agent_webhook` (legacy)** in the Dashboard.
2. **Disable `agent_dispatch_webhook_v2`** so only one webhook fires.

This restores the pre-Phase-3 state in seconds. No code revert is required because
no source file moved.

If the new function itself is the problem (panic, runtime error), Supabase's webhook
retry policy plus the legacy function's continued availability means user-visible
impact is bounded to one delayed reply per affected message.

## Verification (gate to Phase 4)

- 48+ hours of `agent-dispatch-v2`-only Coach traffic with the legacy webhook
  disabled.
- `error_kind = 'parse' | 'shape'` count for Coach is **zero** during the soak window
  (these would indicate the schema lift was incomplete).
- `phase = 'fallback'` rate is comparable to or lower than legacy's pre-cutover
  rate. (If you do not have a baseline, accept ≤ 1% of Coach turns.)
- Soak log signed off and committed.

## Hand-off to next phase

Phase 4 expects:

- Coach is fully on `agent-dispatch-v2`.
- The legacy `bubble_agent_webhook` is **disabled** (not deleted).
- `bubble-agent-dispatch` Edge Function still exists; it just receives no webhook
  traffic.
- Soak log committed.
