# Coach cutover soak log (Phase 3)

Operational artifact for moving Coach traffic from `bubble-agent-dispatch` to
`agent-dispatch-v2`. This file is **both** the runbook the operator follows and
the audit trail of what was observed during the soak. Update the status banner
and data tables in-place as the cutover progresses.

> Phase spec: [`phase-3-coach-cutover-and-soak.md`](./phase-3-coach-cutover-and-soak.md).
> Secrets context: [`secrets-matrix.md`](./secrets-matrix.md).
> Vertex ops guide: [`docs/agents/vertex-setup.md`](../../agents/vertex-setup.md).

---

## Status

**Current status:** `pre_soak`

| State              | Meaning                                                                              |
| ------------------ | ------------------------------------------------------------------------------------ |
| `pre_soak`         | Plan committed; pre-flight not yet completed.                                        |
| `parallel_running` | Both webhooks (`bubble_agent_webhook` + `agent_dispatch_webhook_v2`) firing.         |
| `legacy_disabled`  | Legacy webhook toggled off; v2 is the sole Coach trigger; soak window ongoing.       |
| `cut_over`         | Soak window completed cleanly; Phase 4 unblocked.                                    |
| `rolled_back`      | Cutover aborted; legacy is sole Coach trigger again. See "Decision" section for why. |

Status transitions:

| When                                                   | New status         | Set by | Date |
| ------------------------------------------------------ | ------------------ | ------ | ---- |
| Pre-flight checklist complete + Step 1 webhook created | `parallel_running` |        |      |
| Step 5 legacy webhook disabled                         | `legacy_disabled`  |        |      |
| Verification gates met; decision recorded              | `cut_over`         |        |      |
| OR: rollback executed                                  | `rolled_back`      |        |      |

---

## Pre-flight checklist

Operator must verify each item below **before** Step 1. Tick the box and record
who/when in the rightmost column.

| Item                                                                                                                                                                           | Verified by | Date |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ---- |
| Phase 2 PR merged on `main`.                                                                                                                                                   |             |      |
| `supabase functions deploy agent-dispatch-v2 --no-verify-jwt` succeeded against production. Capture the CLI output URL/version somewhere.                                      |             |      |
| Production env vars set on `agent-dispatch-v2`: `GCP_PROJECT_ID`, `GCP_LOCATION`, `GCP_SERVICE_ACCOUNT_JSON`, `AGENT_WEBHOOK_SECRET`.                                          |             |      |
| `LLM_TIMEOUT_MS` either unset (defaults to 25000ms via [`supabase/functions/_shared/env.ts`](../../../supabase/functions/_shared/env.ts)) or explicitly set to a value ≥ 1000. |             |      |
| `[functions.agent-dispatch-v2] verify_jwt = false` present in [`supabase/config.toml`](../../../supabase/config.toml) (Phase 1 added this).                                    |             |      |
| `agent_dispatch_webhook_v2` does **not** exist yet (verify in Dashboard → Database → Webhooks).                                                                                |             |      |
| `bubble_agent_webhook` (legacy) is **enabled** and pointing at `bubble-agent-dispatch`.                                                                                        |             |      |
| Smoke-tested v2 reachability with [`scripts/smoke-agent-dispatch-v2.ts`](../../../scripts/smoke-agent-dispatch-v2.ts) (or equivalent direct curl with `x-agent-secret`).       |             |      |

---

## Operator runbook

### Step 1 — Stand up the parallel webhook

Dashboard → Database → Webhooks → Create:

| Field   | Value                                                                                                           |
| ------- | --------------------------------------------------------------------------------------------------------------- |
| Name    | `agent_dispatch_webhook_v2`                                                                                     |
| Table   | `public.messages`                                                                                               |
| Events  | INSERT only (do **not** check UPDATE/DELETE)                                                                    |
| URL     | `https://<project-ref>.supabase.co/functions/v1/agent-dispatch-v2`                                              |
| Method  | `POST`                                                                                                          |
| Headers | `x-agent-secret: <AGENT_WEBHOOK_SECRET value>` (same value the legacy webhook uses for `x-bubble-agent-secret`) |

Save. Both webhooks now fire on every `messages` INSERT. Update status to
`parallel_running` above.

> **Why this is safe.** Both Coach paths converge on `agent_create_card_and_reply`,
> which takes `pg_advisory_xact_lock(hashtextextended(trigger_message_id || agent_auth_user_id, 0))`
> and unique-keys on `agent_message_runs (trigger_message_id, agent_auth_user_id)`.
> See [`supabase/migrations/20260729120000_agent_rpcs_persist_execution_patch.sql`](../../../supabase/migrations/20260729120000_agent_rpcs_persist_execution_patch.sql)
> lines 77–94. Whichever request wins the lock first writes the reply; the loser
> returns `deduped: true` and exits. Buddy/Organizer messages are short-circuited
> on both paths today (legacy filters via `DISPATCHER_ALLOWED_SLUGS = new Set(['coach'])`
> at [`supabase/functions/bubble-agent-dispatch/index.ts`](../../../supabase/functions/bubble-agent-dispatch/index.ts)
> line 1350; v2's registry contains only Coach), so dual-firing only matters for
> Coach traffic.

### Step 2 — Verify dedupe is working

After ~15 minutes of dual-fire (need real Coach turns; a single test message is
enough), run against the production database:

```sql
select trigger_message_id, agent_auth_user_id, count(*) as runs
from public.agent_message_runs
where created_at > now() - interval '1 hour'
group by 1, 2
having count(*) > 1
limit 10;
```

**Expected:** zero rows. Each `(trigger_message_id, agent_auth_user_id)` pair
appears in `agent_message_runs` exactly once regardless of how many webhooks
fire. If rows appear, **stop and roll back** (see Rollback procedure below) —
the advisory-lock contract is broken and continuing risks user-visible
duplicates.

Also spot-check that no Coach turn produced two reply rows:

```sql
select trigger_message_id, count(distinct reply_message_id) as replies
from public.agent_message_runs
where created_at > now() - interval '1 hour'
group by 1
having count(distinct reply_message_id) > 1
limit 10;
```

Expected: zero rows.

### Step 3 — Soak window (48+ hours)

Watch v2's structured logs (Phase 1 emits one JSON line per `phase` via
[`supabase/functions/_shared/obs/log.ts`](../../../supabase/functions/_shared/obs/log.ts)).
The dispatcher pipeline emits `phase` values `received → routed → preflight? →
llm_call → llm_done → parsed → guarded → persisted → done`, and `fallback` on
the degraded path. Every line carries `request_id`, `slug`, `message_id`,
`bubble_id`.

Concrete log queries — record results nightly into the data tables below. Use
Supabase Logs Explorer (or the `supabase functions logs agent-dispatch-v2`
CLI) and filter on the JSON fields.

| Metric             | Filter                                                                                                              | Pass criterion                                                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Total Coach turns  | `slug = "coach" AND phase = "done"`                                                                                 | Use as denominator for the rate metrics below.                                                                                                                                                                                                |
| Error distribution | `slug = "coach" AND error_kind IS NOT NULL` group by `error_kind` (`http` / `parse` / `shape` / `timeout` / `auth`) | `parse` and `shape` are **0**; `http` and `timeout` rare.                                                                                                                                                                                     |
| Fallback rate      | `slug = "coach" AND phase = "fallback"` count ÷ total turns                                                         | ≤ 1% (or comparable to legacy baseline if known).                                                                                                                                                                                             |
| Latency p50/p95    | `slug = "coach" AND phase = "llm_done"` median / p95 of `latency_ms`                                                | Comparable to legacy ~3–8s eyeball baseline.                                                                                                                                                                                                  |
| Auth failures      | `level = "error" AND error_kind = "auth"`                                                                           | **0**. Any occurrence is a paging condition; rotate `GCP_SERVICE_ACCOUNT_JSON` per [`docs/agents/vertex-setup.md`](../../agents/vertex-setup.md) §4.                                                                                          |
| Realtime hygiene   | `messages` table inspection                                                                                         | Exactly one Coach `INSERT` per turn; no follow-up `UPDATE`s for `execution_patch`. (Already enforced by the Phase 2 RPC migration; see [`docs/agents/coach/ARCHITECTURE_ASSESSMENT.md`](../../agents/coach/ARCHITECTURE_ASSESSMENT.md) §3.2.) |

### Step 4 — Manual verification matrix

Fire each trigger from a real client session (staging if available, otherwise
production with a short monitoring window). Record outcome in the table.

| #   | Trigger                                                                                                         | Expected reply                                                                                                                                                     | Tester | Date | request_id | Result | Notes |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ---- | ---------- | ------ | ----- |
| 1   | `@coach Hi` (first thread message)                                                                              | Conversational reply, **no** card created (Layer B turn gate in `applyCoachServerGuards`).                                                                         |        |      |            |        |       |
| 2   | Plain message in fitness bubble (no `@coach`, default slug = coach)                                             | Coach replies (root-default routing in `agent-dispatch-v2/resolve.ts`).                                                                                            |        |      |            |        |       |
| 3   | Workout-player open (silent sentinel, `is_silent_sentinel: true` + `workout_context.source = 'workout_player'`) | Short greeting via the Coach preflight (`COACH_WORKOUT_GREETING_SCHEMA`); no card; reply persisted via `agent_create_card_and_reply` with `p_create_card = false`. |        |      |            |        |       |
| 4   | Mid-workout: "set 1 of bench at 135x8 done"                                                                     | Reply + `execution_patch` on the same `messages` INSERT row. `create_card` clamped to false by guard.                                                              |        |      |            |        |       |
| 5   | `@coach update this card to add a fourth set`                                                                   | `coach_draft` row inserted via `agent_insert_coach_workout_draft_reply` (not `agent_create_card_and_reply`).                                                       |        |      |            |        |       |
| 6   | Induced failure (see Step 4a)                                                                                   | Safe-reply text inserted via fallback path; HTTP 200 to webhook; `phase = "fallback"` log line.                                                                    |        |      |            |        |       |

### Step 4a — Induced-failure test (Vertex 4xx)

This proves the fallback path works end-to-end without modifying source code.
Per the Phase 3 charter, no code changes; we induce the failure via env only.

> **Note.** The Phase 3 spec mentions `COACH_MODEL=invalid-model-name`. That env
> var does not exist — the model is hard-coded in `COACH_MODEL_DEFAULT` at
> [`supabase/functions/agents/coach/config.ts`](../../../supabase/functions/agents/coach/config.ts)
> line 17. We use `GCP_LOCATION` instead, which is honored at request time by
> [`supabase/functions/_shared/llm/vertex-gemini.ts`](../../../supabase/functions/_shared/llm/vertex-gemini.ts).

Procedure:

1. **Capture the current `GCP_LOCATION` value.** Record it here so the revert is
   exact:

   ```text
   GCP_LOCATION (pre-test): __________________
   ```

2. Dashboard → Edge Functions → `agent-dispatch-v2` → Secrets → set
   `GCP_LOCATION` to a region known to **not** publish `gemini-2.5-flash`.
   Suggested first try: `me-west1`. If that region adds the model in the future,
   pick any other unsupported region (verify against the Vertex publisher
   catalogue at the GCP Console). Save.
3. Wait ~30s for the function to redeploy with the new env.
4. Send one Coach message from a staging session (or a designated test thread
   in production).
5. Verify in Supabase Edge Function logs filtered to `slug = "coach"`:
   - One `level = warn` line with `error_kind = "http"`.
   - One `phase = "fallback"` line with `fallback_ok = true`.
6. Verify in DB: a `messages` row authored by the Coach agent with
   `content = "I experienced a technical hiccup calculating your workout. Could you repeat that?"`
   (this is `COACH_SAFE_REPLY_TEXT` from
   [`supabase/functions/agents/coach/config.ts`](../../../supabase/functions/agents/coach/config.ts)
   line 35).
7. **Immediately revert** `GCP_LOCATION` to the value captured in step 1. Save.
8. Wait ~30s, send one more Coach message, verify the next turn returns
   `phase = "done"` (fallback path is no longer triggered).

Edge case: if step 5 shows `error_kind = "auth"` instead of `"http"` (the
region change invalidated the OAuth scope or service-endpoint mapping), either
pick a different unsupported region and retry, or accept the `auth`-path
fallback as equivalent proof — the user-visible outcome is identical
(`COACH_SAFE_REPLY_TEXT` inserted, HTTP 200 to webhook). Document which path
was observed in the matrix table above.

### Step 5 — Disable the legacy webhook

After 48+ hours of `parallel_running` with all error budgets met (Step 3 table
green) and all manual verification (Step 4 table green):

1. Dashboard → Database → Webhooks → `bubble_agent_webhook` → toggle to
   **disabled**.
2. **Do not delete.** The disabled state preserves URL/header/secret config for
   instant re-enable on rollback.
3. Confirm subsequent Coach turns are sourced only from v2 by filtering
   Supabase Edge Function logs to `slug = "coach"` for the next ~30 minutes and
   noting the absence of `[bubble-agent-dispatch]` console-prefixed lines (the
   legacy function uses `console.error` / `console.log` rather than the
   structured `_shared/obs/log.ts` JSON output).
4. Update status banner to `legacy_disabled` and continue the soak through the
   remainder of the 48-hour window (counting from this disable timestamp, per
   the verification gate below).

---

## Soak data

Operator fills these in during/after the soak. Add rows as needed.

### Window

| Item                                   | Value |
| -------------------------------------- | ----- |
| Soak start (`parallel_running`)        |       |
| Legacy disabled (`legacy_disabled`)    |       |
| Soak end (`cut_over` or `rolled_back`) |       |
| Total Coach turns observed             |       |

### Per-error-kind counts (cumulative over window)

| `error_kind` | Count | % of total turns |
| ------------ | ----- | ---------------- |
| `http`       |       |                  |
| `parse`      |       |                  |
| `shape`      |       |                  |
| `timeout`    |       |                  |
| `auth`       |       |                  |

### Latency

| Day | p50 (ms) | p95 (ms) | Notes |
| --- | -------- | -------- | ----- |
|     |          |          |       |
|     |          |          |       |

### Fallback rate

| Day | Total turns | Fallback turns | Rate (%) |
| --- | ----------- | -------------- | -------- |
|     |             |                |          |
|     |             |                |          |

### User-visible regressions

| Timestamp | request_id | Description | Fix |
| --------- | ---------- | ----------- | --- |
|           |            |             |     |

### Verification matrix results

(Filled in inline in Step 4's table above. Cross-reference any failures here.)

---

## Decision

**Final outcome:** _to be recorded once._

| Field      | Value                                 |
| ---------- | ------------------------------------- |
| Decision   | `cut_over` / `roll_back` (circle one) |
| Decided by |                                       |
| Date       |                                       |
| Rationale  |                                       |

If `cut_over`, proceed to Phase 4. If `roll_back`, follow the procedure below
and document the root cause in the "User-visible regressions" table.

---

## Rollback procedure

Two-step, both reversible. Re-enable the legacy webhook **first** to avoid a
brief window where neither webhook is firing on `messages` INSERT events.

1. Dashboard → Database → Webhooks → `bubble_agent_webhook` → toggle to
   **enabled**.
2. Dashboard → Database → Webhooks → `agent_dispatch_webhook_v2` → toggle to
   **disabled** (do not delete; we may want to retry after a fix).
3. Update status banner to `rolled_back`.
4. No code revert is required because no source file moved during Phase 3.
5. If the new function itself is the problem (panic, runtime error, persistent
   `error_kind = "auth"`), Supabase's webhook retry policy plus the legacy
   function's continued availability bound user-visible impact to one delayed
   reply per affected message during the rollback window.

---

## Verification gates (must all pass before status → `cut_over`)

These are the same gates listed in
[`phase-3-coach-cutover-and-soak.md`](./phase-3-coach-cutover-and-soak.md)
"Verification (gate to Phase 4)". Tick each row.

| Gate                                                                                                       | Met? |
| ---------------------------------------------------------------------------------------------------------- | ---- |
| 48+ hours of `agent-dispatch-v2`-only Coach traffic with the legacy webhook disabled.                      |      |
| `error_kind ∈ {parse, shape}` count for Coach is **0** during the soak window.                             |      |
| `phase = fallback` rate is comparable to or lower than legacy's pre-cutover rate (or ≤ 1% if no baseline). |      |
| Manual verification matrix (Step 4) all green.                                                             |      |
| Soak data tables filled in.                                                                                |      |
| Decision section completed and signed.                                                                     |      |

---

## Hand-off to Phase 4

When status is `cut_over`, the next phase
([`phase-4-organizer-strategy-port.md`](./phase-4-organizer-strategy-port.md))
expects:

- `agent_dispatch_webhook_v2` is the sole Coach trigger.
- `bubble_agent_webhook` is **disabled** (not deleted).
- `bubble-agent-dispatch` Edge Function still exists; it just receives no
  webhook traffic. Phase 6 deletes it.
- This soak log is committed and signed off.
