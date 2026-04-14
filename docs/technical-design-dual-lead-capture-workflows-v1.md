# Technical design: dual lead capture workflows (platform vs workspace) — v1

## 1. Problem

BuddyBubble currently mixes **two different meanings of "lead"** in conversation and, in places, in product surfaces:

1. **Platform lead** — A person or organization the **product owner** (BuddyBubble) wants to **sell a BuddyBubble account to** (B2B/B2C SaaS funnel: awareness → trial → paid subscription to the platform).

2. **Workspace lead** — A person a **tenant account owner** (e.g. gym, studio, business) invites into **their** workspace bubble (B2B2C growth funnel: invite → visit → identity → membership → eventual payment _to the tenant_ or owner disposition).

The **workspace** funnel is partially implemented: `public.leads`, `/api/leads/track`, invite journey analytics, and workspace-scoped analytics UI for business/fitness categories. The **platform** funnel uses separate mechanisms (`analytics_events`, `billing_funnel_events`, Stripe flows, auth) but is not named or bounded as a first-class "lead workflow" in documentation or UI copy.

Without an explicit split:

- Metrics and labels ("Leads captured") can be misread as **platform** acquisition when they mean **workspace** invite traffic.
- Future B2B2C payments (customer pays the business) must not overload **`leads.converted_at`**, which today is written from **platform** workspace billing (`/api/stripe/create-trial`).
- Reused UI components (cards, tables, timelines) risk **semantic collision** unless scope is clear in code and copy.

## 2. Goals

| Goal                | Description                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Clear taxonomy**  | Stable **internal names** and **user-facing labels** for each workflow; glossary usable in engineering and design reviews.                                        |
| **Data boundaries** | Each workflow maps to **well-defined stores and events**; overlaps (same `user_id`) are **linkable** but not **merged** without an explicit rule.                 |
| **UI scope**        | Workspace analytics surfaces describe **tenant growth** only; any future **platform** dashboard uses distinct copy and queries.                                   |
| **Extensibility**   | Room for **owner disposition** (status) on workspace leads and **platform attribution** (campaign, referral) without rewriting v1 tables.                         |
| **No regressions**  | Document **current behavior** (`converted_at`, `lead_captured` events) honestly; migrations are **additive** unless a later version explicitly changes semantics. |

## 3. Non-goals (v1)

- Implementing **B2B2C checkout** (end customer pays the business).
- A unified **`leads`** table for both workflows.
- **Real-time** platform CRM or workspace CRM at scale.
- Backfilling historical analytics with new event names (optional follow-up).

## 4. Definitions

### 4.1 Platform (BuddyBubble) lead workflow

**Purpose:** Acquire and convert **BuddyBubble account owners** (subscribers to the product).

**Primary actors:** Prospective account owner; BuddyBubble (operator).

**Typical stages (conceptual):**

| Stage        | Description                                   | Illustrative system touchpoints (existing)                                                        |
| ------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Acquisition  | Site, ads, content, outbound                  | Marketing site, UTM (future first-class store)                                                    |
| Evaluation   | Signup, explore product                       | Supabase `auth.users`, app onboarding                                                             |
| Monetization | Trial or paid subscription to **BuddyBubble** | `workspace_subscriptions`, Stripe (`/api/stripe/create-trial`, webhooks), `billing_funnel_events` |
| Retention    | Usage, expansion                              | Product analytics, subscription state                                                             |

**Success:** Paid (or agreed) **platform** subscription. Not the same as "joined someone's workspace."

### 4.2 Workspace (tenant / bubble) lead workflow

**Purpose:** Help **each tenant** understand and convert people they invite into **their** workspace.

**Primary actors:** Tenant owner/admin; invitee (guest or future member).

**Typical stages (aligned with current implementation):**

| Stage         | Description                                      | System touchpoints (current)                                                       |
| ------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Invite issued | Owner creates link, QR, email, SMS               | `public.invitations`, invite journey (`invite_journey_step` on `analytics_events`) |
| Touchpoint    | Invitee opens invite URL                         | `POST /api/leads/track` → `public.leads` (business/fitness only)                   |
| Identity      | Sign-in or guest path                            | `leads.user_id` when linked; invite journey steps across login/onboarding          |
| Membership    | Joined or pending approval                       | `accept_invitation` outcomes; may still be an "open" workspace lead                |
| Exit          | **Future:** paid to tenant, or owner closed/lost | Not fully implemented; see §7                                                      |

**Success (product intent):** Defined per tenant: e.g. **purchase**, **booked class**, or **owner-marked won** — not automatically "created BuddyBubble account."

### 4.3 Bridge: same human, two workflows

A person may:

1. Enter as a **workspace lead** (invited to tenant A's bubble).
2. Later create **their own** BuddyBubble account (e.g. "Add bubble" / new workspace).

At step 2 they become a **platform** prospect/account owner in addition to any historical **workspace** `leads` row. **Recommendation:** link by `user_id` for support and analytics; **do not** delete or merge workspace rows into platform tables.

## 5. Current codebase (anchor points)

| Concern                      | Location / behavior                                                                                                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workspace lead rows          | `public.leads` — created by `/api/leads/track` and `/api/leads/storefront-trial`; RLS: workspace owners/admins read                                                                                                                                                      |
| Acquisition segment          | `lead_captured` analytics event metadata (`workflow`, `acquisition_context`, `source`, UTM); `leads.utm_params` for UTM on the row; `invitations.invite_type` remains source of truth for in-person vs online for invite flows — see `src/lib/lead-capture-analytics.ts` |
| Workspace analytics UI       | `src/app/(dashboard)/app/[workspace_id]/settings/analytics/page.tsx` — workspace funnel cards query `analytics_events` (e.g. `lead_captured`, invite journey, billing funnel types); segment cards / invite journey use `leads` + `invitations` where shown in that page |
| Invite journey               | `analytics_events.event_type = 'invite_journey_step'`; writers across invite/login/onboarding                                                                                                                                                                            |
| `lead_captured` funnel event | Emitted server-side on first insert from `/api/leads/track` and `/api/leads/storefront-trial` (workspace-scoped metadata)                                                                                                                                                |
| `converted_at` on `leads`    | Set in `/api/stripe/create-trial` when matching `user_id` + workspace — **platform trial/subscription context**, not B2B2C purchase                                                                                                                                      |
| Platform billing funnel      | `billing_funnel_events`; Stripe routes under `src/app/api/stripe/`                                                                                                                                                                                                       |

## 6. Proposed architecture

### 6.1 Naming in code and UI

| Internal term  | User-facing (workspace)                         | User-facing (platform)                                                 |
| -------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| Workspace lead | "Invite leads", "Workspace leads", "Your leads" | —                                                                      |
| Platform lead  | —                                               | "Account", "Subscription", or "Get BuddyBubble" funnel (TBD marketing) |

**Rule:** The string **"Leads captured"** on **workspace** analytics must continue to mean **invite-attributed `leads` rows** (or explicitly scoped "last 30 days"), never platform signup count without relabeling.

### 6.2 Data model boundaries (v1)

```
┌─────────────────────────────────────┐     ┌──────────────────────────────────┐
│  Platform funnel                     │     │  Workspace (tenant) funnel        │
│  ─────────────────                  │     │  ────────────────────────         │
│  auth, users                         │     │  leads (per workspace_id)         │
│  workspace_subscriptions             │     │  invitations                       │
│  stripe_*, billing_funnel_events     │     │  analytics_events (invite_journey) │
│  analytics_events (product/funnel)   │     │  workspace_members (outcome)      │
└─────────────────────────────────────┘     └──────────────────────────────────┘
           │                                                    │
           └──────────────── same user_id may appear ──────────┘
```

- **Workspace lead** is keyed by **`leads.id`** + **`workspace_id`**.
- **Platform customer** is keyed by **subscription / Stripe customer** and **user** owning the paid workspace.

### 6.3 `leads.converted_at` semantics (honest + forward path)

**Today:** Set when platform flow completes **`/api/stripe/create-trial`** for that user and workspace (see `create-trial` route). That is **"platform monetization touched this user in this workspace context"**, not **"tenant won the end customer."**

**Recommendation for future versions:**

- Either **rename** in product copy to **"Trial started (lead updated)"** when surfaced to tenants, **or**
- Add **`workspace_lead_outcome`** / **`disposition`** / **`won_at`** for B2B2C and keep **`converted_at`** strictly platform-aligned, **or**
- Introduce **`platform_converted_at`** vs **`tenant_converted_at`** in a migration (only after stakeholder sign-off).

v1 TDD **does not** require a migration; it requires **documentation** so engineers do not use `converted_at` for B2B2C "paid the gym."

### 6.4 Events

| Event / store                        | Workflow      | Notes                                |
| ------------------------------------ | ------------- | ------------------------------------ |
| `invite_journey_step`                | Workspace     | Token-scoped diagnostics             |
| `lead_captured` (analytics)          | Workspace     | First touch from `/api/leads/track`  |
| `trial_started`, billing funnel keys | Platform      | BuddyBubble subscription journey     |
| `page_view`, product funnel types    | Both possible | Scope by `workspace_id` and metadata |

New platform-only or workspace-only event types should be added with **namespacing** in metadata (e.g. `workflow: 'platform' | 'workspace'`) if ambiguity appears in shared `analytics_events` queries.

### 6.5 Component reuse

Shared **presentation** components (metric cards, tables, date windows) are fine; **data hooks** should accept explicit props:

- `workflow: 'workspace' | 'platform'`
- Query functions namespaced: `getWorkspaceLeadMetrics`, `getPlatformFunnelMetrics` (illustrative).

## 7. Future work (post–v1)

| Item                  | Description                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| **Owner disposition** | `leads.status` or `disposition`: open, won, lost, spam — editable by tenant admin                    |
| **B2B2C payment**     | Separate table or columns for **payment to tenant**; webhooks; do not overload platform Stripe trial |
| **Platform lead CRM** | Optional table or integration for pre-auth prospects (marketing site)                                |
| **Attribution**       | Link workspace lead → later platform account creation via `user_id` + timestamp rules                |

## 8. Acceptance criteria (documentation)

- [ ] Engineering onboarding links to this doc from a single index or README entry (optional follow-up).
- [ ] New features that add "lead" states must state **which workflow** they belong to in the PR description.
- [ ] Workspace-facing copy reviewed so **"lead"** does not imply **BuddyBubble is selling to that person** in the tenant context.

## 9. Open questions

1. **Marketing brand:** Public name for the platform funnel ("BuddyBubble account" vs "Start your bubble") — product decision.
2. **Tenant-facing label for `converted_at`:** Show at all until semantics are split?
3. **Privacy:** If platform analytics ever **correlate** workspace leads to new accounts, ensure **disclosure** and **retention** policy alignment.

---

**Document version:** v1  
**Last updated:** 2026-04-14  
**Related:** `docs/technical-design-stripe-dual-mode-and-billing-funnel-analytics-v1.md`, `supabase/migrations/20260505100000_leads.sql`, `src/app/api/leads/track/route.ts`, `src/app/api/stripe/create-trial/route.ts`
