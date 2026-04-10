# RBAC matrix (workspace + bubble) — v1

This document maps **workspace roles**, **bubble membership**, and **Postgres RLS** helpers to **UI permission flags** implemented in [`src/lib/permissions.ts`](../src/lib/permissions.ts). Enforcement lives in Supabase; UI flags only control visibility.

## Roles

| Layer                     | Values                              | Notes                                                                   |
| ------------------------- | ----------------------------------- | ----------------------------------------------------------------------- |
| Workspace                 | `owner`, `admin`, `member`, `guest` | `owner` is not assignable via normal invites (DB constraint).           |
| Bubble (`bubble_members`) | `editor`, `viewer`                  | Only meaningful when the user has a row for that bubble.                |
| Bubble metadata           | `bubbles.is_private`                | Hides the bubble from members without admin bypass or `bubble_members`. |

## RLS helpers (authoritative)

| Helper                              | Meaning (simplified)                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `is_workspace_admin(workspace_id)`  | Caller is `owner` or `admin` in that workspace.                                                 |
| `can_write_workspace(workspace_id)` | Caller is `owner`, `admin`, or `member`.                                                        |
| `can_view_bubble(bubble_id)`        | Admin/owner bypass; or member on non-private bubble; or any `bubble_members` row for this user. |
| `can_write_bubble(bubble_id)`       | Admin/owner bypass; or member on non-private; or `bubble_members.role = editor`.                |

## Resource policies (high level)

| Resource                | Rule                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `bubbles` INSERT        | `can_write_workspace` — creating a channel is workspace-level, not granted by bubble editor alone. |
| `bubbles` SELECT        | `can_view_bubble`                                                                                  |
| `tasks` write           | `can_write_bubble` (and `assigned_to` horizontal flow per migration).                              |
| `messages` INSERT       | `can_view_bubble` — **viewers may post**; task-write and message-write differ.                     |
| `bubble_members` INSERT | Workspace admin + target user must be a workspace member (see security migration).                 |

## UI flags (`resolvePermissions`)

| Flag                                               | Derived from               | Aligns with RLS                       |
| -------------------------------------------------- | -------------------------- | ------------------------------------- |
| `canCreateWorkspaceBubble`                         | `canWriteWorkspace(role)`  | `bubbles_insert`                      |
| `canWriteTasks`                                    | `canWriteBubble(...)`      | `can_write_bubble` for task mutations |
| `canPostMessages`                                  | `canViewBubble(...)`       | `messages_insert` (`can_view_bubble`) |
| `canView`                                          | same as `canPostMessages`  | `can_view_bubble`                     |
| `canWrite`                                         | alias of `canWriteTasks`   | legacy name                           |
| `isAdmin` / `canManageMembers` / `canManageBubble` | `canManageWorkspace(role)` | Admin/owner management surfaces       |

## Aggregate “All Bubbles” selection

When the UI uses the aggregate bubble id ([`ALL_BUBBLES_BUBBLE_ID`](../src/lib/all-bubbles.ts)), the dashboard does **not** load a `bubble_members` row and treats `is_private` as false for permission resolution. Task/chat UI therefore falls back to **workspace-level** bubble context until product defines cross-bubble aggregation rules.

## Server routes

| Surface                   | Admin check                                            |
| ------------------------- | ------------------------------------------------------ |
| Invites / member actions  | `owner` or `admin`                                     |
| Waiting room bulk approve | `owner` or `admin` (aligned with `is_workspace_admin`) |
| Domains API               | `owner` or `admin`                                     |
