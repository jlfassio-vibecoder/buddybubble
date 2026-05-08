# Phase 6 — Delete legacy functions + secrets and rename `agent-dispatch-v2` → `agent-dispatch`

> Single cutover. The only **destructive** phase in the consolidation. May land
> across focused PRs (e.g. doc + folder rename first, legacy-folder deletion +
> secret cleanup second); each PR must state which steps from this runbook it
> actually performs. After the cutover the only Edge Function for agent dispatch
> is `agent-dispatch`, with one webhook and one secret bundle.

## 1. Why this phase exists

After Phases 2–5, all three agents (Coach, Organizer, Buddy) run on
`agent-dispatch-v2`. The three legacy Edge Functions still exist on disk
(`bubble-agent-dispatch`, `buddy-agent-dispatch`, `organizer-agent-dispatch`)
with their Database Webhooks **disabled but not deleted**. Phase 6 is the
cutover that removes that surface entirely and renames `agent-dispatch-v2` →
`agent-dispatch`. The cutover is allowed to land across focused PRs — until
every step in §4–§7 has merged, treat the legacy folders, webhooks, and secrets
as still present in `main`.

## 2. Inputs

- Phases 2–5 merged. Confirm with `git log --oneline | grep -E 'Phase [2-5]'`.
- **Soak verification gate (HARD)**: run a Supabase Logs query for the last 48
  hours filtered to
  `function_name in ('bubble-agent-dispatch','buddy-agent-dispatch','organizer-agent-dispatch')`.
  Result MUST return 0 rows. Capture the query string + a JSON or screenshot dump
  and reference it in the PR description AND in each soak log per §8.
- Branch: `agent/phase-6-cutover-deletion-and-rename`, cut from updated `main`.
- Encrypted local backup of every Phase-6-deleted secret (see §13). The PR
  description must point at the backup location.

## 3. Architectural correction — do not "flip" the prompt re-exports

A prior draft of this phase said to "move the canonical prompt source into
`src/lib/agents/<slug>/prompts.ts` and delete the Deno copies." **That is
wrong** for the Deno deploy: Supabase bundles only files under
`supabase/functions/`, so a Deno strategy cannot import from `src/` at deploy
time. The actual layout after Phases 4–5 is:

- [`src/lib/agents/<slug>/prompts.ts`](../../../src/lib/agents) — canonical for
  Vitest + Node consumers (already in place).
- [`supabase/functions/agents/<slug>/prompts.ts`](../../../supabase/functions/agents) —
  byte-for-byte Deno mirror; **this** is the deployed source for the Deno
  strategy. **STAYS.**
- [`supabase/functions/buddy-agent-dispatch/buddyPrompt.ts`](../../../supabase/functions/buddy-agent-dispatch/buddyPrompt.ts)
  and
  [`supabase/functions/organizer-agent-dispatch/organizerPrompt.ts`](../../../supabase/functions/organizer-agent-dispatch/organizerPrompt.ts) —
  Phase 4/5 left these as one-line shims re-exporting from the Deno mirror.

Phase 6 simply deletes the legacy folders (which removes the shims). No
canonical/mirror flip is required or possible. Do not delete any file under
`supabase/functions/agents/` — those are the live strategies and prompt mirrors.

## 4. Files to delete

Three legacy function folders:

```sh
rm -rf supabase/functions/bubble-agent-dispatch \
       supabase/functions/buddy-agent-dispatch \
       supabase/functions/organizer-agent-dispatch
```

Concretely (verified file inventory):

- [`supabase/functions/bubble-agent-dispatch/`](../../../supabase/functions/bubble-agent-dispatch) — 1 file (`index.ts`, full legacy implementation).
- [`supabase/functions/buddy-agent-dispatch/`](../../../supabase/functions/buddy-agent-dispatch) — 2 files (`index.ts` full impl, `buddyPrompt.ts` shim).
- [`supabase/functions/organizer-agent-dispatch/`](../../../supabase/functions/organizer-agent-dispatch) — 2 files (`index.ts` full impl, `organizerPrompt.ts` shim).

No other `src/` or `docs/` files are deleted in Phase 6 (everything else is
rewritten in place per §6, §7, §11).

## 5. Folder + config rename

```sh
git mv supabase/functions/agent-dispatch-v2 supabase/functions/agent-dispatch
```

After the `git mv`, sweep relative imports inside the new
`supabase/functions/agent-dispatch/` folder to confirm none reference
`../agent-dispatch-v2/` (none do today, but verify after the move).

Then in [`supabase/config.toml`](../../../supabase/config.toml):

- Delete the three legacy `[functions.*-agent-dispatch]` blocks at lines 389–401
  (and the comment lines above each that reference legacy webhook secrets).
- Rename `[functions.agent-dispatch-v2]` (line 405) → `[functions.agent-dispatch]`.
  Strip the now-stale "Phase 1 reservation" comment above it.

## 6. Source files that reference `agent-dispatch-v2` and need a rename pass

The audit pinpointed every TS / config hit. The implementer must update each:

| File                                                                                                          | Lines            | Nature                                                                  |
| ------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------- |
| [`supabase/functions/agents/index.ts`](../../../supabase/functions/agents/index.ts)                           | 4, 11            | JSDoc                                                                   |
| [`supabase/functions/agents/buddy/strategy.ts`](../../../supabase/functions/agents/buddy/strategy.ts)         | 8                | Header comment                                                          |
| [`supabase/functions/agents/coach/context.ts`](../../../supabase/functions/agents/coach/context.ts)           | 359              | Log path comment                                                        |
| [`supabase/functions/agents/organizer/strategy.ts`](../../../supabase/functions/agents/organizer/strategy.ts) | 25               | Header comment                                                          |
| [`scripts/check-agent-coupling.ts`](../../../scripts/check-agent-coupling.ts)                                 | 84, 93           | `SLUG_LITERAL_ALLOWLIST` glob `supabase/functions/agent-dispatch-v2/**` |
| [`scripts/smoke-agent-dispatch-v2.ts`](../../../scripts/smoke-agent-dispatch-v2.ts)                           | 184              | Default URL `'http://localhost:54321/functions/v1/agent-dispatch-v2'`   |
| [`scripts/smoke-agent-dispatch-v2.ts`](../../../scripts/smoke-agent-dispatch-v2.ts)                           | 3, 12, 16, 32–36 | Comment / serve example / `SMOKE_FUNCTION_URL` example                  |
| [`supabase/config.toml`](../../../supabase/config.toml)                                                       | 405              | Block name (already covered in §5)                                      |

While editing [`scripts/check-agent-coupling.ts`](../../../scripts/check-agent-coupling.ts),
also strip the three legacy folder allowlist entries (`bubble-agent-dispatch/**`,
`buddy-agent-dispatch/**`, `organizer-agent-dispatch/**`) — those paths no
longer exist after §4.

**Smoke script file rename** (`smoke-agent-dispatch-v2.ts` →
`smoke-agent-dispatch.ts`) is **deferred to Phase 7** per its current spec.
Phase 6 only touches the URL + comments inside the file; the filename keeps the
`-v2` suffix until Phase 7's broader doc/test rework.

## 7. Cross-component comment sweep

These `src/` files mention legacy folder names in comments (none are import
paths — verified). Replace `bubble-agent-dispatch` / `buddy-agent-dispatch` /
`organizer-agent-dispatch` with `agent-dispatch`, or strike the line if it is
purely historical context that the consolidation README already covers.

- [`src/components/chat/WorkoutCoachRail.tsx`](../../../src/components/chat/WorkoutCoachRail.tsx) lines 30, 39.
- [`src/components/chat/ChatArea.tsx`](../../../src/components/chat/ChatArea.tsx) lines 65, 487.
- [`src/components/modals/task-modal/TaskModalCommentsPanel.tsx`](../../../src/components/modals/task-modal/TaskModalCommentsPanel.tsx) lines 42, 443.
- [`scripts/provision-agents.ts`](../../../scripts/provision-agents.ts) line 49.

After the sweep, run `rg -n 'bubble-agent-dispatch|buddy-agent-dispatch|organizer-agent-dispatch' src/ scripts/`
and confirm only legitimate historical references in `docs/refactor/` remain.

## 8. Fill in the soak logs in this same PR

All three soak logs are still in template state (`pre_cutover` / `pre_soak`):

- [`docs/refactor/vertex-agent-dispatch-consolidation/soak-log-coach.md`](./soak-log-coach.md)
- [`docs/refactor/vertex-agent-dispatch-consolidation/soak-log-organizer.md`](./soak-log-organizer.md)
- [`docs/refactor/vertex-agent-dispatch-consolidation/soak-log-buddy.md`](./soak-log-buddy.md)

For each log, in the same Phase 6 PR:

1. Update the `**Current status:**` banner from `pre_cutover` (or `pre_soak`) →
   `cut_over`.
2. Fill in the cutover timestamp using the corresponding Phase PR merge date
   (Phase 3 for Coach, Phase 4 for Organizer, Phase 5 for Buddy).
3. Reference the §2 48-hour Supabase Logs query (legacy traffic count = 0) in
   the Decision row as evidence the legacy webhook can be deleted.
4. Set the Decision row to `kept` for the v2 strategy and add a one-line note:
   "Phase 6 PR #<n> deletes the legacy `<slug>_*_webhook` and the
   `<slug>-agent-dispatch` function."

If any of the three soak logs cannot be filled (e.g. the 48h gate did not pass
for one agent), **abort Phase 6 for that agent** and document the deferral in
the PR description. The PR must not delete a legacy function while its soak log
is unsigned.

## 9. Dashboard cutover sequence (atomic, single sitting)

This must be coordinated so there is no window where the renamed webhook URL
points at a non-existent function:

1. `supabase functions deploy agent-dispatch --no-verify-jwt` — new function
   exists at the new URL alongside the still-deployed `agent-dispatch-v2`.
2. In Dashboard, edit `agent_dispatch_webhook_v2`: change the URL to
   `/functions/v1/agent-dispatch`. **Do NOT rename the webhook yet.**
3. Tail logs in `agent-dispatch`; confirm the next 10 message INSERTs route
   there. Confirm `agent-dispatch-v2` log stream is silent.
4. `supabase functions delete agent-dispatch-v2`, then
   `supabase functions delete bubble-agent-dispatch buddy-agent-dispatch organizer-agent-dispatch`.
5. Delete the three legacy Database Webhooks
   (`bubble_agent_webhook`, `buddy_dispatch_webhook`,
   `organizer_dispatch_webhook`).
6. Rename `agent_dispatch_webhook_v2` → `agent_dispatch_webhook`.
7. Delete the legacy Edge secrets per §10.

## 10. Secrets to delete

Verified against [`secrets-matrix.md`](./secrets-matrix.md). The matrix already
marks these `deleted` in the Phase 6 column:

- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `VERTEX_GEMINI_MODEL`
- `BUDDY_GEMINI_MODEL`
- `ORGANIZER_GEMINI_MODEL`
- `BUBBLE_AGENT_WEBHOOK_SECRET`
- `BUDDY_AGENT_WEBHOOK_SECRET`
- `ORGANIZER_AGENT_WEBHOOK_SECRET`
- `*_GEMINI_FETCH_TIMEOUT_MS` — the matrix's wildcard row covers
  `GEMINI_FETCH_TIMEOUT_MS`, `BUDDY_GEMINI_FETCH_TIMEOUT_MS`, and
  `ORGANIZER_GEMINI_FETCH_TIMEOUT_MS`.

Two debug envs are also legacy reads but are NOT in the secrets table (matrix
asymmetry — call this out in the doc):

- `BUDDY_AGENT_DEBUG` — read in
  [`supabase/functions/buddy-agent-dispatch/index.ts:520`](../../../supabase/functions/buddy-agent-dispatch/index.ts).
- `ORGANIZER_AGENT_DEBUG` — read in the legacy organizer dispatcher.

Replaced by the consolidated `LLM_DEBUG` flag.

**Survives Phase 6** (Phase 1 shared bundle, consumed by `agent-dispatch`):

- `GCP_PROJECT_ID`
- `GCP_LOCATION`
- `GCP_SERVICE_ACCOUNT_JSON`
- `AGENT_WEBHOOK_SECRET`
- `LLM_TIMEOUT_MS`

After the Dashboard deletes complete, update
[`secrets-matrix.md`](./secrets-matrix.md):

- Bump the "Last updated" date.
- Flip each Phase 6 column entry from `deleted` (scheduled) to
  `deleted (executed YYYY-MM-DD)` so the next operator can see it actually
  happened.
- Update the "Live consumers today" column for the surviving five rows to read
  `agent-dispatch` (drop `agent-dispatch-v2`).

## 11. Doc rewrites (concrete touch list)

- [`docs/bubble-agent-webhook.md`](../../bubble-agent-webhook.md) — **full
  rewrite**. The current file is 100% legacy webhook content. Replace with a
  short page covering: deploy command for `agent-dispatch`, the single webhook
  config, the five surviving secrets, behavior summary linking to per-strategy
  README sections, and a one-paragraph migration history pointing at this
  consolidation folder.
- [`docs/agents/coach/README.md`](../../agents/coach/README.md) — surgical edits
  at lines 10, 37–40, 45–46, 106–112, 120–121, 148, 174 (every spot that
  hardcodes `bubble-agent-dispatch` or compares Coach against Buddy/Organizer
  dispatchers). Add a final "Observability" placeholder linking forward to the
  Phase 7 doc.
- [`docs/agents/coach/ARCHITECTURE_ASSESSMENT.md`](../../agents/coach/ARCHITECTURE_ASSESSMENT.md)
  — add a new "Phase 6 RESOLVED" section listing items now closed (legacy
  function cleanup, single-secret bundle, single-webhook contract). Update
  legacy-path mentions at lines 5, 150, 362.
- [`docs/refactor/phase4-env-vars.md`](../phase4-env-vars.md) — header banner
  only: "DEPRECATED in Phase 6. Per-agent env vars consolidated; see
  [`secrets-matrix.md`](./vertex-agent-dispatch-consolidation/secrets-matrix.md)."
- [`docs/refactor/vertex-agent-dispatch-consolidation/secrets-matrix.md`](./secrets-matrix.md)
  — flip Phase 6 column to executed state per §10; bump date.

## 12. Verification

Local + Dashboard checks (run BEFORE merging):

- `supabase functions list` returns one `agent-dispatch` entry; no legacy
  entries.
- `supabase secrets list` returns the five Phase 1 vars plus Supabase platform
  defaults — no `*_AGENT_WEBHOOK_SECRET`, no `*GEMINI*`, no `*_DEBUG`.
- Database Webhooks page on `public.messages` shows exactly one row:
  `agent_dispatch_webhook` pointing at `/functions/v1/agent-dispatch`.
- `pnpm exec tsx scripts/check-agent-coupling.ts` passes after the §6 allowlist
  update.
- `deno check --node-modules-dir=auto supabase/functions/agent-dispatch/index.ts`
  passes (verifies the post-rename relative imports).
- Smoke script
  `pnpm exec tsx scripts/smoke-agent-dispatch-v2.ts --target coach|organizer|buddy`
  passes against staging using the new default URL.
- The full [`docs/pre-commit-checklist.md`](../../pre-commit-checklist.md)
  passes — acknowledge the pre-existing `/404` Next.js prerender + Astro
  `@ts-expect-error` warnings carried over from prior phases; confirm no NEW
  failures appear.

Live smoke (after merge):

- Post one Coach trigger (`@Coach hi` in a fitness bubble), one Organizer
  trigger (`@Organizer hi`), and one Buddy trigger (`@Buddy hi`); confirm each
  reply arrives via Realtime within `LLM_TIMEOUT_MS`.

## 13. Risk + rollback

This is the only **destructive** PR in the consolidation. Treat the rollback
window as the critical risk surface.

**Before merging:**

- Export every Phase-6-deleted secret value to a local encrypted file (e.g.
  `op secret save` if you use 1Password CLI; `gpg --symmetric`; etc.).
- Document the encrypted backup location AND the recovery procedure in the PR
  description so a future operator can find them under pressure.

**Rollback procedure (if `agent-dispatch` misbehaves post-cutover):**

1. `git revert <Phase-6-PR-sha>` and push — restores all three legacy function
   folders + the `agent-dispatch-v2` folder name + `config.toml` blocks.
2. `supabase functions deploy bubble-agent-dispatch buddy-agent-dispatch organizer-agent-dispatch agent-dispatch-v2 --no-verify-jwt`.
3. Restore the seven legacy Edge secrets from the encrypted backup
   (`supabase secrets set <NAME>=<VALUE>` per the §10 list).
4. Re-create the three legacy Database Webhooks in Dashboard with their original
   URLs and `Authorization` / `x-*-agent-secret` header values.
5. Re-enable the Coach legacy webhook (`bubble_agent_webhook`) ONLY if the
   `agent-dispatch` Coach path is the failure mode; same per-agent triage for
   Buddy / Organizer.

## 14. Cutover sequence diagram

```mermaid
sequenceDiagram
  participant Dev as Operator
  participant Repo as Phase 6 PR
  participant Supa as Supabase Dashboard
  participant Fn as Edge Functions
  Dev->>Repo: rewrite Phase 6 doc + delete legacy folders + git mv v2 -> agent-dispatch
  Dev->>Repo: fill 3 soak logs to status=cut_over with 48h Supabase Logs evidence
  Dev->>Fn: deploy agent-dispatch (alongside agent-dispatch-v2)
  Dev->>Supa: edit webhook URL to /functions/v1/agent-dispatch
  Note over Supa,Fn: confirm next 10 INSERTs route to agent-dispatch
  Dev->>Fn: delete agent-dispatch-v2 + 3 legacy functions
  Dev->>Supa: delete 3 legacy webhooks; rename v2 webhook -> agent_dispatch_webhook
  Dev->>Supa: delete legacy secrets per matrix
  Dev->>Repo: merge PR
```

## Hand-off to Phase 7

Phase 7 inherits:

- A single `agent-dispatch` Edge Function with all three strategies registered.
- A single `agent_dispatch_webhook` Database Webhook on `public.messages`.
- A single `AGENT_WEBHOOK_SECRET` plus the four GCP/LLM Phase 1 envs — no
  per-agent secrets remain.
- Three signed soak logs (`cut_over`) recording the v2-stable + legacy-deleted
  decision.
- The smoke script still named `scripts/smoke-agent-dispatch-v2.ts` — Phase 7
  owns the file rename to `scripts/smoke-agent-dispatch.ts`, the
  schema-vs-prompt drift lint, the Deno integration test, and the observability
  doc.
