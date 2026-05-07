# Phase 6 — Delete legacy functions + secrets and rename `agent-dispatch-v2` → `agent-dispatch`

> Single PR. Pre-MVP rule: do this in one sitting after all three agents have soaked
> on v2 for at least 48 hours each. After this phase, the only Edge Function for
> agent dispatch is `agent-dispatch`.

## Inputs

- Phases 2–5 complete. Coach, Organizer, Buddy all on `agent-dispatch-v2`.
- All three legacy Database Webhooks disabled in the Dashboard for at least 48
  hours.
- Soak logs committed for each agent.

## Deliverables

Files to **delete**:

1. `supabase/functions/bubble-agent-dispatch/index.ts`
2. `supabase/functions/buddy-agent-dispatch/index.ts`
3. `supabase/functions/buddy-agent-dispatch/buddyPrompt.ts` (only after Phase 5's
   re-export shim is removed; see step "Untangle prompt re-exports" below)
4. `supabase/functions/organizer-agent-dispatch/index.ts`
5. `supabase/functions/organizer-agent-dispatch/organizerPrompt.ts` (same caveat)

Files to **modify**:

1. `supabase/config.toml` — remove the three legacy `[functions.*-agent-dispatch]`
   blocks at `:389`–`:401`. Rename
   `[functions.agent-dispatch-v2]` → `[functions.agent-dispatch]`.
2. Rename folder `supabase/functions/agent-dispatch-v2` → `supabase/functions/agent-dispatch`.
   Update any import paths in `agent-dispatch/index.ts` that referenced the v2 name.
3. `src/lib/agents/buddy/prompts.ts` — promote to canonical (Phase 5 had it
   re-export from the Deno copy; flip the direction so the Deno copy is gone).
4. `src/lib/agents/organizer/prompts.ts` — same flip.
5. `src/lib/agents/organizerPromptFixture.ts` — make it a thin re-export of
   `src/lib/agents/organizer/prompts.ts`.
6. `src/lib/agents/organizerResponse.ts` — make it a thin re-export of
   `src/lib/agents/organizer/parse.ts`.
7. `scripts/check-agent-coupling.ts` — strip the legacy mirror checks and add a
   single check that the Deno function entry only imports from `_shared/` and
   `agents/`.
8. `docs/bubble-agent-webhook.md` — replace with the new single-webhook flow:
   one webhook, one secret, one URL. Cross-link from
   `docs/agents/coach/README.md`, `docs/agents/coach/ARCHITECTURE_ASSESSMENT.md`,
   and `docs/refactor/phase4-env-vars.md`.

Supabase Dashboard changes (must coordinate with the deploy):

1. **Delete** the three legacy Database Webhooks
   (`bubble_agent_webhook`, `buddy_dispatch_webhook`, `organizer_dispatch_webhook`).
2. **Rename** the parallel webhook `agent_dispatch_webhook_v2` →
   `agent_dispatch_webhook` and **change its URL** to the new
   `/functions/v1/agent-dispatch` path.
3. **Delete** the following Edge secrets (now unreferenced):
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL`
   - `VERTEX_GEMINI_MODEL`
   - `BUDDY_GEMINI_MODEL`
   - `ORGANIZER_GEMINI_MODEL`
   - `BUBBLE_AGENT_WEBHOOK_SECRET`
   - `BUDDY_AGENT_WEBHOOK_SECRET`
   - `ORGANIZER_AGENT_WEBHOOK_SECRET`
   - `GEMINI_FETCH_TIMEOUT_MS`
   - `BUDDY_GEMINI_FETCH_TIMEOUT_MS`
   - `ORGANIZER_GEMINI_FETCH_TIMEOUT_MS`
   - `BUDDY_AGENT_DEBUG`, `ORGANIZER_AGENT_DEBUG` (replaced by `LLM_DEBUG`)

Update `secrets-matrix.md` to reflect deletions; this is the artifact the next
operator will reference if anything seems "missing."

## Step-by-step (recommended order)

### 1. Untangle prompt re-exports

Phase 4 and Phase 5 each created a re-export shim from the legacy Deno path to the
new `src/lib/agents/<slug>/prompts.ts`. Now flip the direction:

- Move the canonical source into `src/lib/agents/<slug>/prompts.ts` (it should
  already be there from Phases 4–5 fold work).
- Delete the Deno copies under `supabase/functions/<slug>-agent-dispatch/`.
- Confirm `supabase/functions/agents/<slug>.ts` imports the prompt directly from
  `src/lib/agents/<slug>/prompts.ts`.

### 2. Delete the legacy function folders

```sh
rm -rf supabase/functions/bubble-agent-dispatch \
       supabase/functions/buddy-agent-dispatch \
       supabase/functions/organizer-agent-dispatch
```

### 3. Rename `agent-dispatch-v2` → `agent-dispatch`

```sh
git mv supabase/functions/agent-dispatch-v2 supabase/functions/agent-dispatch
```

Update the entry file's relative imports if any reference the v2 path explicitly.
The `_shared/` paths do not change.

### 4. Update `supabase/config.toml`

Remove:

```toml
[functions.bubble-agent-dispatch]
verify_jwt = false

[functions.buddy-agent-dispatch]
verify_jwt = false

[functions.organizer-agent-dispatch]
verify_jwt = false
```

Rename `[functions.agent-dispatch-v2]` to `[functions.agent-dispatch]`.

### 5. Deploy + Dashboard cutover (atomic)

This must be coordinated so there is no window where the new webhook URL points at
a non-existent function. Recommended sequence:

1. `supabase functions deploy agent-dispatch --no-verify-jwt` (function exists at
   the new URL alongside the still-deployed `agent-dispatch-v2`).
2. Update `agent_dispatch_webhook_v2` URL in Dashboard to
   `/functions/v1/agent-dispatch`.
3. Verify the next ten replies in logs come from the new function.
4. `supabase functions delete agent-dispatch-v2`
   `supabase functions delete bubble-agent-dispatch`
   `supabase functions delete buddy-agent-dispatch`
   `supabase functions delete organizer-agent-dispatch`
5. Rename the webhook `agent_dispatch_webhook_v2` → `agent_dispatch_webhook` in
   Dashboard.
6. Delete legacy secrets via Dashboard or `supabase secrets unset`.

### 6. Update docs

- `docs/bubble-agent-webhook.md` — rewrite for the single function. Sections:
  Deploy, Webhook configuration (single webhook), Secrets (the new five), Behavior
  (link to README plus per-strategy notes), Migration history (link to this folder).
- `docs/agents/coach/README.md` — update §"Dispatch: webhook → Edge Function" to
  point at `agent-dispatch`. Strike-through the legacy paragraph naming
  `bubble-agent-dispatch`. Add a note that the structured-JSON contract is now
  served by Vertex publisher API, not Generative Language API.
- `docs/agents/coach/ARCHITECTURE_ASSESSMENT.md` — add a "RESOLVED in Phase 6"
  note for any items that referenced legacy file paths.
- `docs/refactor/phase4-env-vars.md` — add a header note that Phase 4's per-agent
  env vars are deprecated; point readers at this consolidation folder.

## Verification

- `supabase functions list` returns `agent-dispatch` and no legacy entries.
- `supabase secrets list` returns only the five new secrets plus the Supabase
  defaults.
- The Database Webhooks page shows exactly one webhook on `public.messages` (the
  renamed `agent_dispatch_webhook`).
- Smoke script (extended in Phases 2/4/5) passes for all three agents against the
  renamed function.
- Live: send one Coach + one Buddy + one Organizer message and confirm replies
  arrive via Realtime within `LLM_TIMEOUT_MS`.

## Risk + rollback

This is the only **destructive** phase in the plan. Rollback requires:

1. `git revert <this-PR-sha>` — restores all three legacy function folders.
2. Re-create the three legacy webhooks in Dashboard with their original URLs and
   header secrets (you will need the values from the deleted Supabase secrets).
3. Re-add the deleted Supabase secrets.

To minimize the rollback window, **before merging this PR**, export the current
secret values to a local encrypted file (e.g. `op secret save` if you use
1Password CLI). Document the location in the PR description so a future operator
can find them.

## Hand-off to next phase

Phase 7 expects:

- Single `agent-dispatch` function live with all three agents.
- Single webhook, single secret.
- Legacy code and secrets fully removed.
- Docs updated to match.
