# Organizer cutover soak log (Phase 4)

Operational artifact for moving Organizer traffic from
`organizer-agent-dispatch` to `agent-dispatch-v2`. This file is **both** the
runbook the operator follows and the audit trail of what was observed during
the soak. Update the status banner and data tables in-place as the cutover
progresses.

> Phase spec: [`phase-4-organizer-strategy-port.md`](./phase-4-organizer-strategy-port.md).
> Secrets context: [`secrets-matrix.md`](./secrets-matrix.md) ("Phase 4 cutover state").
> Vertex ops guide: [`docs/agents/vertex-setup.md`](../../agents/vertex-setup.md).
> Coach precedent (parallel-soak model): [`soak-log-coach.md`](./soak-log-coach.md).

---

## Status

**Current status:** `pre_cutover`

| State           | Meaning                                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pre_cutover`   | Plan committed; pre-flight not yet completed.                                                                                           |
| `cut_over`      | `agent-dispatch-v2` registry deploy complete AND `organizer_dispatch_webhook` disabled in the same Dashboard session. Soak ongoing.     |
| `soak_complete` | Soak window completed cleanly; Phase 5 unblocked.                                                                                       |
| `rolled_back`   | Cutover aborted; legacy `organizer_dispatch_webhook` re-enabled and Organizer removed from v2 registry. See "Decision" section for why. |

Status transitions:

| When                                                                            | New status      | Set by | Date |
| ------------------------------------------------------------------------------- | --------------- | ------ | ---- |
| Pre-flight checklist complete + Step 1 deploy succeeded + Step 2 toggle flipped | `cut_over`      |        |      |
| Verification gates met; decision recorded                                       | `soak_complete` |        |      |
| OR: rollback executed                                                           | `rolled_back`   |        |      |

> **Why this is a hard cutover (not a parallel soak).** Coach got a 48h dual
> webhook window because [`agent_create_card_and_reply`](../../../supabase/migrations/20260729120000_agent_rpcs_persist_execution_patch.sql)
> holds an advisory lock + `agent_message_runs` PK on
> `(trigger_message_id, agent_auth_user_id)` — dual-firing collapses into one
> reply. Organizer's [`organizer_create_reply_and_task`](../../../supabase/migrations/20260723140000_organizer_rpc.sql)
> RPC has **no idempotency layer** (no `p_trigger_message_id` arg, no advisory
> lock, no `agent_message_runs` row), so dual-firing produces two visible
> Organizer replies. Per Phase 4 spec option (b), the legacy webhook is
> disabled in the SAME Dashboard session as the v2 registry deploy. Brief
> "neither webhook firing" risk window during the toggle is bounded by the
> rollback procedure below — Organizer traffic is low and re-enabling the
> legacy webhook is one click.

---

## Pre-flight checklist

Operator must verify each item below **before** Step 1. Tick the box and record
who/when in the rightmost column.

| Item                                                                                                                                                                                                                                                                                                                           | Verified by | Date |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ---- |
| Phase 4 PR merged on `main`.                                                                                                                                                                                                                                                                                                   |             |      |
| Phase 3 soak (Coach) is `cut_over` per [`soak-log-coach.md`](./soak-log-coach.md). `agent_dispatch_webhook_v2` exists and is enabled.                                                                                                                                                                                          |             |      |
| `pnpm test` passes locally on the merge commit, including [`src/lib/agents/organizer/parse.test.ts`](../../../src/lib/agents/organizer/parse.test.ts) and [`src/lib/agents/organizerResponse.test.ts`](../../../src/lib/agents/organizerResponse.test.ts).                                                                     |             |      |
| `pnpm exec tsx scripts/check-agent-coupling.ts` is clean.                                                                                                                                                                                                                                                                      |             |      |
| Production env vars on `agent-dispatch-v2` already include `GCP_PROJECT_ID`, `GCP_LOCATION`, `GCP_SERVICE_ACCOUNT_JSON`, `AGENT_WEBHOOK_SECRET`, `LLM_TIMEOUT_MS` (Phase 1) — no new shared secrets needed.                                                                                                                    |             |      |
| `ORGANIZER_WRITES_ENABLED` is set to the **same value** on both `organizer-agent-dispatch` and `agent-dispatch-v2`. Default state is unset (≡ `0` ≡ writes disabled, matching legacy at [`organizer-agent-dispatch/index.ts`](../../../supabase/functions/organizer-agent-dispatch/index.ts) line 596).                        |             |      |
| `organizer_dispatch_webhook` (legacy) is **enabled** today and pointing at `organizer-agent-dispatch` (Dashboard → Database → Webhooks).                                                                                                                                                                                       |             |      |
| `agent_dispatch_webhook_v2` is **enabled** today and pointing at `agent-dispatch-v2` (set up by Phase 3 cutover).                                                                                                                                                                                                              |             |      |
| Organizer is bound to at least one bubble (Dashboard → SQL Editor: `select count(*) from public.bubble_agent_bindings bab join public.agent_definitions ad on ad.id = bab.agent_id where ad.slug = 'organizer' and bab.enabled and ad.is_active;`). Result must be ≥ 1; otherwise verification matrix Step 3 below cannot run. |             |      |
| Smoke-tested v2 reachability with [`scripts/smoke-agent-dispatch-v2.ts --target organizer`](../../../scripts/smoke-agent-dispatch-v2.ts) against staging (or curl with `x-agent-secret`) — see "Local smoke" below.                                                                                                            |             |      |

### Local smoke (recommended pre-flight, optional)

```bash
SMOKE_ORGANIZER_BUBBLE_ID=<bubble-uuid> \
SMOKE_ORGANIZER_USER_ID=<user-uuid> \
SMOKE_AGENT_SECRET=<AGENT_WEBHOOK_SECRET> \
SMOKE_SUPABASE_ANON_KEY=<anon-key> \
SMOKE_FUNCTION_URL=https://<staging-ref>.supabase.co/functions/v1/agent-dispatch-v2 \
SMOKE_SUPABASE_URL=https://<staging-ref>.supabase.co \
pnpm tsx scripts/smoke-agent-dispatch-v2.ts --target organizer
```

Expected: `[smoke] OK — Organizer reply <id> arrived <n>s after trigger`.

---

## Operator runbook

### Step 1 — Deploy v2 with Organizer in the registry

```bash
supabase functions deploy agent-dispatch-v2 --no-verify-jwt
```

Capture CLI output URL/version somewhere (paste below):

```text
Deploy version: __________________
Deploy timestamp: __________________
```

After deploy:

- Confirm in Dashboard → Edge Functions → `agent-dispatch-v2` that the version
  bumped to the deploy timestamp captured above.
- Move immediately to Step 2. `agent_dispatch_webhook_v2` still fires on every
  `messages` INSERT, so once this registry deploy is live, any `@Organizer`
  turn during the Step 1 → Step 2 window can route to v2 and duplicate the
  legacy reply. The goal is not a zero-hit observation window; the goal is to
  keep the dual-active interval to the manual-toggle minimum.

> Coach traffic is unaffected by this step. The dispatcher's
> `REGISTRY_ITERATION_ORDER` puts Coach first
> ([`supabase/functions/agents/index.ts`](../../../supabase/functions/agents/index.ts)),
> and Organizer's `routing.acceptRootDefault: false` means Organizer cannot
> intercept root-level Coach turns even when both are bound to the same bubble.

### Step 2 — Disable the legacy `organizer_dispatch_webhook` (SAME session)

This is the cutover point. Do this immediately after Step 1 completes — do
**not** leave the deploy running with both webhooks active for more than the
manual-toggle interval.

1. Dashboard → Database → Webhooks → `organizer_dispatch_webhook` → toggle to
   **disabled**.
2. **Do not delete.** The disabled state preserves URL/header/secret config so
   the rollback procedure below is one toggle.
3. Update status banner above to `cut_over` with the timestamp.

> **Why this is the moment.** Until this toggle, both webhooks fire on every
> `messages` INSERT. For Organizer-targeted messages, both pipelines would
> independently call `organizer_create_reply_and_task` (no dedupe lock) and
> the bubble would receive two Organizer replies. The window between Step 1
> and Step 2 should be measured in seconds, not minutes.

### Step 3 — Manual verification matrix

Fire each trigger from a real client session (staging if available, otherwise
production with a short monitoring window). Record outcome in the table.

| #   | Trigger                                                                                              | Expected behavior                                                                                                                                               | Tester | Date | request_id | Result | Notes |
| --- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---- | ---------- | ------ | ----- |
| 1   | `@Organizer please summarize` in a bubble where Organizer **is** bound, `ORGANIZER_WRITES_ENABLED=0` | One Organizer reply via v2; **no** task row created. Strategy log: `phase = "persisted" AND msg = "organizer write intent" AND writes_enabled = false`.         |        |      |            |        |       |
| 2   | `@Organizer create a task to follow up next Tuesday` in a bound bubble, `ORGANIZER_WRITES_ENABLED=0` | One Organizer reply; **no** `tasks` row created. `proposed_write_kind = "create_task"` in the strategy's persisted log line; `created_task_id IS NULL`.         |        |      |            |        |       |
| 3   | Plain reply inside an existing thread Organizer started (no `@Organizer`), bound bubble              | Continuation reply via v2 (`acceptThreadContinuation` path in [`agent-dispatch-v2/resolve.ts`](../../../supabase/functions/agent-dispatch-v2/resolve.ts)).      |        |      |            |        |       |
| 4   | `@Organizer hi` in a bubble where Organizer is **NOT** bound                                         | v2 returns `200 { skipped: "no_strategy_matched" }`. No Organizer reply. (`requireBubbleBinding: true` in the strategy.)                                        |        |      |            |        |       |
| 5   | Plain message in any bubble, no `@Organizer`, no `default_agent_slug = "organizer"`                  | Organizer does **not** reply (`acceptRootDefault: false`). If Coach is bound, Coach handles per its routing.                                                    |        |      |            |        |       |
| 6   | Message in a bubble where the user is the Organizer's own auth_user_id                               | v2 returns `200 { skipped: "author_is_agent" }` — loop guard at [`agent-dispatch-v2/index.ts`](../../../supabase/functions/agent-dispatch-v2/index.ts) line 86. |        |      |            |        |       |
| 7   | Induced failure (see Step 3a)                                                                        | Safe-reply text inserted via fallback path; HTTP 200 to webhook; `phase = "fallback"` log line; reply content equals `ORGANIZER_SAFE_REPLY_TEXT` constant.      |        |      |            |        |       |

### Step 3a — Induced-failure test (Vertex 4xx)

Mirrors Coach's Step 4a from `soak-log-coach.md` — induce the failure via env
only, no source-code changes.

1. **Capture the current `GCP_LOCATION` value** so the revert is exact:

   ```text
   GCP_LOCATION (pre-test): __________________
   ```

2. Dashboard → Edge Functions → `agent-dispatch-v2` → Secrets → set
   `GCP_LOCATION` to a region known to **not** publish `gemini-2.5-flash`.
   Suggested first try: `me-west1`. If that region adds the model later, pick
   any other unsupported region (verify against the Vertex publisher catalogue
   at the GCP Console). Save.
3. Wait ~30s for the function to redeploy with the new env.
4. Send one Organizer message from a staging session (or a designated test
   thread in production): `@Organizer hi`.
5. Verify in Supabase Edge Function logs filtered to `slug = "organizer"`:
   - One `level = warn` line with `error_kind = "http"`.
   - One `phase = "fallback"` line with `fallback_ok = true`.
6. Verify in DB: a `messages` row authored by the Organizer agent with
   `content = "I had trouble compiling that meeting note. Can you say it again?"`
   (this is `ORGANIZER_SAFE_REPLY_TEXT` from
   [`supabase/functions/agents/organizer/config.ts`](../../../supabase/functions/agents/organizer/config.ts)).
7. **Immediately revert** `GCP_LOCATION` to the value captured in step 1. Save.
8. Wait ~30s, send one more Organizer message, verify the next turn returns
   `phase = "done"` (fallback path is no longer triggered).

Edge case: if step 5 shows `error_kind = "auth"` instead of `"http"`, accept
that as equivalent proof — the user-visible outcome is identical (safe-reply
inserted, HTTP 200 to webhook). Document which path was observed in the matrix
table above.

### Step 3b — Writes-enabled smoke (optional, do once per cutover)

This proves `ORGANIZER_WRITES_ENABLED=1` actually creates a `tasks` row, which
the default-off setting prevents the matrix above from exercising.

1. Capture current value:

   ```text
   ORGANIZER_WRITES_ENABLED (pre-test): __________________  (likely unset / "0")
   ```

2. Dashboard → Edge Functions → `agent-dispatch-v2` → Secrets → set
   `ORGANIZER_WRITES_ENABLED=1`. Save. Wait ~30s.
3. From a bound bubble, post: `@Organizer create a task to follow up next Tuesday`.
4. Verify in DB:

   ```sql
   select id, title, due_on, metadata->>'source' as source
   from public.tasks
   where bubble_id = '<your-bubble-uuid>'
     and metadata->>'source' = 'organizer_agent'
   order by created_at desc
   limit 5;
   ```

   Expected: a row with `source = 'organizer_agent'`.

5. Verify in Logs (`slug = "organizer" AND msg = "organizer write intent"`):
   `writes_enabled = true`, `created_task_id` is non-null, equal to the row id
   from step 4.
6. **Immediately revert** `ORGANIZER_WRITES_ENABLED` to the captured pre-test
   value. Save.

### Step 4 — Soak window (4+ hours)

Organizer's soak is shorter than Coach's because there is no parallel-running
second pipeline to compare against — the soak is purely "did v2 + the
disabled-legacy state cause any user-visible regression".

Watch v2's structured logs for Organizer traffic. The dispatcher pipeline
emits `phase` values `received → routed → preflight? → llm_call → llm_done →
parsed → persisted → done`, and `fallback` on the degraded path. Every line
carries `request_id`, `slug = "organizer"`, `message_id`, `bubble_id`. The
strategy adds an extra `msg = "organizer write intent"` line at
`phase = "persisted"` carrying the un-gated `proposed_write` so ops can
compare model intent vs what the gate actually executed.

Concrete log queries — record results into the data tables below. Use
Supabase Logs Explorer (or `supabase functions logs agent-dispatch-v2` CLI)
and filter on the JSON fields.

| Metric                | Filter                                                                                                                  | Pass criterion                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Total Organizer turns | `slug = "organizer" AND phase = "done"`                                                                                 | Use as denominator for the rate metrics below.                                                                                                       |
| Error distribution    | `slug = "organizer" AND error_kind IS NOT NULL` group by `error_kind` (`http` / `parse` / `shape` / `timeout` / `auth`) | `parse` and `shape` are **0**; `http` and `timeout` rare.                                                                                            |
| Fallback rate         | `slug = "organizer" AND phase = "fallback"` count ÷ total turns                                                         | ≤ 1% (or comparable to legacy baseline if known).                                                                                                    |
| Latency p50/p95       | `slug = "organizer" AND phase = "llm_done"` median / p95 of `latency_ms`                                                | Comparable to legacy ~2–6s eyeball baseline (Organizer payloads are smaller than Coach so expect slightly faster numbers).                           |
| Auth failures         | `level = "error" AND error_kind = "auth" AND slug = "organizer"`                                                        | **0**. Any occurrence is a paging condition; rotate `GCP_SERVICE_ACCOUNT_JSON` per [`docs/agents/vertex-setup.md`](../../agents/vertex-setup.md) §4. |
| Write intents         | `slug = "organizer" AND msg = "organizer write intent"`                                                                 | One per Organizer reply. `writes_enabled` matches the deployed env value. `created_task_id` is null when `writes_enabled = false`.                   |
| Loop-guard hits       | `slug = "organizer" AND msg = "loop guard skip (author is agent)"`                                                      | Equal to the count of Organizer's own outgoing replies. (Confirms v2's loop guard short-circuits Organizer-authored INSERTs.)                        |

### Step 5 — (No-op)

Phase 3 needed a separate "disable the legacy webhook" step because the
parallel-running model deferred it. Phase 4's hard cutover already disabled
the legacy webhook in Step 2; this section is intentionally a no-op so the
Coach precedent's step numbering remains useful for cross-referencing.

---

## Soak data

Operator fills these in during/after the soak. Add rows as needed.

### Window

| Item                                          | Value |
| --------------------------------------------- | ----- |
| Cutover (`cut_over`, Step 2 toggle timestamp) |       |
| Soak end (`soak_complete` or `rolled_back`)   |       |
| Total Organizer turns observed                |       |

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

### Write intents (sanity check on the gating flag)

| Day | Total replies | `proposed_write IS NOT NULL` count | `created_task_id IS NOT NULL` count | Notes (must match deployed `ORGANIZER_WRITES_ENABLED` semantics) |
| --- | ------------- | ---------------------------------- | ----------------------------------- | ---------------------------------------------------------------- |
|     |               |                                    |                                     |                                                                  |

### User-visible regressions

| Timestamp | request_id | Description | Fix |
| --------- | ---------- | ----------- | --- |
|           |            |             |     |

### Verification matrix results

(Filled in inline in Step 3's table above. Cross-reference any failures here.)

---

## Decision

**Final outcome:** _to be recorded once._

| Field      | Value                                        |
| ---------- | -------------------------------------------- |
| Decision   | `soak_complete` / `rolled_back` (circle one) |
| Decided by |                                              |
| Date       |                                              |
| Rationale  |                                              |

If `soak_complete`, proceed to Phase 5 (Buddy port). If `rolled_back`, follow
the procedure below and document the root cause in the "User-visible
regressions" table.

---

## Rollback procedure

Two-step, both reversible. Re-enable the legacy webhook **first** to avoid a
brief window where neither webhook is firing on Organizer-targeted `messages`
INSERT events.

1. Dashboard → Database → Webhooks → `organizer_dispatch_webhook` → toggle to
   **enabled**. (Coach's `agent_dispatch_webhook_v2` is unaffected — it stays
   on; the v2 dispatcher will simply stop matching Organizer traffic once we
   complete step 2 and redeploy.)
2. Code revert: open
   [`supabase/functions/agents/index.ts`](../../../supabase/functions/agents/index.ts),
   remove the `OrganizerStrategy` import and its `REGISTRY` /
   `REGISTRY_ITERATION_ORDER` entries (revert to the Coach-only shape from
   Phase 2). Commit, push, redeploy:

   ```bash
   supabase functions deploy agent-dispatch-v2 --no-verify-jwt
   ```

3. Verify in Logs (next ~10 minutes) that no `slug = "organizer"` lines come
   from `agent-dispatch-v2`; Organizer traffic should now show up only in the
   legacy `organizer-agent-dispatch` function logs.
4. Update status banner to `rolled_back`.
5. The pure modules under `src/lib/agents/organizer/` and the byte-for-byte
   mirrors under `supabase/functions/agents/organizer/` may stay on disk —
   they are unreachable when not registered, and removing them would force a
   second PR. Phase 5/6 will re-register the strategy after the root cause is
   fixed.
6. Bound user-visible impact: at most one missed Organizer reply per
   `messages` INSERT during the toggle interval (Supabase webhooks retry on
   non-2xx but not on simple "webhook disabled" — the brief overlap before the
   legacy re-enable propagates is the exposure).

---

## Verification gates (must all pass before status → `soak_complete`)

These are the same gates listed in
[`phase-4-organizer-strategy-port.md`](./phase-4-organizer-strategy-port.md)
"Verification". Tick each row.

| Gate                                                                                                                                           | Met? |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 4+ hours of `agent-dispatch-v2` serving Organizer traffic with the legacy `organizer_dispatch_webhook` disabled.                               |      |
| `error_kind ∈ {parse, shape}` count for Organizer is **0** during the soak window.                                                             |      |
| `phase = fallback` rate is comparable to or lower than legacy's pre-cutover rate (or ≤ 1% if no baseline).                                     |      |
| Manual verification matrix (Step 3) all green.                                                                                                 |      |
| Step 3a induced-failure path observed at least once and reverted cleanly.                                                                      |      |
| Step 3b writes-enabled smoke (if performed) confirmed the gating flag round-trips through the strategy persist log AND the `tasks` row insert. |      |
| Soak data tables filled in.                                                                                                                    |      |
| Decision section completed and signed.                                                                                                         |      |

---

## Hand-off to Phase 5

When status is `soak_complete`, the next phase
([`phase-5-buddy-strategy-port.md`](./phase-5-buddy-strategy-port.md))
expects:

- `agent_dispatch_webhook_v2` is the sole trigger for Coach **and** Organizer.
- `organizer_dispatch_webhook` is **disabled** (not deleted).
- `organizer-agent-dispatch` Edge Function still exists; it just receives no
  webhook traffic. Phase 6 deletes the entire directory.
- Organizer prompt + parse helpers are sourced from
  `src/lib/agents/organizer/...`; the legacy Deno files are re-export shims
  only ([`organizer-agent-dispatch/organizerPrompt.ts`](../../../supabase/functions/organizer-agent-dispatch/organizerPrompt.ts)).
- This soak log is committed and signed off.
