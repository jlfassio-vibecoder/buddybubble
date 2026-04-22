# Trial & Member Access — Architecture Audit (Schema + Gating)

**Date:** 2026-04-22  
**Scope:** Feasibility of tenant-owner–defined granular permissions for the `trialing` role (bubbles, AI, video), with guaranteed baselines (manual Kanban, Workout Player updates, messaging in granted bubbles).

---

## 1. Schema audit (`workspaces` & `workspace_members`)

### `workspaces`

- Core columns come from `20260404140000_initial_schema.sql` and later alters (`public_slug`, `is_public`, `calendar_timezone`, `icon_url`, etc.).
- **Existing JSONB:** `public_branding` (`20260425120000_add_public_portals.sql`, default `'{}'::jsonb`) — documented as **public storefront branding** (logo, hero, colors, copy).
- **No** general-purpose `settings`, `preferences`, or `tenant_config` JSONB column exists today.
- **Generated type snapshot** (`src/types/database.generated.ts`): `workspaces.Row` includes `public_branding: Json` and no other JSONB fields.

**Conclusion:** You _could_ overload `public_branding` or add a sibling key under a new top-level column, but **reusing `public_branding` for `trial_role_template` is a poor fit** (mixes public marketing data with internal RBAC policy). A **dedicated column** (e.g. `workspace_role_policy jsonb` or a normalized table) is cleaner.

### `workspace_members`

- Role is `text` with a **CHECK** constraint (not a Postgres ENUM); `trialing` is supported in `20260628120000_trialing_role_storefront_lead.sql`.
- Additional columns include `trial_expires_at`, `onboarding_status` (`20260520120000_storefront_lead_phase1.sql`), `show_email_to_workspace_members` (`20260518120000_qr_instant_preview_and_email_privacy.sql`).
- **No JSONB** on `workspace_members` in current migrations; per-user **overrides** for “this trialing user’s feature flags” would require either a new column or a separate table keyed by `(workspace_id, user_id)`.

---

## 2. Feature gate audit (`PremiumGate` & AI routes)

### `PremiumGate` (`src/components/subscription/premium-gate.tsx`)

- Gates on `**workspace_subscriptions`–derived status\*\* via `useSubscriptionStore` + `resolveSubscriptionPermissions(categoryType, subStatus)`.
- **Role usage:** `parseMemberRole` + `usePermissions` only to determine **owner vs non-owner** (who can open billing / “Unlock”); **it does not branch on `trialing` vs `member` for feature allow lists**.
- **No database-backed** per-role or per-user feature matrix — subscription layer only.

### AI API routes (sample)

| Route                            | Primary gate                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `generate-card-cover`            | `resolveSubscriptionPermissions` → `perms.canUseAI` (workspace subscription)                                     |
| `quick-workout-from-profile`     | Membership + `canWriteBubble` (RLS-aligned); **no** `resolveSubscriptionPermissions` in the first decision block |
| `storefront-preview`             | Unauthenticated + rate limits; not tenant policy                                                                 |
| `retry-storefront-trial-workout` | `workspace_members` + `guest` / `trial_active` checks (special-case storefront path)                             |

**Conclusion:** Enforcement is **mixed**: many AI entry points are **subscription-first**; some are **capability/RLS-first** (`can_write_bubble`). There is **no unified** “tenant policy JSON” or “trialing feature flags” read path in the API layer today.

---

## 3. Baseline non-negotiables (RLS)

**Policies of record (RBAC migration):** `20260427100000_rbac_granular_permissions.sql`

- `tasks_insert`: `with check (public.can_write_bubble(bubble_id))`
- `messages_insert`: `with check (user_id = auth.uid() and public.can_view_bubble(bubble_id))`
- `tasks_update` (later extended in `20260624120000_…` and storefront guest isolation): still centered on `can_write_bubble` / assignees, with a **separate stricter path for `guest`** via `is_workspace_guest()`.

`**trialing` support:** `20260628120000_trialing_role_storefront_lead.sql` extends `can_view_bubble` / `can_write_bubble` so `workspace_members.role` may be `'trialing'` in the same branches as `'member'` for **non-private** bubbles; explicit `bubble_members` still grants access to **private\*\* bubbles (viewer/editor).

**Conclusion:** For a `trialing` user who **already passes** `can_view_bubble` / `can_write_bubble` (public bubble as trialing, or `bubble_members` on a private bubble), **Postgres RLS does not add an extra “trialing blocked” rule** for inserts/updates. Any **new** product restrictions (AI, live video) must be enforced **above** RLS in app/API, or you would add **new** policies/functions — which risks violating the “baseline always on” guarantee unless carefully scoped (e.g. do not change `can_write_bubble` to encode AI; gate AI routes only).

---

## 4. Proposal: where to store granular toggles

### Option A — `workspaces` JSONB (e.g. `trial_access_policy` or `role_feature_policy`)

| Pros                                                                               | Cons                                                                                                     |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Fast to ship; one read with workspace; easy versioning with a `policy_version` int | Hard to **partially index** or **FK** to `bubbles`; **no row-level history** per change without triggers |
| Fits “one template per workspace for `trialing`”                                   | Concurrent edits / validation solely in app; **RLS can’t** easily read nested bubble IDs without helpers |

**Best for:** A **single default template** per workspace: e.g. `{ "trialing": { "ai": false, "live_video": false, "bubble_ids": ["uuid", ...] } }` with validation in a Server Action + Zod.

### Option B — `workspace_role_permissions` (normalized) or `workspace_trial_bubble_access` + `workspace_feature_flags`

Example shapes:

- `(workspace_id, role, feature_key, allowed boolean)` — for AI / video / analytics flags.
- `(workspace_id, bubble_id, role)` or `(workspace_id, bubble_id, allowed_roles[])` — for **bubble allowlists** (if you outgrow JSON).

| Pros                                                                                                                 | Cons                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Queryable** (reporting, admin UI, audit log); can attach **RLS** or `SECURITY DEFINER` RPCs that read a single row | More tables/migrations; need **migrations** when adding new `feature_key` or use a **text** feature key + check in app |
| Can index `(workspace_id, role)` and enforce uniqueness                                                              | Slightly more boilerplate than one JSON document                                                                       |

**Best for:** **Auditability**, future **per-user overrides**, and **enforcing** policies in the database (e.g. optional RPC: `tenant_allows_trial_feature(workspace_id, user_id, 'ai')` used by edge functions).

### Recommendation for this product

- **Start with a dedicated JSONB on `workspaces`** (e.g. `role_access_policy jsonb default '{}'`) **scoped to owner-editable policy**, _not_ `public_branding`.
- **Plan a follow-up** to Option B if you need:
  - per-bubble rows at scale (100+ rules),
  - history/audit,
  - or DB-enforced checks shared by many API routes.

**Implementation note:** **Enforce in API routes and Server Actions** first (read policy + `workspace_members.role === 'trialing'`), and **keep RLS** as the coarse “can they touch this bubble at all?” layer. That preserves baselines: **do not** remove `can_write_bubble` for trialing unless a feature is explicitly _additive_ to deny (prefer feature-specific checks).

---

## 5. Gaps to close for the “settings UI”

1. **Schema:** add a storage location (JSONB column or new table) — **not** `public_branding`.
2. **Read path:** extend loaders (`workspaceStore` / server layout) to fetch policy once per session.
3. **AI routes:** centralize a helper, e.g. `assertTenantFeature({ workspaceId, userId, feature: 'ai' })`, combining **subscription** + **trialing policy** (today these are split).
4. **Video / live:** mirror ChatArea / live-video entry points with the same helper (UI already hides some actions by role; **policy** should still be server-checked).
5. **Optional:** `trialing` **bubble list** in JSON vs join table — if owners pick **many** bubbles, a child table is cleaner; if **few**, JSON array of UUIDs under the workspace policy is acceptable.

---

_This document is a planning aid; it does not change runtime behavior._
