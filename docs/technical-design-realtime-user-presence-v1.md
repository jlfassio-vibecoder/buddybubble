# Technical design: Real-time user presence (multiplayer) — v1

## 1. Problem

As workspaces grow, owners and members need visibility into who is currently online and what they are focused on. Without real-time presence, two users may edit the same Kanban card or reply in the same chat thread without knowing another person is active there.

## 2. Goals

| Goal                                | Description                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Who’s online**                    | Show a **face pile** (overlapping avatars) in the workspace chrome so users see who is connected to the **same workspace**.       |
| **Stable per-user color**           | Assign a deterministic color per `user_id` (e.g. ring/badge) so a user’s highlight is recognizable across sessions and refreshes. |
| **Contextual presence**             | Reflect **focus** in the UI: which **bubble** (channel) and optionally which **task** (card/modal) a user is viewing.             |
| **No DB churn for ephemeral state** | Use **Supabase Realtime Presence** (in-memory channel state), not PostgreSQL tables, for online/focus data.                       |

## 3. Alignment with the current codebase (review of the prior draft)

The following corrections apply to an earlier TDD that assumed different routing and file layout:

| Original assumption                        | Actual in this repo                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/[workspace_id]/[channel_id]/page.tsx` | **Does not exist.** Workspace UI lives under `src/app/(dashboard)/app/[workspace_id]/` with a single dynamic segment `workspace_id`. `page.tsx` returns `null`; the shell is provided by `layout.tsx`.                                                                                                                                                                                             |
| “Channel” = URL segment                    | **Bubbles** are not route segments. The selected bubble is **client state** in `src/components/dashboard/dashboard-shell.tsx` (`selectedBubbleId`, synced to `src/store/workspaceStore.ts` as `activeBubble`).                                                                                                                                                                                     |
| Wire presence at “page”                    | Presence should be **scoped to `DashboardShell`** (and torn down when leaving the workspace layout), not to a non-existent channel page.                                                                                                                                                                                                                                                           |
| Header placement                           | **Desktop:** top bar is the `max-md:hidden` row with `buddyBubbleTitle`, `workspaceTitle`, and `DesktopViewSwitcher` (`src/components/layout/desktop-view-switcher.tsx`). **Mobile:** `MobileHeader` (`src/components/layout/MobileHeader.tsx`) is title-only; the face pile needs an explicit layout decision (extend `MobileHeader`, or place avatars beside the title / in the tab bar region). |
| Kanban / modal                             | `src/components/board/kanban-task-card.tsx` and `src/components/modals/TaskModal.tsx` are rendered from `DashboardShell` — good integration points for focus highlights and task-level presence.                                                                                                                                                                                                   |
| Zustand                                    | Existing pattern: `src/store/workspaceStore.ts`, `src/store/userProfileStore.ts`. A dedicated **`presenceStore`** fits this stack.                                                                                                                                                                                                                                                                 |

**Embed mode:** `DashboardShell` supports `?embed=true` (`searchParams`). Presence should either be **disabled in embed** or reduced to avoid leaking collaborator metadata in embedded views — product decision; document in implementation.

**Aggregate bubble:** `ALL_BUBBLES_BUBBLE_ID` (`src/lib/all-bubbles.ts`) is a valid selection; `focus_id` for `focus_type: 'bubble'` should use the real bubble id when a concrete bubble is selected, and a defined convention when “All Bubbles” is active (e.g. `null` + `focus_type: 'workspace'` only).

## 4. Data architecture (Supabase Realtime Presence)

### 4.1 Channel naming

Subscribe to **one Realtime channel per workspace**, e.g.:

`presence:workspace:{workspaceId}`

(Exact string is a project convention; keep it stable and documented. Private channels are an option if the product later requires stricter server-side authorization.)

### 4.2 Presence payload (client `track` state)

```ts
type UserPresence = {
  user_id: string;
  name: string;
  avatar_url: string | null;
  /** Stable display color for rings/badges (see §4.3). */
  color: string; // e.g. hex "#059669" or CSS color
  focus_type: 'workspace' | 'bubble' | 'task';
  /** Bubble id, task id, or null when only workspace-level presence matters. */
  focus_id: string | null;
};
```

Use Supabase client APIs: `channel.on('presence', { event: 'sync' | 'join' | 'leave' }, ...)`, and `channel.track(payload)` / updates when navigation or focus changes. **Do not** persist this payload in Postgres for the MVP.

### 4.3 Stable color assignment

Add a small utility (e.g. `src/lib/user-presence-colors.ts` — name TBD) that:

1. Takes `user_id` (string).
2. Maps deterministically to an index in a **fixed palette** of **hex values** (or CSS variables already in the theme).
3. Returns the same color after refresh for the same user.

Avoid relying on Tailwind **class name strings** alone for dynamic rings unless using safelisted classes or `arbitrary` values with the resolved hex. Prefer **hex + `style` or `ring-[color]`** with a known palette to keep bundle and JIT predictable.

### 4.4 Presence store (Zustand)

Add e.g. `src/store/presenceStore.ts` (new file) responsible for:

- Holding **derived** maps: `userId → UserPresence` (or `presenceState` from `sync`).
- Exposing **actions**: `connect(workspaceId)`, `disconnect()`, `updateFocus(partial)`.
- Internally: obtain `createClient()` from `@utils/supabase/client`, subscribe to the workspace presence channel, merge presence state on `sync`, and call `track()` when the local user’s payload changes.

**Lifecycle:** Initialize when `DashboardShell` mounts with a valid `workspaceId` and authenticated user; **unsubscribe and untrack** on workspace change or unmount to avoid orphaned subscriptions.

## 5. UI and behavior

### 5.1 Face pile — `ActiveUsersStack`

- New component under e.g. `src/components/presence/ActiveUsersStack.tsx`.
- **Data:** unique online users from presence state (exclude duplicate presence keys if any).
- **Desktop:** place in the top header row in `DashboardShell` (adjacent to or opposite `DesktopViewSwitcher`, respecting truncation).
- **Mobile:** extend header or add a compact row — avoid overlapping the bottom `MobileTabBar` (`src/components/layout/MobileTabBar.tsx`).

### 5.2 Tracking focus — `useUpdatePresence`

Custom hook (e.g. `src/hooks/use-update-presence.ts`) that:

1. Reads current user profile (name, avatar) from `useUserProfileStore` (`src/store/userProfileStore.ts`) or props.
2. Debounces or batches updates if needed (avoid flooding Realtime on rapid `selectedBubbleId` changes).
3. Sets `focus_type` / `focus_id`:
   - **Bubble selected:** `focus_type: 'bubble'`, `focus_id: <bubble uuid>` (not the aggregate pseudo-id unless product defines it).
   - **Task modal open:** `focus_type: 'task'`, `focus_id: <task id>`; on close, revert to current bubble (or `workspace` + `null` if no bubble).

**Wiring:** Call from `DashboardShell` when `selectedBubbleId` / task modal state changes, and/or from `TaskModal` if modal owns the task id in one place.

### 5.3 Highlighting — `PresenceRing` / store selectors

- **Kanban:** In `KanbanTaskCard`, optionally wrap the card or pass a className when **another** user’s presence has `focus_type === 'task'` and `focus_id === task.id`. Show ring + small label (name pill) per original spec; ensure **z-index** does not break drag-and-drop (`@dnd-kit` usage in parent).
- **Sidebar:** In `BubbleSidebar`, highlight bubble row when `focus_type === 'bubble'` and `focus_id === bubble.id`.
- **Task modal:** Optional border or header chip indicating others viewing the same task (same `focus_id`).

**Privacy:** Only show names/avatars for users present in the **same workspace channel**; do not expose emails in the presence payload unless already public in-app.

## 6. Implementation phases (revised for this repo)

| Phase                           | Scope                                                                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — Colors + store**          | `user_id` → color utility; `presenceStore` + Realtime subscribe/track/disconnect; unit tests for hashing only if non-trivial.                                              |
| **2 — Shell + face pile**       | Mount presence connection in `DashboardShell`; add `ActiveUsersStack`; implement `useUpdatePresence` for workspace + bubble selection from existing state (no new routes). |
| **3 — Task focus + highlights** | Tie task modal open state + `taskId` to presence; update `KanbanTaskCard` / `BubbleSidebar` for rings and badges; manual QA with two browsers.                             |
| **4 — Polish**                  | Mobile layout for face pile; embed mode behavior; optional debouncing; documentation updates.                                                                              |

## 7. Non-goals (v1)

- Cursor positions or typing indicators in chat.
- Historical “who viewed” analytics in the database.
- Presence across **multiple workspaces** in one browser tab (only one workspace shell active per route).

## 8. Verification

- Two authenticated users in the same workspace see each other in the face pile within a few seconds.
- Changing bubble selection updates peer highlights on the sidebar.
- Opening the same task shows task-level presence on both clients; closing the modal clears task focus.
- Leaving the workspace (navigate away) removes the user from peers’ presence state (or within Realtime TTL).

## 9. References

- [Supabase: Realtime Presence](https://supabase.com/docs/guides/realtime/presence) — `track`, `presence` events.
- Existing workspace shell: `src/components/dashboard/dashboard-shell.tsx`.
- RBAC and workspace membership: `docs/rbac-matrix-v1.md` (presence is orthogonal to RLS but should respect who can access the workspace UI).
