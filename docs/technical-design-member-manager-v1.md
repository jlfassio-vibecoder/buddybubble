# Technical design: Member Manager — V1 (Studio Pro / Coach Pro)

## 1. Purpose

This document records an **architectural assessment** of BuddyBubble’s current member-management capabilities, a **gap analysis** against the product direction (owner-led management of large member bases, bubble-level access, cohort-style filtering, and progressively stricter client visibility), and a **V1 technical design** for a first **Member Manager** experience aimed at **Studio Pro** and **Coach Pro** tiers, with a path to tier-limited variants later.

Companion references:

- [`docs/rbac-matrix-v1.md`](rbac-matrix-v1.md) — workspace + bubble RBAC
- [`docs/technical-design-granular-permissions-dashboard-v1.md`](technical-design-granular-permissions-dashboard-v1.md) — original “members & bubble access” dashboard intent
- [`docs/technical-design-program-scoped-workouts-v1.md`](technical-design-program-scoped-workouts-v1.md) — programs, `assigned_to`, `program_id`

---

## 2. Architectural assessment (current implementation)

### 2.1 Identity and membership

| Area                   | Implementation                                                                                                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Socialspace membership | `workspace_members` — roles `owner`, `admin`, `member`, `guest`                                                                                                                                                                                                 |
| Invitations            | `invitations`, `invitation_join_requests`, RPCs `accept_invitation` / `approve_invitation_join_request`; invite carries target **role** (not `owner`)                                                                                                           |
| Admin roster APIs      | `src/app/(dashboard)/app/[workspace_id]/invites/member-actions.ts` — `listWorkspaceMembersAction`, `updateMemberRoleAction`, `removeMemberAction` (admin **or** owner for most operations; owner-only rules for promoting to `owner` and last-owner protection) |
| Member profile (admin) | `src/app/(dashboard)/app/[workspace_id]/invites/member-profile-actions.ts` — `getWorkspaceMemberProfileForAdminAction`, notes via `workspace_member_notes`                                                                                                      |

**Assessment:** Core **who is in the socialspace** and **workspace role** management is in place and RLS-aligned. The **People & invites** area (`invites-client`, `MembersSection`) is the primary operator surface today.

### 2.2 Granular access (bubbles)

| Area                 | Implementation                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Private bubbles      | `bubbles.is_private` — non-members do not see unless admin/owner bypass or explicit `bubble_members`                                                                                                         |
| Per-bubble grants    | `bubble_members` (`editor` \| `viewer`)                                                                                                                                                                      |
| Permission math (UI) | `src/lib/permissions.ts` — `resolvePermissions`, `canViewBubble`, `canWriteBubble`                                                                                                                           |
| Server actions       | `src/app/(dashboard)/app/[workspace_id]/bubble-actions.ts` — `listWorkspaceBubbleAccessAction`, `addBubbleMemberAction`, `revokeBubbleAccessAction`, plus helpers to list workspace members for picker flows |
| Operator UI          | `src/app/(dashboard)/app/[workspace_id]/invites/members-section.tsx` — loads members + bubble list + memberships; expandable rows; effective access labels                                                   |

**Assessment:** The **granular permissions dashboard** described in the standalone TDD is **largely implemented** inside **Members** (expand row, per-bubble grant/revoke). Enforcement remains **authoritative in Postgres** (RLS), with UI mirroring `permissions.ts`.

### 2.3 Tasks, programs, and “assigned” work

| Area            | Implementation                                                                      |
| --------------- | ----------------------------------------------------------------------------------- |
| Task assignee   | `tasks.assigned_to`                                                                 |
| Program linkage | `tasks.program_id` and metadata (see program-scoped workouts TDD)                   |
| RLS             | Task policies include **horizontal** access via `assigned_to` (see RBAC migrations) |

**Assessment:** **Assigning work to a specific member** is supported at the data model. **Deriving a strict “client sees only their assignments”** experience is a **product + UI + role composition** problem (e.g. `guest` + private bubbles + `bubble_members` + assignment filters), not a single toggle.

### 2.4 Chat / messaging

| Area          | Implementation                                                                              |
| ------------- | ------------------------------------------------------------------------------------------- |
| Message scope | `messages.bubble_id` — **channel/bubble-scoped** chat                                       |
| No native DM  | There is **no** first-class direct-message thread between two users independent of a bubble |

**Assessment:** “**Chat only between coach and client**” is **not** modeled as DM today. Achievable patterns include: **one private bubble per coach–client pair** (or per client), with membership narrowed via `bubble_members`, or a **future** DM/thread model (out of scope for V1 unless explicitly prioritized).

### 2.5 Billing and tiers

| Area                       | Implementation                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plans                      | `src/lib/stripe-plans.ts` — includes **`studio_pro`**, **`coach_pro`**, caps in copy (`maxMembers`), etc.                                                           |
| Workspace subscription row | `workspace_subscriptions` + `stripe_price_id` (resolved to plan key server-side in Stripe helpers)                                                                  |
| Feature gating             | `src/lib/subscription-permissions.ts` — **binary** for paid categories: `trialing`/`active` ⇒ full premium flags; else degraded. **No** per–plan-key feature matrix |

**Assessment:** **Studio Pro vs Coach Pro (vs Pro)** is **not** reflected in `resolveSubscriptionPermissions` today. Any **tier-specific** Member Manager capabilities require a **new entitlement layer** (see §7).

---

## 3. Gap analysis (requirements vs current system)

| Requirement                            | Current state                                                                           | Gap                                                                                                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner manages **all** members/clients  | Admin/owner roster + roles + remove                                                     | **Owner vs admin** scope is not differentiated for “Member Manager” — today **admins** have the same roster powers; product may want **owner-only** tools or branding |
| **Thousands** of members               | Single load: `listWorkspaceMembersAction` returns **full list** ordered by `created_at` | **No pagination, search, or virtualized list** at the API/UI layer; will not scale                                                                                    |
| Add/remove from **bubbles**            | Implemented via `MembersSection` + `addBubbleMemberAction` / `revokeBubbleAccessAction` | UX is **embedded in Invites → Members**, not a dedicated **Member Manager** route; **bulk** add/remove not modeled                                                    |
| Filter by **member** or **group**      | Profile search only informal (browser find); no cohort entity                           | **No** `member_groups`, tags, or program cohort dimension in DB                                                                                                       |
| **Coach Pro / Studio Pro** full tools  | Plans exist in Stripe catalog                                                           | **No** code-level entitlement distinguishing these plans for UI/features                                                                                              |
| Client sees **only assigned** content  | RBAC + assignment + private bubbles can approximate                                     | **No** unified “assignment-only mode” flag; Programs/Kanban/chat must **consistently** filter; **high UX/engineering coordination**                                   |
| Chat **only** between coach and member | Bubble-scoped messages                                                                  | **No DM**; need **private bubble** strategy or new messaging model                                                                                                    |

---

## 4. Goals (V1)

| ID  | Goal                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Provide a **dedicated Member Manager** entry point (route + nav) for **Studio Pro** and **Coach Pro**, without removing existing **People & invites** flows.                                                     |
| G2  | Support **large rosters**: **search**, **pagination** (cursor or offset), and stable sort (e.g. name, joined date, last activity if available).                                                                  |
| G3  | Preserve **single source of truth** for permission math: **`permissions.ts`** + existing RLS; server actions validate admin/owner.                                                                               |
| G4  | **Surface** bubble access management (reuse patterns from `MembersSection`) inside Member Manager — either **embed** shared components or **extract** a reusable `MemberAccessPanel`.                            |
| G5  | Introduce **minimal cohort filtering**: e.g. **tag** or **group** membership (see §6.1) OR **filter by program assignee / start window** using existing `tasks` data — pick **one** for V1 to avoid scope creep. |
| G6  | Add **entitlement checks** for `studio_pro` / `coach_pro` (and trial on those prices) so lower tiers see upsell or reduced UI — exact matrix product-owned (see §7).                                             |

---

## 5. Non-goals (V1)

- Native **DM** or message-level privacy outside bubble RLS.
- Full **audit log** of permission changes (optional later; noted in granular-permissions TDD).
- **Replacing** the entire Invites pipeline — invites and waiting room stay as today.
- **Cross–socialspace** member identity (single user across tenants) beyond existing auth.
- **Automated** “assignment-only mode” enforcement across every screen — V1 may **document** the target pattern and implement **Member Manager + one** client surface (e.g. bubble list) as reference.

---

## 6. Proposed design

### 6.1 Data model — V1 options for “groups”

**Option A — Lightweight tags (recommended for V1)**

- New table e.g. `workspace_member_tags` (`workspace_id`, `user_id`, `tag`, `created_at`) with unique `(workspace_id, user_id, tag)` or separate `tags` + `workspace_member_tag_memberships`.
- Pros: simple filters (“January cohort”), CSV export-friendly.
- Cons: no hierarchy; naming discipline required.

**Option B — Cohort = program start / program task**

- Derive cohort by querying **program** tasks with same `scheduled_on` / `created_at` window and `assigned_to` in a set.
- Pros: **no new table** if program data is reliable.
- Cons: fuzzy; expensive queries; poor UX if programs not used consistently.

**Recommendation:** **Option A** for V1 **if** product needs explicit “groups”; otherwise ship Member Manager with **search + pagination only** and add tags in V1.1.

### 6.2 APIs / server actions

| Capability            | Direction                                                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paginated member list | Add e.g. `listWorkspaceMembersPageAction({ workspaceId, query, cursor, limit, sort })` **or** extend existing action with optional params (prefer **new** action to avoid breaking callers). |
| Bubble access         | **Reuse** `listWorkspaceBubbleAccessAction`, `addBubbleMemberAction`, `revokeBubbleAccessAction`. Optionally add **batched** `setBubbleMembersForUserAction` later.                          |
| Tags                  | If Option A: `listTagsAction`, `setMemberTagsAction`, `filterMembersByTagAction` (or combine into list endpoint).                                                                            |

All actions: **`getUser()`** → **`requireWorkspaceAdmin`** (or stricter **owner-only** if product requires) → query → `revalidatePath` as needed.

### 6.3 UI / IA

- **Route:** e.g. `/app/[workspace_id]/members` (name TBD) rendering a **Member Manager** layout: toolbar (search, filters, tag filter), virtualized table, row actions (profile, role, **manage bubbles** sheet).
- **Reuse:** Extract presentational logic from `MembersSection` into shared components (`MemberRosterTable`, `BubbleAccessSheet`) to avoid duplication with Invites.
- **Entry points:** Settings rail, or **People** submenu: “Invites” vs “Member Manager” (copy: align with **socialspace** terminology).

### 6.4 Client “assignment-only” visibility (guidance)

V1 **documentation + partial implementation**:

- **Role:** prefer **`guest`** for strict clients; combine with **`bubble_members`** on **private** training/chat bubbles.
- **Tasks:** rely on **`assigned_to`** + bubble visibility; program-scoped rows follow [`technical-design-program-scoped-workouts-v1.md`](technical-design-program-scoped-workouts-v1.md).
- **Chat:** use a **dedicated private bubble** per relationship (or per client) until DM exists.

Engineering should add a short **“visibility checklist”** in this doc’s appendix when the first vertical slice ships.

---

## 7. Subscription and entitlements (Studio Pro / Coach Pro)

Today, [`resolveSubscriptionPermissions`](../src/lib/subscription-permissions.ts) does not accept **plan key**. V1 needs:

1. **Resolver** — Given `workspace_subscriptions.stripe_price_id` (or cached `plan_key` if added to DB), map to `StripePlanKey` via existing Stripe helpers in `src/lib/stripe.ts`.
2. **Feature flags** — e.g. `canUseMemberManager`, `canUseMemberTags`, `canBulkManageBubbles` with rules such as:
   - `studio_pro` / `coach_pro`: full V1 toolkit
   - `pro` / `studio`: read-only or limited member list, or upsell (product decision)
3. **UI** — Wrap Member Manager route in a gate component (similar pattern to `src/components/subscription/premium-gate.tsx`) but **plan-aware**.

**Open product decision:** Whether **trial** workspaces on Host/Pro prices get partial Member Manager or only after upgrade to Studio Pro/Coach Pro.

---

## 8. Security, privacy, and performance

- **RLS:** Continue to use **caller-scoped** Supabase clients; no service-role bypass for routine roster reads.
- **PII:** Admin roster already exposes **email** for support (`listWorkspaceMembersAction`); Member Manager inherits same rule; document in privacy copy.
- **Performance:** Paginated queries must use **indexes** on `(workspace_id, created_at)` and optionally `(workspace_id, user_id)` for lookups; avoid `IN` with huge bubble id lists without batching.
- **Realtime:** Optional later — invalidate roster on `workspace_members` / `bubble_members` changes via existing patterns or lightweight `revalidatePath` after mutations.

---

## 9. Phasing

| Phase  | Scope                                                                                                 |
| ------ | ----------------------------------------------------------------------------------------------------- |
| **M0** | Product confirms: owner-only vs admin; tag vs no-tag; cohort semantics                                |
| **M1** | New route + paginated search API + virtualized table; entitlement gate for `studio_pro` / `coach_pro` |
| **M2** | Extract shared bubble-access UI; optional **tags** table + filters                                    |
| **M3** | Bulk actions (selected rows → add to bubble); export CSV if not already covered elsewhere             |
| **M4** | Deeper integration with **assignment-only** client home (separate epic)                               |

---

## 10. Verification

- Admin and owner (per policy) see consistent data with **no** extra cross-tenant leakage.
- Pagination: requesting page 2 does not duplicate rows; search debounces correctly.
- After grant/revoke bubble access, RLS matches **effective** labels from `permissions.ts`.
- Non-entitled plans see **upsell** or **limited** UI per matrix — no silent access.

---

## 11. Open questions

1. Should **Member Manager** be **owner-only**, or remain **admin + owner** like current roster actions?
2. **Tags vs program-derived cohorts** for “started together”?
3. For **1:1 chat**, is **private bubble per client** acceptable for V1?
4. Exact **plan matrix**: which features on `pro` / `studio` vs `coach_pro` / `studio_pro`?
5. Do we persist **`plan_key`** on `workspace_subscriptions` to avoid Stripe price resolution on every request?

---

## 12. Appendix: file map (implementation anchors)

| Concern                    | Location                                                             |
| -------------------------- | -------------------------------------------------------------------- |
| Roster & roles             | `src/app/(dashboard)/app/[workspace_id]/invites/member-actions.ts`   |
| Bubble access actions      | `src/app/(dashboard)/app/[workspace_id]/bubble-actions.ts`           |
| Members UI                 | `src/app/(dashboard)/app/[workspace_id]/invites/members-section.tsx` |
| Permission math            | `src/lib/permissions.ts`                                             |
| Subscription flags (today) | `src/lib/subscription-permissions.ts`                                |
| Plan metadata              | `src/lib/stripe-plans.ts`                                            |
