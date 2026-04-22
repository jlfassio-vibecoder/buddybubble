# RBAC and permissions (BuddyBubble)

This document is the **canonical reference** for workspace roles, Postgres Row Level Security (RLS), dashboard UI guards, and how they interact with Stripe-backed subscription state. New dashboard features **must** preserve these boundaries: do not bypass RLS with insecure client filters, and align UI affordances with the same rules the database enforces.

---

## Executive summary

- **Workspace roles** live in `public.workspace_members.role`: `owner`, `admin`, `member`, `guest`, and `trialing` (Storefront Lead reverse-trial). They control admin surfaces, bubble visibility, and—for `guest`—a stricter task visibility policy.
- **Data fencing** is enforced primarily by **RLS** on Supabase (`bubbles`, `tasks`, `workspace_subscriptions`, etc.). The Next.js `app/(dashboard)/app/[workspace_id]/layout.tsx` gate only verifies **membership** (any role); it does not replace RLS.
- **UI guards** mirror product intent (e.g. owner-only analytics settings, admin-only socialspace settings gear) and **subscription paywalls** (`PremiumGate`) for paid workspace categories.
- **Stripe** drives `workspace_subscriptions.status` (and related fields). **Feature gating** for premium capabilities uses **subscription status + workspace category**, not which Stripe price tier was purchased—so all members in a paid-category workspace share the same premium vs locked experience while the host’s subscription is active or trialing.

---

## Role definitions

| Role         | Typical use                                | Workspace admin?           | Bubble visibility (summary)                                                                                                                             |
| ------------ | ------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **owner**    | Billing entity, full host control          | Yes (`is_workspace_admin`) | All bubbles the workspace can access per RLS                                                                                                            |
| **admin**    | Host delegates management                  | Yes                        | Same as owner for visibility; some owner-only routes remain exclusive to `owner`                                                                        |
| **member**   | Standard participant                       | No                         | Non-private bubbles by default; private bubbles require `bubble_members`                                                                                |
| **trialing** | Storefront lead reverse-trial (3 days)     | No                         | Treated as “member-ish” for `can_view_bubble` / `can_write_bubble` during the trial window (product gates still apply).                                 |
| **guest**    | Invite-only guest / restricted participant | No                         | **No** automatic access to all non-private bubbles via workspace role alone; **requires `bubble_members`** (or equivalent grants) for bubble visibility |

**Parsing:** Application code normalizes DB strings through `parseMemberRole` (`src/lib/permissions.ts`).

**Trialing vs guest:** `trialing` is issued by the Storefront Lead intake API and acts like a member for baseline participation during the `trial_expires_at` window. `guest` remains the stricter, invite-only role. Preview end dates and onboarding status live on `workspace_members` (e.g. `trial_expires_at`, `onboarding_status`) and are **separate** from the workspace Stripe subscription row (`workspace_subscriptions`) used for `PremiumGate`.

---

## Database fencing (RLS)

### Workspace membership

- Users must appear in `**workspace_members`\*\* for a workspace to be considered a member at all.
- Helpers such as `**public.is_workspace_admin(workspace_id)**` (owner/admin) and `**public.can_view_bubble(bubble_id)**` / `**public.can_write_bubble(bubble_id)**` centralize bubble and task policies (see migrations under `supabase/migrations/`, e.g. granular RBAC and guest task tightening).

### Bubbles (`bubbles_select`)

- `**can_view_bubble**`: workspace **owner/admin** always; **member** may see **non-private** bubbles in the workspace; **private** bubbles require an explicit `**bubble_members`\*\* row (viewer/editor) for that user.
- **Guests (`workspace_members.role = 'guest'`)** are **not** included in the “member sees all non-public channels” branch of `can_view_bubble` (that branch requires `role in ('owner','admin','member')`). Guests therefore **depend on `bubble_members`** (or admin-level access they do not have) to **see** a bubble in listings and downstream queries.

### Tasks (`tasks_select` / `tasks_update`)

- **Non-guests:** broadly `can_view_bubble` (read) and `can_write_bubble` / assignee rules (write), plus assignee-aware paths where migrations define them.
- **Guests:** `**public.is_workspace_guest(workspace_id_for_bubble(bubble_id))`** tightens visibility. Guests do **not** receive the same “see all tasks in every visible bubble” surface as members; policy requires **assignee** relationships and/or **unassigned-in-visible-bubble** patterns per the latest `tasks_select` policy (see `20260624120000_live_session_deck_and_task_assignees.sql` and earlier storefront guest migrations). **Do not\*\* rely on client-side filters alone—RLS is authoritative.

### Workspace settings and subscriptions (writes)

- `**workspace_subscriptions`**: member-readable RLS; **writes\*\* go through service-role server routes and webhooks (not arbitrary client writes).
- `**workspaces` updates** (e.g. timezone, public slug): RLS requires **workspace admin\*\* (`is_workspace_admin`); see product copy in `WorkspaceSettingsModal` when updates affect zero rows.

---

## UI access and guards

### Layout and routing

- `**src/app/(dashboard)/app/[workspace_id]/layout.tsx`**: redirects unauthenticated users; requires a `**workspace_members`row** for the current user and workspace. Passes role into`DashboardShell`as`initialRole`. **Join-request** prefetch for the shell is limited to **owner/admin**.

### Owner vs admin vs member (dashboard chrome)

- **Socialspace settings** (`WorkspaceSettingsModal` entry via **Settings** gear in `BubbleSidebar`): rendered only when `**isAdmin`** (owner or admin), not for plain `**member\*\*`. This matches who can update `workspaces` under RLS.
- `**/app/[workspace_id]/settings/analytics**`: **owner-only** server page; non-owners are redirected (see `settings/analytics/page.tsx`).
- `**/app/[workspace_id]/settings/subscription`**: members may open the page; copy explains billing changes are **owner\*\*-only; Stripe portal usage is owner-oriented.

### Trial / guest soft lock (`TrialPaywallGuard`)

- **Logic source:** `memberPreviewPeriodEnded` / `shouldSoftLockTrialSurfaces` in `src/lib/member-trial-soft-lock.ts` (guest role + `trial_expired` or `trial_active` with `**trial_expires_at` in the past**, scoped to **trial\*\* bubbles or aggregate view when trial bubbles exist).
- `**TrialPaywallGuard`** (`src/components/subscription/trial-paywall-guard.tsx`) receives a boolean `**locked**`; when true, it applies a **blur + non-interactive overlay** over its **children\*\* only.
- **Wrapped surfaces:** In `DashboardShell` / `WorkspaceMainSplit`, the guard wraps the **main board** (Kanban, fitness **Analytics** board, Classes, Programs) and the **calendar rail** when locked—**not** the **Messages / chat** column. Chat remains intentionally usable so guests can still read lobby/chat context while the board is soft-locked after preview end.

### Premium features (`PremiumGate`)

- Wraps AI, analytics, export, and other premium surfaces for **business** and **fitness** workspaces when subscription status is not **trialing** / **active** (see `src/lib/subscription-permissions.ts` and `src/store/subscriptionStore.ts`).
- **Owners** see unlock CTAs; non-owners may see owner-only messaging where implemented.

---

## Subscription tier interaction

### What Stripe controls

- **Stripe webhooks** and checkout/trial APIs maintain `**workspace_subscriptions`** (`status`, periods, Stripe ids, etc.). Price / product ids are stored for billing and catalog mapping; they are **not\*\* the primary input to `resolveSubscriptionPermissions`.

### What the app gates on

- `**workspaces.category_type`**: only `**business**`and`**fitness**` require an active paid subscription for premium feature flags. Community / kids / class workspaces are treated as **not requiring\*\* a subscription for those flags.
- `**workspace_subscriptions.status`** (or absence of a row → effective `**no_subscription**`): `**trialing**`and`**active**` unlock **premium** flags for paid categories. Other statuses yield **read-only / locked** premium behavior for the **entire workspace’s members\*\*—not only the owner.

### Implications for engineering

- **Standard members** inherit the host workspace’s subscription state: if the host’s subscription lapses, **members also hit `PremiumGate`** for AI, in-dashboard analytics boards, etc. This is intentional: premium is a **workspace** entitlement, not a per-seat personal plan in the current model.
- **Stripe “tier”** (e.g. Athlete vs Studio Pro price) affects **billing, plan picker, and catalog metadata** (`src/lib/stripe-plans.ts`, `getStripePlans()`), not the boolean premium matrix in `resolveSubscriptionPermissions`.
- **Storefront guest preview** (`guest` + `trial_expires_at` / `onboarding_status`) is an **orthogonal** axis to Stripe: a guest can be soft-locked on the board while the workspace subscription is still active, and conversely workspace billing does not automatically clear guest preview timers—refer to onboarding and cron docs for lifecycle.

---

## Related files (quick index)

| Concern                  | Primary locations                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Role flags (UI)          | `src/lib/permissions.ts`, `src/hooks/use-permissions.ts`, `DashboardShell`, `BubbleSidebar`                             |
| Subscription flags       | `src/lib/subscription-permissions.ts`, `src/store/subscriptionStore.ts`, `src/components/subscription/premium-gate.tsx` |
| Guest task / role helper | `src/lib/guest-task-query.ts`, `src/lib/member-trial-soft-lock.ts`                                                      |
| Trial paywall UI         | `src/components/subscription/trial-paywall-guard.tsx`, `workspace-main-split.tsx`, `dashboard-shell.tsx`                |
| Stripe catalog / status  | `src/lib/stripe.ts`, `src/lib/stripe-plans.ts`, `src/app/api/stripe/webhook/route.ts`                                   |
| RLS source of truth      | `supabase/migrations/*.sql`                                                                                             |

When in doubt, **verify behavior against RLS** in Supabase and treat this document plus migrations as the contract for new features.
