# SQL-level tests (manual / CI follow-up)

This folder holds **documentation and optional manual verification** for Postgres behavior that is expensive to cover in Vitest.

## Deno integration tests (agent dispatch)

The root script `pnpm run test:deno-integration` runs `deno test` with **`--config supabase/deno.json`** (sets `nodeModulesDir: "none"`), **`--lock supabase/deno.lock`**, and **`--node-modules-dir=none`** on `supabase/functions/agent-dispatch/*.integration.test.ts`. Those tests use only **JSR** (`jsr:`) and relative **`.ts`** imports—no direct `npm:` specifiers in the test graph—so Deno must **not** materialize or merge a `node_modules` tree with the CRM’s **pnpm** install. Keeping the config + lock under `supabase/` avoids Deno ingesting the root `package.json` workspace into the lockfile. Do not switch back to `auto` or a root-level `deno.lock` without auditing every import in the test closure.

## `user_exercise_notes` + personal cues RPCs

Migrations:

- `20260813120000_user_exercise_notes_and_personal_cues_rpc.sql` — table, RLS, `apply_personal_cues_for_user`, agent RPC wiring (`p_personal_cues`).
- `20260813120200_grant_exercise_dictionary_lookup_authenticated.sql` — `grant execute on function public.exercise_dictionary_lookup_by_names(text[]) to authenticated`.

### RLS (authenticated)

As a logged-in user in the SQL editor (or `psql` with a user JWT):

1. `select * from public.user_exercise_notes` — should return **only** rows where `user_id = auth.uid()`.
2. `insert into public.user_exercise_notes (...)` — should **fail** (no insert policy for `authenticated`).

### `apply_personal_cues_for_user` (service role)

Run as **`service_role`** (or superuser): call with a test `p_user_id`, agent id, and a small `p_cues` jsonb array; verify append vs replace and the 8000-char cap per field in `user_exercise_notes`.

### Agent RPC binding / dedup

Mirror the integration pattern used for `agent_insert_coach_workout_draft_reply`: same bubble/thread/agent binding checks and `agent_message_runs` dedup should apply to the personal-cues path embedded in `agent_create_card_and_reply` / `agent_insert_coach_workout_draft_reply` (see migration).

Automated **pgTAP** is not wired in this repo yet; if we add it, colocate specs here as `*.sql` and invoke via `supabase db test` or `pg_prove`.
