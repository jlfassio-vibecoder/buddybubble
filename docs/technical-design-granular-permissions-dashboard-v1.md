# Technical design: Granular permissions dashboard (members & bubble access) — v1

## 1. Problem

RBAC v1 introduced **workspace roles** (`owner` / `admin` / `member` / `guest`), **per-bubble membership** (`bubble_members`: `editor` / `viewer`), and **`bubbles.is_private`**. Enforcement lives in Postgres RLS and is mirrored in `src/lib/permissions.ts` for UI.

Today, **owners and admins** can open **People & invites → Members** and change **workspace-level** roles (`MembersSection` + `member-actions.ts`). That answers “who is in the workspace?” but not **“what can each person do in each bubble?”** — the granular layer that matters for **guests** and **private bubbles**.

**Owners** (and admins) need a single place to **see and reason about** effective access: workspace role **plus** explicit bubble grants, without cross-checking multiple screens or guessing from Kanban behavior.

## 2. Goals

| Goal                       | Description                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unified visibility**     | One dashboard surfaces **workspace role** and **bubble-level** grants (`bubble_members`) in a coherent layout.                                            |
| **Owner parity**           | **Owners** can view and manage the same management surfaces as **admins**, with **owner-only** actions clearly scoped (e.g. transfer ownership — see §6). |
| **Private bubble clarity** | **Private** bubbles are visually distinct; show who has explicit access vs who relies on workspace-wide rules.                                            |
| **Actionable**             | Support **grant / change / revoke** `bubble_members` rows where RLS allows (admins/owners per `bubble_members_*` policies).                               |
| **RLS-aligned**            | All reads/writes go through existing Supabase policies; **no** bypass of security definer except existing server-action patterns.                         |

## 3. Non-goals (v1)

- **Custom permission sets** beyond `editor` / `viewer` (future if product expands).
- **Audit log** of permission changes (optional follow-up).
- **Invitations pipeline redesign** — invite creation stays in **Create invites**; this dashboard focuses on **existing members**.
- **Storefront / public** visibility rules (orthogonal workspace product).

## 4. Current codebase (anchor points)

| Area                                 | Location / notes                                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Workspace member list & role changes | `src/app/(dashboard)/app/[workspace_id]/invites/members-section.tsx`, `member-actions.ts`                                  |
| People & invites shell               | `src/app/(dashboard)/app/[workspace_id]/invites/invites-client.tsx`, modal: `src/components/modals/PeopleInvitesModal.tsx` |
| Permission math (UI)                 | `src/lib/permissions.ts` — `canViewBubble`, `canWriteBubble`, `usePermissions` hook                                        |
| Schema & RLS                         | `supabase/migrations/20260427100000_rbac_granular_permissions.sql`; matrix: `docs/rbac-matrix-v1.md`                       |
| Bubbles list (names, `is_private`)   | Loaded in `DashboardShell` / `BubbleSidebar`; reuse for labels in the dashboard                                            |

**Server actions today:** `listWorkspaceMembersAction` requires **admin or owner** — owners already pass. The gap is **no aggregated API** for “all `bubble_members` in this workspace” or per-user effective access.

## 5. UX concept: “Permissions” dashboard

### 5.1 Entry points

- **Primary:** **People & invites → Members** tab evolves into **Members & access** (copy TBD): same route/modal entry, expanded content below or beside the existing table.
- **Optional shortcut (later):** Workspace rail / settings gear → “Manage access” deep-link to the same tab (`?tab=members` full page; embedded modal opens on **Members** segment).

### 5.2 Layout options (pick one for v1)

**Option A — Master table + row expansion (recommended for v1)**

- Keep the **existing member table** (name, workspace role, actions).
- Add column **“Bubble access”** with a summary, e.g. `3 private · 1 editor` or **“Default (member)”** when no `bubble_members` rows.
- **Expand row** → panel listing **all bubbles** in the workspace with effective **view/write** (derived from `permissions.ts` rules) and explicit **editor/viewer** badge where `bubble_members` exists.
- Row actions: **“Adjust bubble access”** opens a sheet: checklist or table of bubbles with role dropdown (`None` = revoke row if allowed, `Viewer`, `Editor`).

**Option B — Two-level tabs inside Members**

- **Tab “Workspace roles”** — current table only.
- **Tab “Bubble access”** — matrix **users × bubbles** (dense; best for small teams only) or virtualized table.

**Option C — Bubble-centric**

- Second top-level segment **“Bubbles”** next to Members / Invites: list bubbles, drill into members per bubble. Heavier IA change; defer unless product prefers ops-by-channel.

**Recommendation:** **Option A** minimizes navigation churn and builds on `MembersSection`.

### 5.3 Copy & education

Short inline help (one paragraph + link to `rbac-matrix-v1.md` or in-app tooltip):

- **Member** — default access to **non-private** bubbles; private bubbles require **explicit** grant.
- **Guest** — no default bubble access; only `bubble_members` (and assignments elsewhere if any).
- **Owner / Admin** — management paths; effective write in all bubbles per RLS.

## 6. Data & API design

### 6.1 Queries (conceptual)

**Workspace members** — existing `listWorkspaceMembersAction`.

**Bubbles in workspace** — `select id, name, is_private from bubbles where workspace_id = ? order by name`.

**Bubble members for workspace** — single query pattern:

```sql
select bm.bubble_id, bm.user_id, bm.role
from bubble_members bm
inner join bubbles b on b.id = bm.bubble_id
where b.workspace_id = :workspaceId;
```

Optional: include **user profile** via join or batch by `user_id` if the UI needs avatars in the expanded panel.

**Effective capability** — computed **on the client** (or server for SSR) using existing pure functions:

- Inputs per row: `workspaceRole`, `bubble.is_private`, `bubble_members.role | null`.
- Outputs: `canView`, `canWrite` (and labels “Implicit (member)”, “Explicit editor”, etc.).

Do **not** duplicate RLS logic in SQL for v1; keep **one** source of truth in `permissions.ts` for labels.

### 6.2 Server actions (new / extended)

| Action                                                              | Purpose                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------ |
| `listWorkspaceBubbleAccessAction(workspaceId)`                      | Returns `{ bubbles, memberships[] }` for admins/owners only. |
| `upsertBubbleMemberAction({ workspaceId, bubbleId, userId, role })` | Insert or update `bubble_members` (`editor` \| `viewer`).    |
| `removeBubbleMemberAction({ workspaceId, bubbleId, userId })`       | Delete row; verify caller is admin/owner via existing RLS.   |

Each action:

1. `getUser()`; 2. `getCallerRole` — require **admin or owner**; 3. optional **owner-only** guards for destructive workspace actions (already in `updateMemberRoleAction` patterns); 4. perform mutation; 5. `revalidatePath` for invites/members as today.

**Rate limiting / batching:** For large workspaces, lazy-load expansion: fetch **per-user** bubble access only when row expands (second action `listBubbleAccessForUserAction`).

### 6.3 RLS

Existing policies on `bubble_members` already restrict **write** to workspace admins (including owners via `is_workspace_admin`). **Select:** users see **own** rows; admins see **all** in workspace. The dashboard’s aggregated query runs **as the caller** — must confirm a single query for “all bubble_members in workspace” is allowed for admins.

If the current `bubble_members_select` policy only scopes by **per-row** bubble workspace lookup, a join `bubble_members` → `bubbles` → `workspace_id` should still succeed for admins. **Verify in implementation** with a direct Supabase query; add a **narrow migration** only if a gap is found (out of scope for this doc unless audit fails).

## 7. Owner-specific behavior

| Capability                                   | Owner                                            | Admin                        |
| -------------------------------------------- | ------------------------------------------------ | ---------------------------- |
| View member + bubble access dashboard        | Yes                                              | Yes                          |
| Change workspace roles (incl. promote admin) | Yes                                              | Yes (except owner promotion) |
| Promote another user to **owner**            | Yes (existing rules in `updateMemberRoleAction`) | No                           |
| Grant/revoke `bubble_members`                | Yes                                              | Yes                          |

Ensure **UI** disables owner-only selects for admins consistently with `member-actions.ts`.

## 8. Implementation phases

| Phase               | Scope                                                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — Read model**  | `listWorkspaceBubbleAccessAction` (+ optional per-user lazy fetch); expand row UI with **read-only** effective access labels; no new mutations beyond existing member role. |
| **2 — Write model** | `upsertBubbleMemberAction` / `removeBubbleMemberAction`; sheet to set **viewer/editor/none** per user per bubble; optimistic refresh + error toast.                         |
| **3 — Polish**      | Search/filter members; loading skeletons; empty states (“No explicit grants — member default applies”); mobile layout for expanded panel.                                   |
| **4 — QA**          | Matrix testing: owner, admin, member, guest × private/public bubbles; confirm RLS rejects unauthorized mutations.                                                           |

## 9. Verification

- Owner and admin both see the **same** dashboard data for members and bubble grants.
- Guest user with `bubble_members` **viewer** shows **View** only for that bubble; **editor** shows **Write**.
- Private bubble without a `bubble_members` row for a **member** shows **no access** (or read-only per product interpretation of `canViewBubble` — align labels with `permissions.ts`).
- Revoking the last explicit grant for a guest removes bubble visibility as expected.
- No extra data exposed to non-admin workspace members (actions remain forbidden).

## 10. Open questions

1. **Matrix size:** At what team + bubble count do we **require** search/virtualization (Phase 3)?
2. **Guests and “All Bubbles” aggregate UI:** Does aggregate messaging need a disclaimer when workspace role alone does not grant bubble list visibility?
3. **Billing / owner:** Should **owner** be visually pinned at top of the table always?

## 11. References

- `docs/rbac-matrix-v1.md`
- `supabase/migrations/20260427100000_rbac_granular_permissions.sql`
- `src/lib/permissions.ts`
