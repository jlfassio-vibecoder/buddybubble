# TDD: Storefront lead onboarding & reverse trial (V1)

**Status:** Target architecture — most steps below are **not implemented** yet.  
**Related:** [`technical-design-dual-lead-capture-workflows-v1.md`](technical-design-dual-lead-capture-workflows-v1.md) (platform vs **workspace** lead taxonomy; `leads.converted_at` semantics).

**Naming:** Product copy uses **socialspace** where appropriate; database tables and routes today use **`workspaces`**, **`workspace_id`**, **`workspace_members`** — keep identifiers aligned with code until a schema rename ships.

---

## 1. Executive summary

BuddyBubble needs a **product-led growth (PLG)** path for **gym / studio** operators (e.g. Studio Pro / Coach Pro tiers): capture **workspace** (tenant) leads from the **public Astro storefront** before forcing full sign-up, deliver a high-value “aha” (e.g. AI workout generation), then transition the visitor into the CRM with **strict isolation** so new client work does not clutter the tenant’s shared Kanban. At scale (especially **paid acquisition**), the top-of-funnel must stay **stateless** until **verified email** so Postgres is not filled with bots, partial forms, or tire-kickers (§10).

**Objectives (target):**

1. **Frictionless identity** — Anonymous storefront visitor → authenticated **member** of the correct socialspace with minimal steps (e.g. email to save generated content).
2. **Strict isolation** — Generated client workouts must not appear on globally visible boards; prefer **`guest`** role + **`bubbles.is_private`** + **`bubble_members`** + **`tasks.assigned_to`** (see RBAC docs).
3. **Time-bound access** — Optional **3-day reverse trial** for the end client, enforced in **RLS** and UI, distinct from the **platform** subscription trial documented in Stripe flows.

---

## 2. Baseline vs target (codebase today)

| Area                      | Today                                                                                                                                                                   | Target (this TDD)                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Storefront CTA            | [`apps/storefront/src/pages/[slug].astro`](../apps/storefront/src/pages/[slug].astro) — **Join community** → `/login?next=/app/{workspace_id}`                          | **Stateless** profile + preview in Astro; first DB write at email submit via **`POST /api/leads/storefront-trial`** (see §10)      |
| Workspace lead rows       | `POST /api/leads/track` from **invite** landing ([`src/app/invite/[token]/lead-visit-tracker.tsx`](../src/app/invite/[token]/lead-visit-tracker.tsx)); validates invite | **`POST /api/leads/storefront-trial`** — zero-trust, rate-limited separately from invite **`/api/leads/track`**                    |
| `lead_captured` analytics | Server-only via [`trackWorkspaceLeadCaptured`](../src/lib/lead-capture-analytics.ts) after first `leads` insert from `/api/leads/track`                                 | Same helper after **`leads`** insert from **`storefront-trial`**; extend `LeadSource` / metadata as needed                         |
| Private / 1:1 bubbles     | `bubbles.is_private` + `bubble_members`; no `bubble_type` column                                                                                                        | **Required** **`bubble_type`** column (`standard` \| `trial` \| `dm`) — UI filters Inbox / Active trials vs paying clients (§10.4) |
| Member trial columns      | No `trial_expires_at` / `onboarding_status` on `workspace_members`                                                                                                      | Additive migration if product adopts per-member preview window                                                                     |

---

## 3. Target user flow

High-level sequence (deferred auth + async provisioning):

1. **Storefront (Astro only)** — Visitor completes the **14-question** (or shorter) profile; answers stay in **browser memory** or a **lightweight client cookie** until the email step — **no** CRM session and **no** DB rows for partial progress (§10.2).
2. **Preview** — UI shows a **preview** of generated content (or loading state); optional **Cloudflare Turnstile** / **edge rate limits** on submit.
3. **Email gate** — “Enter email to save & view full plan” (or magic link) — **first** moment Postgres + Next.js intake run.
4. **Intake API** — **`POST /api/leads/storefront-trial`** (proposed): **server-only** orchestration:
   - Create or link **auth user** (passwordless / magic link — product choice).
   - Insert **`workspace_members`** with role **`guest`** (and optional **`trial_expires_at`**).
   - Insert **`public.leads`** row (or extend schema) for **workspace** funnel; emit **`trackWorkspaceLeadCaptured`** (not legacy client `lead_captured`).
   - Create **private** bubble; insert **`bubble_members`**; persist **fitness profile** if applicable.
   - Enqueue **async AI job** (Edge Function, Inngest, or queue — product choice); **do not** block HTTP on full Vertex chain.
5. **Redirect** — User lands in CRM, e.g. `/app/[workspace_id]/...` scoped to the **private** bubble.
6. **Realtime** — Client listens for **`tasks`** inserts in that bubble; swap skeleton for card when row appears.

```text
[Astro storefront]                    [Next.js CRM]
       │                                    │
       ├─ Profile + preview (anon)          │
       ├─ Email to save                     │
       └──────────────────────────────────► POST /api/leads/storefront-trial
                                                ├─ auth + workspace_members (guest)
                                                ├─ leads + trackWorkspaceLeadCaptured
                                                ├─ private bubble + bubble_members
                                                └─ enqueue AI worker
       ◄────────────────────────────────── redirect + deep link
```

---

## 4. Data model (proposed)

All of the following are **proposals** unless a linked migration already exists.

### 4.1 `workspace_members`

| Column              | Type                         | Purpose                                                |
| ------------------- | ---------------------------- | ------------------------------------------------------ |
| `trial_expires_at`  | `timestamptz` null           | End of **member preview** window (socialspace-scoped). |
| `onboarding_status` | `text` default `'completed'` | e.g. `trial_active`, `trial_expired` for soft-lock UX. |

### 4.2 `bubbles`

| Column        | Type                                                        | Purpose                                                                                                                                                                                                                                                                                                                                      |
| ------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bubble_type` | `text` not null default `'standard'` (+ CHECK in migration) | **Required** discriminator: at minimum **`standard`** (default channels), **`trial`** (soft-trial / storefront funnel bubbles), **`dm`** (paying or established 1:1 coach–client). Drives sidebar filtering, **Member Manager** “Active trials” / Inbox, and batch archive of expired **`trial`** bubbles — do **not** rely on title naming. |

**Implementation note:** Additive migration + app constants; keep existing `is_private` for access control; `bubble_type` is for **product/navigation** hygiene at scale.

### 4.3 `tasks`

- Set **`assigned_to`** to the new member’s `user_id` for AI-generated rows.
- Align with existing RLS and [`docs/technical-design-program-scoped-workouts-v1.md`](technical-design-program-scoped-workouts-v1.md) if programs are involved.

---

## 5. Security & isolation

### 5.1 RLS (authoritative)

- **Guests** must only **select/update** tasks they are allowed to see per existing helpers (`can_view_bubble`, `can_write_bubble`, `assigned_to` paths) — see [`docs/rbac-matrix-v1.md`](rbac-matrix-v1.md) and Supabase migrations under `supabase/migrations/`.
- Any tightening (e.g. **`guest` SELECT only where `assigned_to = auth.uid()`**) must be validated against **admin/owner** bypass rules already in policies.

### 5.2 Query layer (defense in depth)

- Task-fetching server actions (e.g. workspace task loaders) should apply **`.eq('assigned_to', userId)`** (or equivalent) when the caller is **not** owner/admin, so the UI never depends on silent empty results alone.

---

## 6. AI latency

- **Do not** run the full multi-step Vertex chain inside the intake request if it risks timeout and **lost leads**.
- **Pattern:** Persist bubble + user + job payload → return redirect → worker writes **`tasks`** → client uses **Supabase Realtime** `postgres_changes` on `tasks` for that `bubble_id` (pattern already used elsewhere in the app for realtime features).

---

## 7. Trial expired (“day 4”) — soft lock (proposed)

When `now() > workspace_members.trial_expires_at` (if adopted):

- **Database / job:** Periodic job or on-read check sets `onboarding_status` to `trial_expired`.
- **Application:** Allow **lobby / read-only** experiences where product requires; **intercept** private bubble and premium task routes with paywall CTA.
- **Copy:** Clear distinction: **member preview** ended vs **BuddyBubble platform** subscription (see dual-lead-capture doc — do not conflate with `leads.converted_at` platform semantics).

---

## 8. Implementation phasing

| Phase                | Scope                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1 — Data & auth**  | Migrations: **`bubble_type`**, widen **`leads.source`**, optional **`workspace_members`** trial columns; ship **`POST /api/leads/storefront-trial`**; wire **magic link / OTP** as chosen. |
| **2 — Isolation**    | Auto-create **private** bubble + `bubble_members`; align **RLS** and **task list** filters for `guest`.                                                                                    |
| **3 — Async AI**     | Queue worker; connect fitness payload to [`/api/ai/generate-workout-chain`](../src/app/api/ai/generate-workout-chain/route.ts) or shared runner; Realtime UI in bubble.                    |
| **4 — Monetization** | Expiry job + paywall; Stripe path for **tenant’s** offering (B2B2C) is **out of scope** for v1 dual-lead doc — track separately.                                                           |

---

## 9. Analytics & leads (must align with dual capture)

- **Workspace funnel:** `public.leads` + **`trackWorkspaceLeadCaptured`** after **server-validated** insert.
- **Platform funnel:** `workspace_subscriptions`, Stripe [`create-trial`](../src/app/api/stripe/create-trial/route.ts), `billing_funnel_events` — not the same as “gym won a client.”
- **Do not** overload **`leads.converted_at`** for B2B2C “paid the gym” without a new column or table (see dual-lead-capture §6.3).
- **Hygiene (paid acquisition):** Plan a **Postgres job** (e.g. nightly) to delete stale storefront leads: e.g. `source` like `storefront%`, `converted_at IS NULL`, `created_at < now() - interval '30 days'`, so noise and storage do not overwhelm the coach CRM. Tune retention with product/legal.

**Schema note:** Today `public.leads.source` is constrained to invite-style values (`'qr' \| 'link' \| …`) in [`20260505100000_leads.sql`](../supabase/migrations/20260505100000_leads.sql). Storefront sources (**`storefront_organic`**, **`storefront_paid`**, etc.) require a **narrow migration** to widen the CHECK (or replace with enum) before writing those values.

---

## 10. Locked architectural decisions

Design goal: a **stateless top-of-funnel** so paid and organic traffic (bots, tire-kickers, partial forms) does not bloat Postgres or ruin the coach’s CRM. **No DB rows until verified email** at the final step.

### 10.1 Intake route: `/api/leads/storefront-trial`

- **Chosen path:** **`POST /api/leads/storefront-trial`** (Next.js route handler under `src/app/api/leads/`), **not** `/api/intake/soft-trial`.
- **Rationale:** Keeps all top-of-funnel **lead** ingestion under **`/api/leads/*`** for discoverability. Allows **stricter, distinct rate limits** than **`/api/leads/track`** (invite flow = higher trust; public storefront = **zero-trust**).

### 10.2 Storefront vs CRM: profile lives entirely in Astro

- **Choice:** Build the **14-question** (or product-defined) profile **only in the Astro storefront** — **no iframes**, no early handoff to Next.js for form state.
- **Rationale:**
  1. **Zero database bloat** — partial progress never touches Postgres; drop-offs vanish with no abandoned rows.
  2. **Edge security** — Turnstile / Vercel Edge (or similar) on the **Astro submit** step blocks bots before the CRM API.
  3. **Single gate** — Open Next.js + Postgres only when the user submits a **verified email** (step 15 / final CTA).

### 10.3 Lead row shape: reuse `public.leads`

- **Choice:** **One table** — extend **`public.leads`**; do **not** add `storefront_leads` (avoids `UNION` analytics).
- **Source values:** Use a strict enum (after migration widening CHECK), e.g. **`storefront_organic`**, **`storefront_paid`**, alongside existing invite sources.
- **Attribution:** Put UTM, storefront slug, campaign id, etc. in **`metadata` JSONB** (and keep `utm_params` as today where useful).
- **Cleanup:** Cron / job pattern in §9 — optional soft-archive for related **`bubble_type = 'trial'`** rows when trials expire (see §10.4).

### 10.4 `bubble_type`: required column

- **Choice:** Add **`bubbles.bubble_type`** as a **hard requirement** (checked in app + DB), e.g. **`standard`**, **`trial`**, **`dm`**.
- **Rationale:** Naming bubbles (“Trial: Jane”) does not scale; high-volume storefront trials would **clog the sidebar**. Typed bubbles enable:
  - **UI:** Default nav hides or buckets **`trial`**; **Member Manager** can expose **“Inbox” / “Active trials”** querying `bubble_type = 'trial'`.
  - **Ops:** Scripts can **archive or soft-delete** expired trial bubbles without touching **`dm`** / paying client channels.

---

## 11. Follow-ups (not blocking v1 design)

- Extend [`LeadSource`](../src/lib/lead-capture-analytics.ts) (or parallel type) for analytics + `trackWorkspaceLeadCaptured` once `leads.source` migration lands.
- Cross-link **`technical-design-dual-lead-capture-workflows-v1.md`** when `storefront-trial` ships so “invite lead” vs “storefront lead” copy stays accurate in analytics UI.

---

**Document version:** v1.2 (locked decisions: intake path, Astro-only funnel, `leads` reuse, `bubble_type`)  
**Last updated:** 2026-04-14
