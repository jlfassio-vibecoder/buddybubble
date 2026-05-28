# System Analytics — Workout Generation Observability

**Goal:** Premium-tier (Studio, Studio Pro, Coach Pro) admins get a "System Analytics" page inside the Analytics Bubble that tracks AI workout generation usage, quotas, and — critically — surfaces failed generations (`MAX_TOKENS`, `self_attestation_mismatch`, parse/shape/http errors) with one-click recovery into `/builder/[task_id]` so admins can manually fix broken workouts.

**Status:** Approved — ready for Build Mode (2026-05-28).

---

## Context discovered in the codebase

| Concern                       | Existing pattern to reuse                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First-party telemetry table   | `public.analytics_events` (`workspace_id`, `event_type`, `metadata jsonb`, `created_at`) — created by `supabase/migrations/20260507100000_growth_engine.sql`                    |
| Workspace analytics route     | `src/app/(dashboard)/app/[workspace_id]/settings/analytics/page.tsx` (owner-only redirect gate)                                                                                 |
| Workspace analytics API       | `src/app/api/analytics/workspace/[workspace_id]/route.ts` (owner check + service-role read)                                                                                     |
| Subscription status resolver  | `getWorkspaceSubscriptionStatus` SQL helper + `resolveSubscriptionPermissions` in `src/lib/subscription-permissions.ts`                                                         |
| Premium tier metadata         | `STRIPE_PLAN_META` (`studio`, `studio_pro`, `coach_pro`) in `src/lib/stripe-plans.ts`; product IDs in `src/lib/stripe-plan-ids-live.ts` + `stripe-test-catalog`                 |
| Premium gate UI               | `src/components/subscription/premium-gate.tsx` (already handles upgrade CTA, owner-only messaging)                                                                              |
| Builder URL helper            | `buildWorkoutBuilderUrl(workspaceId, taskId, { from, return })` in `src/lib/workout-builder/build-workout-builder-url.ts`                                                       |
| Vertex usage telemetry source | `handler.ts` already logs `usageMetadata.promptTokenCount` / `candidatesTokenCount` / `thoughtsTokenCount` / `finishReason` after every Vertex call                             |
| Error classification source   | `classifyError` produces `VertexErrorKind` (`http`, `parse`, `shape`, `timeout`, `auth`, `truncated`, `self_attestation_mismatch`); `isFallbackEligible` already branches on it |
| Coach guard throw sites       | `supabase/functions/agents/coach/server-guards.ts` throws `{ kind: 'self_attestation_mismatch' }` (lines 90, 270 in Deno mirror)                                                |

**Key gaps the plan must close:**

1. There is **no current Stripe-plan-key column** on `workspace_subscriptions` — only `stripe_product_id`. We need a SQL helper (or app-side mapper) that turns `stripe_product_id` into a `StripePlanKey` so RLS can check "is this workspace on `studio` / `studio_pro` / `coach_pro`?"
2. Coach dispatch has `bubble_id` + `message.user_id` (actor), but **does not currently know `workspace_id` cheaply** — it must resolve via `bubbles.workspace_id`. We need to attach that to telemetry without an extra round trip on the hot path.
3. There is **no concept of `task_id` for failed generations on Coach rail** today — `extras.knownTargetTaskId` carries it for outline co-pilot. We must persist it as `metadata.task_id` so the Recovery UI CTA has a target.

---

## DB — Schema, RPC, RLS

- [ ] **DB-1. New table `public.workspace_ai_events`.** (Approved — do not extend `analytics_events`.)
  - Rationale:
    - Different RLS audience (premium-tier admins, not just `role = 'owner'`)
    - Different retention/cardinality (one row per AI request; could become hot)
    - Different shape (typed `event_type` enum, `task_id` FK, `prompt_tokens` / `completion_tokens` as first-class columns)
    - Avoids polluting growth funnel queries with high-volume AI events
  - Cross-link: emit a single `analytics_events` row with `event_type = 'ai_workout_generation'` summary so the existing owner dashboard still rolls up counts.

- [ ] **DB-2. Create migration `supabase/migrations/<ts>_workspace_ai_events.sql`.**
  - Columns:
    | Column | Type | Notes |
    |---|---|---|
    | `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | |
    | `workspace_id` | `uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE` | RLS key |
    | `bubble_id` | `uuid REFERENCES public.bubbles(id) ON DELETE SET NULL` | nullable for non-bubble flows |
    | `task_id` | `uuid REFERENCES public.tasks(id) ON DELETE SET NULL` | target of recovery CTA |
    | `actor_user_id` | `uuid REFERENCES auth.users(id) ON DELETE SET NULL` | user who triggered generation |
    | `agent_slug` | `text NOT NULL` | `'coach'`, `'apex'`, etc. |
    | `surface` | `text` | `'standard_task_chat_rail'`, `'workout_builder'`, `'generate_workout_outline'` |
    | `event_type` | `text NOT NULL CHECK (event_type IN (...))` | see DB-3 |
    | `error_kind` | `text` | `VertexErrorKind` when applicable: `truncated`, `self_attestation_mismatch`, `parse`, `shape`, `http`, `timeout`, `auth` |
    | `prompt_tokens` | `int` | `usageMetadata.promptTokenCount` |
    | `completion_tokens` | `int` | `usageMetadata.candidatesTokenCount` |
    | `thoughts_tokens` | `int` | `usageMetadata.thoughtsTokenCount` |
    | `latency_ms` | `int` | |
    | `model` | `text` | strategy.model |
    | `request_id` | `text` | correlates to Edge logs |
    | `metadata` | `jsonb NOT NULL DEFAULT '{}'` | extra fields (drop counts, finish reason, retry source, etc.) |
    | `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
  - Indexes:
    - `(workspace_id, created_at desc)` — primary dashboard query
    - `(workspace_id, event_type, created_at desc)` — error-only views
    - `(task_id)` — "show events for this workout"
    - `(request_id)` — log correlation
  - Retention comment in migration: "Retain 12 months; cleanup job to be added in V2."

- [ ] **DB-3. Define `event_type` enum values (CHECK constraint).**
  - `success` — happy path; tokens recorded
  - `error_truncated` — Vertex `finishReason: MAX_TOKENS`
  - `error_attestation` — Coach `self_attestation_mismatch`
  - `error_parse` — JSON parse failure
  - `error_shape` — schema validation failure
  - `error_http` — Vertex HTTP error
  - `error_timeout` — Vertex timeout
  - `error_auth` — Vertex auth failure
  - `error_other` — fallback for unmapped errors

- [ ] **DB-4. Enable RLS and write policies.**
  - `ENABLE ROW LEVEL SECURITY`.
  - **Read policy (approved: owner + admin, premium tiers only):**
    ```
    USING (
      EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.workspace_id = workspace_ai_events.workspace_id
          AND wm.user_id = auth.uid()
          AND wm.role IN ('owner', 'admin')
      )
      AND public.workspace_has_system_analytics_access(workspace_ai_events.workspace_id)
    )
    ```
  - **No INSERT/UPDATE/DELETE policy** — all writes via service role from Edge function (matches `analytics_events` pattern).
  - Internal admins (`users.is_admin = true`) can read all events (parity with `analytics_events` policy).

- [ ] **DB-5. SQL helper: `workspace_has_system_analytics_access(p_workspace_id uuid) RETURNS boolean`.** (Approved: `stripe_plan_catalog` lookup table.)
  - `SECURITY DEFINER`, `STABLE`, `search_path = public`.
  - Logic:
    1. Read `workspace_subscriptions.stripe_product_id` for the workspace.
    2. Read `workspace_subscriptions.status` — require `'trialing'` or `'active'`.
    3. Join `stripe_plan_catalog` on `stripe_product_id` → `plan_key`.
    4. Return true iff `plan_key IN ('studio', 'studio_pro', 'coach_pro')`.
  - **DB-5a:** create `stripe_plan_catalog` table (`stripe_product_id` PK, `plan_key text NOT NULL`) — seed with live + test product IDs via separate seed migration or deploy runbook (avoid hardcoding env-specific IDs in CHECK constraints).

- [ ] **DB-6. RPC: `record_workspace_ai_event(p_workspace_id uuid, p_event_type text, ...)`.**
  - Not strictly required — Edge can `insert` directly with service role. **Skip** unless we want to centralize CHECK enforcement; document the decision.

- [ ] **DB-7. Tests.**
  - Manual SQL verification: an admin in a `studio_pro` workspace can `SELECT`; an admin in a `host` workspace cannot.
  - Verify FK `ON DELETE` behavior (deleting a task nulls `task_id`, keeps the row visible).

---

## Edge — Telemetry instrumentation

- [ ] **EDGE-1. Choose insertion site.**
  - **Recommendation:** instrument inside `supabase/functions/agent-dispatch/handler.ts` at two existing logging points so success/error coverage stays in lockstep with structured logs:
    - **Success** — right after the existing `log('info', 'llm done', ...)` (line 357) once strategy `persist` has returned ok (so we record actually-applied generations, not dropped ones).
    - **Error** — inside the existing `catch` branch (lines ~420–434) before `isFallbackEligible(kind)` returns.
  - **Why handler.ts, not strategy.ts:** every strategy benefits without changes (Apex outline phase B, Buddy, Organizer all funnel through the same dispatcher). Strategy-specific drops (e.g., `outline_draft_patch_drops`) can be added via `ctx.extras` payload picked up by the writer.

- [ ] **EDGE-2. New module: `supabase/functions/_shared/telemetry/workspace-ai-events.ts`.**
  - Exports `recordWorkspaceAiEvent(supabase, args)` with:
    - `args.workspaceId` (required — pre-resolved from `bubbles.workspace_id` during `buildDispatchContext`)
    - `args.bubbleId`, `args.taskId` (nullable)
    - `args.actorUserId` (the trigger message author)
    - `args.agentSlug`, `args.surface`
    - `args.eventType` (`'success' | 'error_truncated' | ...`)
    - `args.errorKind?` (`VertexErrorKind` or null)
    - `args.tokens` (`{ prompt, completion, thoughts }` — all nullable)
    - `args.latencyMs`, `args.model`, `args.requestId`
    - `args.metadata` (drop counts, finish reason, retry source, etc.)
  - Best-effort: wrap insert in `try/catch`, swallow + structured-log a `warn 'workspace_ai_events insert failed'` so telemetry never blocks dispatch.
  - Mirror canonically (Vitest side under `src/lib/agents/_shared/telemetry/` is not required because nothing imports it client-side; keep Deno-only).

- [ ] **EDGE-3. Resolve `workspace_id` once in `build-context.ts`.**
  - Add `workspaceId` to `DispatchContext` (or to a `dispatchExtras` field) by joining `bubbles.workspace_id` for the message's bubble — already loaded for the resolver in `coach/context.ts:499`. Reuse rather than re-fetching.
  - Update `DispatchContext` type in `supabase/functions/_shared/dispatch/types.ts` (Deno canonical) + mirror.

- [ ] **EDGE-4. Resolve `task_id` for telemetry.**
  - Success path: prefer `ctx.extras.coach.knownTargetTaskId` when present; fall back to `message.target_task_id` from the webhook payload.
  - Error path: same; if neither is set, leave `task_id NULL` and rely on `request_id` for recovery linkage.

- [ ] **EDGE-5. Map `VertexErrorKind` → `event_type`.**
  - Tiny pure function in the new telemetry module (`vertexErrorKindToEventType`). Default unmapped kinds to `error_other`.

- [ ] **EDGE-6. Cross-write to `analytics_events` for funnel rollups.**
  - One additional `analytics_events` row per request with `event_type = 'ai_workout_generation'` and `metadata = { outcome: 'success' | 'error', error_kind, agent_slug, surface }` so the existing owner Analytics page can show a top-line "AI generations this week" tile without re-querying the new table.
  - Skip if rollup volume becomes a concern; not a blocker.

- [ ] **EDGE-7. Unit tests.**
  - `workspace-ai-events.test.ts` — Deno test: `recordWorkspaceAiEvent` calls `supabase.from('workspace_ai_events').insert(...)` with the right shape, swallows errors.
  - `index.integration.test.ts` — extend existing harness: a `MAX_TOKENS` Vertex response inserts a row with `event_type = 'error_truncated'`; a happy outline insert yields `event_type = 'success'`.

- [ ] **EDGE-8. Mirror parity.**
  - `pnpm check:agent-mirror` for any Coach-side touches (not needed if all changes stay in `_shared/`).

- [ ] **EDGE-9. Deploy.**
  - `supabase functions deploy agent-dispatch` after applying the migration.
  - **Do not touch `AGENT_WEBHOOK_SECRET`** (workspace rule).

---

## Route + RBAC

- [ ] **ROUTE-1. New page: `src/app/(dashboard)/app/[workspace_id]/analytics/system/page.tsx`.**
  - Server Component (mirrors existing `settings/analytics/page.tsx` shape).
  - Auth checks (in order):
    1. `auth.getUser()` → redirect to `/login` if anon.
    2. `workspace_members.role` lookup → require `role IN ('owner', 'admin')`; redirect to `/app/${workspace_id}` otherwise.
    3. Subscription/tier check (see ROUTE-2) — render upgrade empty state in-place rather than redirecting (better UX, owner can hit upgrade CTA).
  - Reads `workspace_ai_events` via the service-role client (matches `settings/analytics/page.tsx`) **or** via the standard authed client — preferred: standard authed client so RLS does the gate redundantly. Fall back to service role only if dashboard aggregations need cross-event joins.

- [ ] **ROUTE-2. Server-side tier resolver: `src/lib/subscription-permissions-server.ts` (new) or extend existing module.**
  - Helper `getWorkspaceTier(workspaceId, supabase)` returning `{ planKey: StripePlanKey | null, status: SubscriptionStatus, hasSystemAnalytics: boolean }`.
  - `hasSystemAnalytics = isPremiumActive && planKey IN ('studio','studio_pro','coach_pro')`.
  - Uses the same `stripe_plan_catalog` lookup as DB-5 for plan-key resolution to keep client/server in sync.

- [ ] **ROUTE-3. Tier upgrade empty state.**
  - When `hasSystemAnalytics` is false: render a focused upgrade card (do NOT reuse `PremiumGate` as a wrapper because we are blocking a whole route, not gating a button).
  - Owner: "Upgrade to Studio Pro / Coach Pro" CTA → opens `useSubscriptionStore.openTrialModal()` or links to `/app/${workspace_id}/settings/subscription`.
  - Non-owner admin: "Ask the socialspace owner to upgrade to Studio Pro to enable System Analytics."
  - Track `feature_gate_hit` with `feature_name: 'system_analytics'` for funnel parity with `PremiumGate`.

- [ ] **ROUTE-4. Sidebar / Analytics Bubble entry point.**
  - Add a "System" tab inside the Analytics Bubble navigation (or a "System Analytics" link in `settings/analytics`).
  - Only show the entry link when `hasSystemAnalytics` is true to avoid a dead-link experience for non-premium workspaces.

- [ ] **ROUTE-5. API route (optional, only if client filtering/pagination grows): `src/app/api/analytics/system/[workspace_id]/route.ts`.**
  - Mirrors `src/app/api/analytics/workspace/[workspace_id]/route.ts` — auth + role check + service-role read.
  - **Skip in V1**: do server-render directly on the page, paginate via `searchParams`.

---

## UI — `SystemAnalyticsDashboard.tsx`

- [ ] **UI-1. Component placement: `src/features/analytics/system/SystemAnalyticsDashboard.tsx`.**
  - Client component (`'use client'`) so we can add filters, sorts, and the "Review Workout" CTA navigation.
  - Server page passes initial rows + counts as props; client owns interactivity.

- [ ] **UI-2. Top summary strip (last 30d / 7d / 24h toggle).**
  - Cards: **Successful generations**, **Errors**, **Total tokens**, **Avg latency**.
  - Data from a single aggregate query in the page (`group by event_type`, plus `sum(prompt_tokens + completion_tokens)`).

- [ ] **UI-3. Error feed table (the recovery UI — primary feature).**
  - Columns: When · Actor · Surface · Error kind · Task · Tokens · Action.
  - Filter chips: `error_truncated`, `error_attestation`, `error_parse`, `error_shape`, `error_http`, `error_timeout`, `error_auth`, `error_other`, `all errors`.
  - Sort: newest first.
  - Pagination: cursor on `(created_at, id)`, page size 50.

- [ ] **UI-4. Recovery CTA per row.**
  - "Review Workout" button **only when** `task_id` is non-null.
  - `onClick`: `router.push(buildWorkoutBuilderUrl(workspace_id, task_id, { from: 'system_analytics', return: pathname }))` — approved recovery signal (no separate event required for V1).
  - When `task_id` is null: show "Open request log" with `request_id` copied to clipboard (admin can grep Edge logs).
  - Emit `analytics_events` row with `event_type = 'system_analytics_recovery_clicked'` so we can measure how often the recovery path is used.

- [ ] **UI-5. Token usage panel (V1.5 if scope tight).**
  - Stacked bar chart by day (success vs. error tokens) using existing chart primitives or a simple HTML/Tailwind sparkbar — no new dep.

- [ ] **UI-6. Admin notes affordance (V2 — not in V1).**
  - Eventual: "Resolved by [admin]" toggle on error rows. Out of scope for first ship; capture as backlog.

- [ ] **UI-7. Empty states.**
  - "No errors in this window — everything's been generating cleanly." (success path)
  - "No AI generations in this window." (cold workspace)

- [ ] **UI-8. Tests.**
  - `SystemAnalyticsDashboard.test.tsx` (Vitest + Testing Library): renders error rows; clicking "Review Workout" calls the right URL; filter chips narrow rows; null `task_id` rows show the fallback CTA.
  - `getWorkspaceTier` unit test (matrix of `planKey` × `status` → `hasSystemAnalytics`).

---

## Cross-cutting

- [ ] **X-1. Feature flag.** Add `NEXT_PUBLIC_SYSTEM_ANALYTICS_ROUTE` (default off in prod for soak). Wrap the route entry + sidebar link.
- [ ] **X-2. Pre-commit gate.** Run `pnpm run check` (existing) plus Deno integration tests for the new error-path coverage.
- [ ] **X-3. Docs.** This plan lives at `docs/analytics/plans/system-analytics-plan.md`. After ship, write `docs/analytics/system-analytics.md` runbook (telemetry shape, RLS, recovery flow) — parallel to `docs/agents/outline-hallucination-fix.md`.
- [ ] **X-4. Observability.** All telemetry inserts emit a `log('debug', 'workspace_ai_events recorded', ...)` line for soak-log correlation. Sample at 100% for the first 7 days post-deploy.
- [ ] **X-5. Privacy review checkpoint.** `metadata` jsonb must not contain raw user prompt content — store only structured fields (drop counts, finish reason, error class). Add a code-review checklist note alongside the new module.

---

## Suggested ship order

1. **DB-1 → DB-5a** (migration + RLS + plan-key catalog) — unblocks both Edge and Route.
2. **EDGE-2 → EDGE-5 → EDGE-7** (writer + integration tests) — get data flowing before UI exists.
3. **ROUTE-2** (tier resolver) — small, isolated; required by both ROUTE-1 and UI-1.
4. **ROUTE-1 + UI-1..UI-4** (read-only dashboard with recovery CTA) — V1 ship target.
5. **UI-5, UI-7, X-3** — polish + runbook.
6. **EDGE-6, UI-6** — V1.5 / backlog.

---

## Approved decisions (locked)

| #   | Decision            | Resolution                                                                 |
| --- | ------------------- | -------------------------------------------------------------------------- |
| 1   | Table strategy      | **New `workspace_ai_events`** — do not extend `analytics_events`           |
| 2   | Plan-key catalog    | **`stripe_plan_catalog` lookup table**                                     |
| 3   | Tier set            | **`studio`, `studio_pro`, `coach_pro` only** (trialing or active)          |
| 4   | Admin role          | **`owner` and `admin`** — gym owners can delegate recovery to head coaches |
| 5   | Recovery navigation | **`from: 'system_analytics'`** query param on `buildWorkoutBuilderUrl`     |

**Build Mode entry point:** start with **DB-1 → DB-5a** (migration + RLS + catalog), then Edge telemetry, then route/tier resolver, then dashboard UI.
