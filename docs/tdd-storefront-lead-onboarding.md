# TDD: Storefront lead onboarding (Astro) — companion to lead onboarding

**Status:** **Partially implemented** — CRM intake and isolation path exist; **storefront UX still does not match** the progressive flow in [`docs/tdd-lead-onboarding.md`](./tdd-lead-onboarding.md) §3 and §10.2 (implementation drift: email-first “thin intake”).

**Related:**

- [`docs/tdd-lead-onboarding.md`](./tdd-lead-onboarding.md) — canonical **end-to-end** PLG story (stateless profile → preview → email gate → `POST /api/leads/storefront-trial`).
- [`docs/technical-design-dual-lead-capture-workflows-v1.md`](./technical-design-dual-lead-capture-workflows-v1.md) — platform vs **workspace** lead taxonomy; `leads.converted_at` semantics.

**Naming:** Product copy may use **socialspace**; code and schema use **`workspaces`**, **`workspace_id`**, **`workspace_members`** until a rename ships.

---

## 1. Executive summary (storefront scope)

This document covers **only** the **public Astro storefront** (`apps/storefront`): how visitors move from **anonymous** profile/preview to **verified email**, then into the Next.js CRM via **`POST /api/leads/storefront-trial`**.

The **parent TDD** defines the full funnel (including async AI after intake, RLS, member trial expiry). This companion doc adds:

1. **Honest “as-built”** notes for what shipped in the repo vs what is still design.
2. **Why drift happened** (API shape drove UI order).
3. **Two preview strategies** (lightweight vs real unauthenticated AI) and the extra work for Option B.
4. **Concrete file anchors** for engineers implementing the multi-step island.

---

## 2. Relationship to `tdd-lead-onboarding.md`

| Topic                                                                    | Where it lives                              |
| ------------------------------------------------------------------------ | ------------------------------------------- |
| Full sequence (profile → preview → email → intake → redirect → Realtime) | Parent **§3**                               |
| “No DB until email”; Astro-only profile state                            | Parent **§10.2**                            |
| Intake contract, `leads`, `bubble_type`, guest isolation, async AI       | Parent **§4–§8**, **§10.1**, **§10.3–10.4** |
| **Storefront-specific** UI state, sessionStorage, proxy, preview fork    | **This doc**                                |

---

## 3. Implementation drift (what went wrong)

**Design (parent §3):** Stateless profile → preview (“aha”) → **email gate** → first call to **`/api/leads/storefront-trial`**.

**Execution:** `POST /api/leads/storefront-trial` was implemented **first** and **requires** a valid `email` to create/link the user and provision the trial bubble. The storefront shipped a **thin intake**: an email field + CTA wired straight to that API, **skipping** in-browser profile accumulation and any real preview step.

**Root cause:** The **first hard dependency** in the pipeline was treated as the **first UI step**. Intermediate client state (profile JSON, preview payload) was never built, so PLG ordering was inverted.

This is a **product/UX + client-state** gap, not a fundamental API mistake: the backend remains the correct **email gate** orchestrator; the frontend must **stop calling it until the gate**.

---

## 4. Current codebase (“as-built”)

### 4.1 Storefront (Astro)

| Piece             | Location                                                                                                                | Behavior today                                                                                                                                                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slug page         | [`apps/storefront/src/pages/[slug].astro`](../apps/storefront/src/pages/[slug].astro)                                   | For `category_type` **business** or **fitness**, renders hero CTA island + existing **Join community** link.                                                                                                                                                                                                                    |
| CTA island        | [`apps/storefront/src/components/StorefrontPreviewCta.jsx`](../apps/storefront/src/components/StorefrontPreviewCta.jsx) | **Phase S1:** “Start 3-Day Preview” opens a **profile wizard** (3–4 questions) → **email gate** → `fetch('/api/storefront-trial', …)` with `publicSlug`, `email`, `source`, `utmParams`, **`profile`**. Draft state in **`sessionStorage`** key `buddybubble_storefront_trial_v1:{slug}` — **no** CRM calls until email submit. |
| Same-origin proxy | [`apps/storefront/src/pages/api/storefront-trial.ts`](../apps/storefront/src/pages/api/storefront-trial.ts)             | Server `POST` forwards JSON to **`{CRM_ORIGIN}/api/leads/storefront-trial`** (see [`crm-origin.ts`](../apps/storefront/src/lib/crm-origin.ts), [`public-env.ts`](../apps/storefront/src/lib/public-env.ts)). Avoids browser CORS to Next.                                                                                       |

### 4.2 CRM (Next.js)

| Piece                      | Location                                                                                        | Behavior today                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intake                     | [`src/app/api/leads/storefront-trial/route.ts`](../src/app/api/leads/storefront-trial/route.ts) | Validates `publicSlug`, `email`, `source` (`storefront_organic` \| `storefront_paid`), optional **`profile`** (serialized, size-capped), optional `utmParams`. Provisions guest + trial bubble + `leads`, emits **`trackWorkspaceLeadCaptured`**, may schedule post-response workout job for fitness. Returns JSON **`next`** (login + deep link). |
| Unauthenticated AI preview | —                                                                                               | **Not implemented.** There is **no** `POST /api/ai/storefront-preview` (or equivalent) in the repo.                                                                                                                                                                                                                                                |
| “Cached preview” on intake | —                                                                                               | **Not implemented.** Intake does **not** accept a `cachedWorkoutData`-style blob to skip generation; fitness still relies on **enqueue** path after redirect where applicable.                                                                                                                                                                     |

### 4.3 Isolation, trial window, expiry (CRM — largely as parent TDD)

Examples (non-exhaustive; see parent doc and migrations for full matrix):

- Guest task visibility helpers (e.g. [`src/lib/guest-task-query.ts`](../src/lib/guest-task-query.ts)) and dashboard wiring.
- Member trial soft lock UI: e.g. [`src/components/subscription/trial-paywall-guard.tsx`](../src/components/subscription/trial-paywall-guard.tsx).
- Cron: [`src/app/api/cron/expire-member-trials/route.ts`](../src/app/api/cron/expire-member-trials/route.ts).

Schema details (`bubble_type`, `leads.source`, `trial_expires_at`, etc.) remain as described in **parent §4 / migrations**; this companion does not duplicate every column.

---

## 5. Target storefront flow (realignment)

### 5.1 Required: multi-step island + session persistence

1. **State machine** — One React island (or equivalent) owns steps: e.g. `profile` → `preview` → `email` (names are product-defined).
2. **Profile payload** — Collect answers into a single JSON object compatible with intake (**`profile`** on `POST /api/leads/storefront-trial` already exists for fitness mapping).
3. **Persistence** — On step change, write draft state to **`sessionStorage`** (and optionally rehydrate on load) so refresh on question _n_ does not wipe progress. Still **no** Postgres until email submit.
4. **Hero CTA** — Prefer a single primary (“Start 3-day preview” / “Build your plan”) that **enters** the wizard; **email only on the final step**.

### 5.2 Preview: architecture fork (“crucial choice”)

| Option                  | Preview UX                                                                                                                                               | Backend / cost                                                                                                                                                                                                                                                                                                                                     | Abuse surface                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **A — Lightweight**     | Skeleton, copy, static template, or **client-only** heuristic “sample day” (no tenant-specific AI).                                                      | **No** new public AI route. Email submit unchanged; optional **`profile`** passed for post-login generation (matches parent async pattern).                                                                                                                                                                                                        | Low                                |
| **B — Real AI preview** | Call a **new** unauthenticated endpoint with profile (+ **Turnstile** token); return partial JSON (e.g. day 1); render real content; email saves to CRM. | New route (e.g. `POST /api/ai/storefront-preview`): rate limits, token budget, **no Postgres** for abandoned runs. Optional follow-on: extend intake to accept **trusted** cached payload to **persist promised workout** and avoid double LLM billing (requires strict validation, size limits, and threat modeling — **not in codebase today**). | **High** — must cap $ and scraping |

**Product decision:** Pick A or B before engineering detailed tickets. Option B is strictly more work (new API + edge protection + possibly intake extension).

---

## 6. Suggested implementation phasing (storefront + optional AI)

| Phase   | Scope                                                                                                                                       | Status                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **S0**  | Intake **`POST /api/leads/storefront-trial`** + guest/trial bubble + analytics + CRM UX (Kanban paywall, cron, etc.)                        | **Shipped** (see §4)                                                        |
| **S1**  | Storefront **multi-step** profile + **sessionStorage**; **email last**; pass **`profile`** + existing `source` / `utmParams` to proxy → CRM | **Shipped** (wizard + `buddybubble_storefront_trial_v1:{slug}` persistence) |
| **S2a** | Option **A** preview (non-AI or static)                                                                                                     | **Pending** (depends on S1)                                                 |
| **S2b** | Option **B** preview API + Turnstile + IP/user quotas; storefront calls it before email                                                     | **Pending** (design + security review)                                      |
| **S3**  | Optional: intake accepts vetted **cached workout JSON** to insert task(s) without second generation                                         | **Pending** (only if S2b ships; not designed in code yet)                   |

---

## 7. Analytics & hygiene

- **`lead_captured`** remains **server-only** (see [`src/app/api/analytics/event/route.ts`](../src/app/api/analytics/event/route.ts)); do not emit from the storefront for fake funnel steps.
- Storefront funnel metrics continue to come from **`trackWorkspaceLeadCaptured`** after **`leads`** insert on successful intake (parent **§9**).

---

## 8. Locked decisions (this companion)

1. **Email gate stays on `POST /api/leads/storefront-trial`** — First moment that creates `auth` user + `workspace_members` + `leads` + trial bubble.
2. **Storefront uses same-origin proxy** — Keep [`apps/storefront/src/pages/api/storefront-trial.ts`](../apps/storefront/src/pages/api/storefront-trial.ts) unless CRM and storefront are same origin with CORS solved.
3. **Option B is opt-in** — Real pre-email AI requires explicit product approval, budget caps, and abuse controls; until then, document Option A as the default path.

---

**Document version:** v1.0 (formatted companion + codebase-aligned revision)  
**Last updated:** 2026-04-14
