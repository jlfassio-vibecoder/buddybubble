# Buddy cutover soak log (Phase 5)

Operational artifact for moving Buddy traffic from `buddy-agent-dispatch` to
`agent-dispatch-v2`. This file is **both** the runbook the operator follows and
the audit trail of what was observed during the soak. Update the status banner
and data tables in-place as the cutover progresses.

> Phase spec: [`phase-5-buddy-strategy-port.md`](./phase-5-buddy-strategy-port.md).
> Secrets context: [`secrets-matrix.md`](./secrets-matrix.md) ("Phase 5 cutover state").
> Vertex ops guide: [`docs/agents/vertex-setup.md`](../../agents/vertex-setup.md).
> Coach precedent (parallel-soak model): [`soak-log-coach.md`](./soak-log-coach.md).
> Organizer precedent (hard-cutover model — same as Buddy): [`soak-log-organizer.md`](./soak-log-organizer.md).

---

## Status

**Current status:** `pre_cutover`

| State           | Meaning                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pre_cutover`   | Plan committed; pre-flight not yet completed.                                                                                   |
| `cut_over`      | `agent-dispatch-v2` registry deploy complete AND `buddy_dispatch_webhook` disabled in the same Dashboard session. Soak ongoing. |
| `soak_complete` | Soak window completed cleanly; Phase 6 unblocked.                                                                               |
| `rolled_back`   | Cutover aborted; legacy `buddy_dispatch_webhook` re-enabled and Buddy removed from v2 registry. See "Decision" section for why. |

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
> reply. Buddy's [`buddy_create_onboarding_reply`](../../../supabase/migrations/20260701140000_buddy_rpc.sql)
> RPC has **no idempotency layer** — no `p_trigger_message_id` arg, no
> advisory lock, no `agent_message_runs` row — so dual-firing produces two
> visible Buddy replies. Buddy is also workspace-global (no
> `bubble_agent_bindings` rows; see
> [`supabase/migrations/20260701150000_buddy_agent_rls_workspace_global.sql`](../../../supabase/migrations/20260701150000_buddy_agent_rls_workspace_global.sql)),
> so a parallel soak would touch every workspace's onboarding flow at once.
> Per Phase 5 spec, the legacy webhook is disabled in the SAME Dashboard
> session as the v2 registry deploy. Brief "neither webhook firing" risk
> window during the toggle is bounded by the rollback procedure below —
> re-enabling the legacy webhook is one click.

---

## Pre-flight checklist

Operator must verify each item below **before** Step 1. Tick the box and record
who/when in the rightmost column.

| Item                                                                                                                                                                                                                                                                                 | Verified by | Date |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ---- |
| Phase 5 PR merged on `main`.                                                                                                                                                                                                                                                         |             |      |
| Phase 4 soak (Organizer) is `soak_complete` per [`soak-log-organizer.md`](./soak-log-organizer.md). `agent_dispatch_webhook_v2` carries Coach + Organizer traffic; `organizer_dispatch_webhook` is disabled.                                                                         |             |      |
| `pnpm test` passes locally on the merge commit, including [`src/lib/agents/buddy/parse.test.ts`](../../../src/lib/agents/buddy/parse.test.ts).                                                                                                                                       |             |      |
| `pnpm exec tsx scripts/check-agent-coupling.ts` is clean.                                                                                                                                                                                                                            |             |      |
| Production env vars on `agent-dispatch-v2` already include `GCP_PROJECT_ID`, `GCP_LOCATION`, `GCP_SERVICE_ACCOUNT_JSON`, `AGENT_WEBHOOK_SECRET`, `LLM_TIMEOUT_MS` (Phase 1) — no new shared secrets needed.                                                                          |             |      |
| Buddy's `agent_definitions` row has `is_active = true` and the expected `auth_user_id` (Dashboard → SQL Editor: `select slug, auth_user_id, is_active, mention_handle from public.agent_definitions where slug = 'buddy';`). Result must show one active row.                        |             |      |
| Confirm Buddy has **no** `bubble_agent_bindings` rows by design (Dashboard → SQL Editor: `select count(*) from public.bubble_agent_bindings bab join public.agent_definitions ad on ad.id = bab.agent_id where ad.slug = 'buddy';`). Result should be 0 — Buddy is workspace-global. |             |      |
| `buddy_dispatch_webhook` (legacy) is **enabled** today and pointing at `buddy-agent-dispatch` (Dashboard → Database → Webhooks).                                                                                                                                                     |             |      |
| `agent_dispatch_webhook_v2` is **enabled** today and pointing at `agent-dispatch-v2` (set up by Phase 3 cutover).                                                                                                                                                                    |             |      |
| Smoke-tested v2 reachability with [`scripts/smoke-agent-dispatch-v2.ts --target buddy`](../../../scripts/smoke-agent-dispatch-v2.ts) against staging (or curl with `x-agent-secret`) — see "Local smoke" below.                                                                      |             |      |

### Local smoke (recommended pre-flight, optional)

```bash
SMOKE_BUDDY_BUBBLE_ID=<bubble-uuid> \
SMOKE_BUDDY_USER_ID=<user-uuid> \
SMOKE_AGENT_SECRET=<AGENT_WEBHOOK_SECRET> \
SMOKE_SUPABASE_ANON_KEY=<anon-key> \
SMOKE_FUNCTION_URL=https://<staging-ref>.supabase.co/functions/v1/agent-dispatch-v2 \
SMOKE_SUPABASE_URL=https://<staging-ref>.supabase.co \
pnpm tsx scripts/smoke-agent-dispatch-v2.ts --target buddy --scenario mention
```

Repeat with `--scenario sentinel` (forces `[SYSTEM_EVENT: ONBOARDING_STARTED]`)
and `--scenario continuation` (plain user message; the previous bubble message
must be Buddy-authored for the test to pass — see the script header).

Expected: `[smoke] OK — Buddy[<scenario>] reply <id> arrived <n>s after trigger`.

---

## Operator runbook

### Step 1 — Deploy v2 with Buddy in the registry

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
  `messages` INSERT, so once this registry deploy is live, any Buddy-targeted
  turn during the Step 1 → Step 2 window can route to v2 and duplicate the
  legacy reply. Buddy is the highest-velocity agent of the three (it fires on
  every onboarding event), so the duplicate-reply risk is the most user-
  visible of any cutover so far. The goal is not a zero-hit observation
  window; the goal is to keep the dual-active interval to the manual-toggle
  minimum.

> Coach + Organizer traffic is unaffected by this step. The dispatcher's
> `REGISTRY_ITERATION_ORDER` puts Buddy AFTER both
> ([`supabase/functions/agents/index.ts`](../../../supabase/functions/agents/index.ts)),
> Buddy's `routing.acceptRootDefault: false` means it cannot intercept
> root-level Coach turns, and `routing.excludeOnMentionOf: ['coach']` means
> Buddy stays silent when the user mentions Coach explicitly.

### Step 2 — Disable the legacy `buddy_dispatch_webhook` (SAME session)

This is the cutover point. Do this immediately after Step 1 completes — do
**not** leave the deploy running with both webhooks active for more than the
manual-toggle interval.

1. Dashboard → Database → Webhooks → `buddy_dispatch_webhook` → toggle to
   **disabled**.
2. **Do not delete.** The disabled state preserves URL/header/secret config so
   the rollback procedure below is one toggle.
3. Update status banner above to `cut_over` with the timestamp.

> **Why this is the moment.** Until this toggle, both webhooks fire on every
> `messages` INSERT. For Buddy-targeted messages, both pipelines would
> independently call `buddy_create_onboarding_reply` (no dedupe lock) and the
> bubble would receive two Buddy replies. The window between Step 1 and Step 2
> should be measured in seconds, not minutes.

### Step 3 — Manual verification matrix

Fire each trigger from a real client session (staging if available, otherwise
production with a short monitoring window). Record outcome in the table.

| #   | Trigger                                                                                                | Expected behavior                                                                                                                                                              | Tester | Date | request_id | Result | Notes |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ---- | ---------- | ------ | ----- |
| 1   | `@Buddy hi` in any bubble                                                                              | One Buddy reply via v2. Strategy log: `phase = "persisted" AND msg = "buddy persisted" AND has_card ∈ {true, false}`. Reply lands threaded under the trigger.                  |        |      |            |        |       |
| 2   | Insert `[SYSTEM_EVENT: ONBOARDING_STARTED]` from a fresh client (sentinel implicit trigger)            | One Buddy welcome reply via v2; sentinel string is **NEVER** echoed in `replyContent`. Reply commonly carries `has_card = true` (`action_type = "onboarding_checklist"` etc.). |        |      |            |        |       |
| 3   | User reply in an existing Buddy thread without `@Buddy` (thread continuation, `parent_id != null`)     | One Buddy reply via v2 (`acceptThreadContinuation` thread path in [`agent-dispatch-v2/resolve.ts`](../../../supabase/functions/agent-dispatch-v2/resolve.ts)).                 |        |      |            |        |       |
| 4   | Plain user root message; the immediately preceding bubble message was Buddy-authored (bubble lookback) | One Buddy reply via v2 (`continuationLookback === 'bubble'` fall-through in the resolver, mirroring legacy `buddy-agent-dispatch/index.ts:170-186`).                           |        |      |            |        |       |
| 5   | `@Coach hi` in a bubble where Buddy is also present (bound or workspace-global)                        | Coach replies (per its own routing); Buddy stays **silent** (`excludeOnMentionOf: ['coach']`). Verify only one v2 dispatch line, `slug = "coach"`.                             |        |      |            |        |       |
| 6   | `@Buddy` in a thread an agent already owns (e.g. continuing a Coach thread)                            | Buddy still answers — explicit mention beats continuation routing. Coach does NOT also reply on the same trigger.                                                              |        |      |            |        |       |
| 7   | `@Buddy` in a bubble with NO `bubble_agent_bindings.buddy` row (workspace-global proof)                | Buddy still answers (`requireBubbleBinding: false`). This must work in any workspace bubble, even one the operator just created with no agent bindings.                        |        |      |            |        |       |
| 8   | Message in any bubble where the user is Buddy's own `auth_user_id`                                     | v2 returns `200 { skipped: "author_is_agent" }` — loop guard at [`agent-dispatch-v2/index.ts`](../../../supabase/functions/agent-dispatch-v2/index.ts) line 86.                |        |      |            |        |       |
| 9   | Induced failure (see Step 3a)                                                                          | Safe-reply text inserted via Buddy's own RPC fallback path; HTTP 200 to webhook; `phase = "fallback"` log line; reply content equals `BUDDY_SAFE_REPLY_TEXT` constant.         |        |      |            |        |       |

### Step 3a — Induced-failure test (Vertex 4xx)

Mirrors Coach's Step 4a from `soak-log-coach.md` and Organizer's Step 3a from
`soak-log-organizer.md` — induce the failure via env only, no source-code
changes.

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
4. Send one Buddy message from a staging session (or a designated test thread
   in production): `@Buddy hi`.
5. Verify in Supabase Edge Function logs filtered to `slug = "buddy"`:
   - One `level = warn` line with `error_kind = "http"`.
   - One `phase = "fallback"` line with `fallback_ok = true`. Because Buddy
     defines `safeReplyInsert`, this fallback insert MUST land via
     `buddy_create_onboarding_reply` — verify there is **no**
     `agent_create_card_and_reply` call for this `request_id`.
6. Verify in DB: a `messages` row authored by the Buddy agent with
   `content = "I had trouble loading that just now. Mind trying once more?"`
   (this is `BUDDY_SAFE_REPLY_TEXT` from
   [`supabase/functions/agents/buddy/config.ts`](../../../supabase/functions/agents/buddy/config.ts)).
7. **Immediately revert** `GCP_LOCATION` to the value captured in step 1. Save.
8. Wait ~30s, send one more Buddy message, verify the next turn returns
   `phase = "done"` (fallback path is no longer triggered).

Edge case: if step 5 shows `error_kind = "auth"` instead of `"http"`, accept
that as equivalent proof — the user-visible outcome is identical (safe-reply
inserted, HTTP 200 to webhook). Document which path was observed in the matrix
table above.

### Step 3b — Resolver regression spot-check (Coach + Organizer)

Phase 5 rewrites `agent-dispatch-v2/resolve.ts` to a two-query split. Every
Coach + Organizer turn now flows through the new path. Spot-check 5 known
Coach + 5 known Organizer turns from the soak window's first hour to confirm
the refactor is regression-free.

1. From the soak's first hour of logs, pick 5 `slug = "coach" AND phase = "done"`
   request_ids and 5 `slug = "organizer" AND phase = "done"` request_ids.
2. For each, verify the corresponding `messages` row in the DB:
   - The reply landed (no missing-reply gap).
   - The reply content is non-empty and not equal to that agent's safe-reply
     constant (i.e. the happy path executed, not the fallback).
3. If any gap is observed, treat as a resolver regression — pause the soak
   and start the rollback procedure.

### Step 4 — Soak window (24 hours, heightened first-hour watch)

Buddy's soak is 24 hours total — longer than Organizer's 4h window because
Buddy is the highest-velocity agent and onboarding traffic spikes with new
sign-ups. The first hour after cutover gets a **heightened watch**: refresh
the log queries below every 10–15 min and pause the soak the moment any
red flag appears.

Watch v2's structured logs for Buddy traffic. The dispatcher pipeline emits
`phase` values `received → routed → preflight? → llm_call → llm_done →
parsed → persisted → done`, and `fallback` on the degraded path. Every line
carries `request_id`, `slug = "buddy"`, `message_id`, `bubble_id`. The
strategy adds an extra `msg = "buddy persisted"` line at `phase = "persisted"`
carrying `has_card`, `action_type`, `created_task_id`, and `reply_message_id`
— PII-safe metadata only; the raw `replyContent` and card title/description
are never logged.

Concrete log queries — record results into the data tables below. Use
Supabase Logs Explorer (or `supabase functions logs agent-dispatch-v2` CLI)
and filter on the JSON fields.

| Metric             | Filter                                                                                                              | Pass criterion                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Total Buddy turns  | `slug = "buddy" AND phase = "done"`                                                                                 | Use as denominator for the rate metrics below.                                                                                                        |
| Error distribution | `slug = "buddy" AND error_kind IS NOT NULL` group by `error_kind` (`http` / `parse` / `shape` / `timeout` / `auth`) | `parse` and `shape` are **0**; `http` and `timeout` rare.                                                                                             |
| Fallback rate      | `slug = "buddy" AND phase = "fallback"` count ÷ total turns                                                         | ≤ 1% (or comparable to legacy baseline if known). First-hour spike threshold: ≥ 5% triggers the rollback evaluation.                                  |
| Latency p50/p95    | `slug = "buddy" AND phase = "llm_done"` median / p95 of `latency_ms`                                                | Comparable to legacy ~2–6s eyeball baseline. Buddy payloads are smaller than Coach so expect numbers nearer Organizer's range.                        |
| Auth failures      | `level = "error" AND error_kind = "auth" AND slug = "buddy"`                                                        | **0**. Any occurrence is a paging condition; rotate `GCP_SERVICE_ACCOUNT_JSON` per [`docs/agents/vertex-setup.md`](../../agents/vertex-setup.md) §4.  |
| Sentinel echoes    | `slug = "buddy" AND phase = "persisted"` — pull the `reply_message_id` and inspect the row's `content`              | **No** Buddy reply contains the literal string `[SYSTEM_EVENT: ONBOARDING_STARTED]`. Sample 10 onboarding replies as a spot check.                    |
| Card emission      | `slug = "buddy" AND msg = "buddy persisted"` group by `has_card`                                                    | Healthy mix: onboarding-sentinel turns lean heavily `has_card = true`; mention turns lean `false`. No bias all the way to one extreme.                |
| Loop-guard hits    | `slug = "buddy" AND msg = "loop guard skip (author is agent)"`                                                      | Equal to the count of Buddy's own outgoing replies. Confirms v2's loop guard short-circuits Buddy-authored INSERTs.                                   |
| Coach exclusion    | `slug = "buddy" AND msg = "no_strategy_matched"` for trigger rows whose `content` matches `@Coach`                  | Each `@Coach` mention in a bubble where Buddy is also present must NOT produce a `slug = "buddy"` happy-path line. Cross-checks `excludeOnMentionOf`. |

### Step 5 — (No-op)

Phase 3 needed a separate "disable the legacy webhook" step because the
parallel-running model deferred it. Phase 5's hard cutover already disabled
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
| Total Buddy turns observed                    |       |

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

### Card emission (sanity check on prompt × parser pairing)

| Day | Total replies | `has_card = true` count | `has_card = false` count | Notes (onboarding-sentinel-heavy days should skew toward `true`) |
| --- | ------------- | ----------------------- | ------------------------ | ---------------------------------------------------------------- |
|     |               |                         |                          |                                                                  |

### Resolver regression spot-check (Step 3b)

| Slug      | request_id | Reply landed? | Used safe-reply? | Notes |
| --------- | ---------- | ------------- | ---------------- | ----- |
| coach     |            |               |                  |       |
| coach     |            |               |                  |       |
| coach     |            |               |                  |       |
| coach     |            |               |                  |       |
| coach     |            |               |                  |       |
| organizer |            |               |                  |       |
| organizer |            |               |                  |       |
| organizer |            |               |                  |       |
| organizer |            |               |                  |       |
| organizer |            |               |                  |       |

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

If `soak_complete`, proceed to Phase 6 (cutover deletion + rename). If
`rolled_back`, follow the procedure below and document the root cause in the
"User-visible regressions" table.

---

## Rollback procedure

Two-step, both reversible. Re-enable the legacy webhook **first** to avoid a
brief window where neither webhook is firing on Buddy-targeted `messages`
INSERT events.

1. Dashboard → Database → Webhooks → `buddy_dispatch_webhook` → toggle to
   **enabled**. (Coach's `agent_dispatch_webhook_v2` is unaffected — it stays
   on; the v2 dispatcher will simply stop matching Buddy traffic once we
   complete step 2 and redeploy.)
2. Code revert: open
   [`supabase/functions/agents/index.ts`](../../../supabase/functions/agents/index.ts),
   remove the `BuddyStrategy` import and its `REGISTRY` /
   `REGISTRY_ITERATION_ORDER` entries (revert to the Coach + Organizer shape
   from Phase 4). Commit, push, redeploy:

   ```bash
   supabase functions deploy agent-dispatch-v2 --no-verify-jwt
   ```

3. Verify in Logs (next ~10 minutes) that no `slug = "buddy"` lines come from
   `agent-dispatch-v2`; Buddy traffic should now show up only in the legacy
   `buddy-agent-dispatch` function logs.
4. Update status banner to `rolled_back`.
5. The pure modules under `src/lib/agents/buddy/` and the byte-for-byte mirrors
   under `supabase/functions/agents/buddy/` (plus the strategy at
   `supabase/functions/agents/buddy/strategy.ts`) may stay on disk — they are
   unreachable when not registered, and removing them would force a second PR.
   Phase 6 will re-register the strategy after the root cause is fixed.
6. The shared resolver refactor at
   [`supabase/functions/agent-dispatch-v2/resolve.ts`](../../../supabase/functions/agent-dispatch-v2/resolve.ts)
   stays in place — Coach and Organizer keep using it. If the resolver itself
   is the regression cause (Step 3b spot-check failed), revert the entire
   Phase 5 commit on `agent-dispatch-v2/resolve.ts` and redeploy; this
   restores the Phase 4 single-query path for Coach + Organizer at the cost
   of leaving Buddy unreachable in v2.
7. Bound user-visible impact: at most one missed Buddy reply per `messages`
   INSERT during the toggle interval (Supabase webhooks retry on non-2xx but
   not on simple "webhook disabled" — the brief overlap before the legacy
   re-enable propagates is the exposure).

---

## Verification gates (must all pass before status → `soak_complete`)

These are the same gates listed in
[`phase-5-buddy-strategy-port.md`](./phase-5-buddy-strategy-port.md)
"Verification". Tick each row.

| Gate                                                                                                                                                                             | Met? |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 24 hours of `agent-dispatch-v2` serving Buddy traffic with the legacy `buddy_dispatch_webhook` disabled.                                                                         |      |
| First-hour heightened watch completed: log queries refreshed every 10–15 min for the first hour with no fallback-rate spike (≥ 5% triggers rollback eval).                       |      |
| `error_kind ∈ {parse, shape}` count for Buddy is **0** during the soak window.                                                                                                   |      |
| `phase = fallback` rate is comparable to or lower than legacy's pre-cutover rate (or ≤ 1% if no baseline).                                                                       |      |
| Manual verification matrix (Step 3) all green, including the Coach-mention exclusion (#5) and the workspace-global / no-binding case (#7).                                       |      |
| Step 3a induced-failure path observed at least once and reverted cleanly. The fallback insert MUST have used `buddy_create_onboarding_reply`, not `agent_create_card_and_reply`. |      |
| Step 3b resolver regression spot-check (5 Coach + 5 Organizer turns) all green.                                                                                                  |      |
| Sentinel-echo spot check (10 onboarding replies) all clean — no Buddy reply contains the literal `[SYSTEM_EVENT: ONBOARDING_STARTED]` string.                                    |      |
| Soak data tables filled in.                                                                                                                                                      |      |
| Decision section completed and signed.                                                                                                                                           |      |

---

## Hand-off to Phase 6

When status is `soak_complete`, the next phase
([`phase-6-cutover-deletion-and-rename.md`](./phase-6-cutover-deletion-and-rename.md))
expects:

- `agent_dispatch_webhook_v2` is the sole trigger for Coach **and** Organizer
  **and** Buddy.
- `bubble_agent_webhook` (legacy Coach) is **disabled** (the Phase 3 dual-soak
  gate decision should have flipped it off when Coach hit `soak_complete`; if
  it is still enabled because the Phase 3 hand-off deferred that, Phase 6
  picks it up).
- `organizer_dispatch_webhook` is **disabled** (not deleted) since Phase 4.
- `buddy_dispatch_webhook` is **disabled** (not deleted) since this phase.
- `buddy-agent-dispatch` Edge Function still exists; it just receives no
  webhook traffic. Phase 6 deletes the entire directory.
- Buddy prompt + parse helpers are sourced from `src/lib/agents/buddy/...`;
  the legacy Deno files are re-export shims only
  ([`buddy-agent-dispatch/buddyPrompt.ts`](../../../supabase/functions/buddy-agent-dispatch/buddyPrompt.ts)).
- This soak log is committed and signed off.
- All three soak logs (`soak-log-coach.md`, `soak-log-organizer.md`,
  `soak-log-buddy.md`) are committed.
- No legacy function has received traffic for at least 48 hours.
