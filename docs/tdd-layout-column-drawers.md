# Technical design: collapsible layout columns (“drawers”)

## 1. Problem

The dashboard uses a **multi-column shell**: **Workspace rail** (BuddyBubble switcher + create + profile), **bubble sidebar** (channels), and **main split** (chat + board). On smaller viewports or when users want focus on the board or chat, fixed-width columns consume horizontal space.

We need each column to **collapse toward the left edge** into a **narrow strip** that matches the product reference: **vertical label** (e.g. “Workspace”), **chevron** to expand, subtle **right border**, dark background.

## 2. Goals

1. **Workspace rail (phase 1)**
   - **Expanded**: current behavior (72px rail: workspace icons, create, profile).
   - **Collapsed**: minimal strip (`w-8` / 32px via `COLLAPSED_COLUMN_WIDTH_CLASS`) with **uppercase vertical label “Workspace”** (reading direction aligned with the SESSION reference: bottom-to-top) and **`ChevronRight`** beside the label to suggest expanding the panel to the right.
   - **Persistence**: remember open/closed per **workspace** (same idea as chat split in `WorkspaceMainSplit`).

2. **Bubble sidebar (phase 2)**
   - **Expanded**: existing `w-56` sidebar (header, new bubble form, list).
   - **Collapsed**: same strip pattern as the workspace rail (**chevron above** vertical **“Bubbles”** label, shared layout so columns **line up**).
   - **Persistence**: `buddybubble.bubbleSidebarCollapsed.{workspaceId}`.
   - **Non-goal**: resizable columns beyond chat/Kanban split; binary expanded/collapsed only.

## 3. Non-goals

- Collapsing from the **right** (e.g. chat panel already has its own collapse via `WorkspaceMainSplit`; reuse patterns but do not redesign that split in phase 1).
- **Server-side** or cross-device sync of layout preferences (local-only is sufficient).
- **Animations** beyond a short width transition (optional polish).

## 4. UX and accessibility

| Concern         | Approach                                                                                                                                                                                                                                                                                                               |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discoverability | **Workspace rail**: collapse (chevron left) in the **footer** above create/profile. **Bubble sidebar**: collapse in the **header** row (chevron left before the “Bubbles” title).                                                                                                                                      |
| Collapsed strip | Shared **`CollapsedColumnStrip`**: **`ChevronRight`** above the vertical label in one **centered column**, **bottom-anchored** within each strip (`justify-end`) so stacked segments (triple stack) align along the bottom of each flex slice. Entire strip is one expand **`<button>`** with `aria-expanded="false"`. |
| Keyboard        | Buttons are focusable; no new global shortcuts in v1.                                                                                                                                                                                                                                                                  |
| Label           | Visible text **Workspace** (styled uppercase to match reference density).                                                                                                                                                                                                                                              |

## 5. Persistence

| Column          | localStorage key                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| Workspace rail  | `buddybubble.workspaceRailCollapsed.{workspaceId}`                                                              |
| Bubble sidebar  | `buddybubble.bubbleSidebarCollapsed.{workspaceId}`                                                              |
| Messages (chat) | `buddybubble.chatCollapsed.{workspaceId}` — owned by **`dashboard-shell`** with `WorkspaceMainSplit` controlled |
| Kanban (board)  | `buddybubble.kanbanCollapsed.{workspaceId}` — same shell                                                        |

**Invariant:** Messages and Kanban cannot both be collapsed to strips at once (no empty main stage). Collapsing one **opens** the other via `setChatCollapsed` / `setKanbanCollapsed` in the shell. Hydration clears impossible `chat+kanban` saved state by clearing Kanban collapse.

**Triple stack (rails collapsed):** Top slot shows **Messages** (black) when chat is collapsed, or **Kanban** (white) when the board is collapsed—never both. The main split omits the duplicate **Messages** strip when it is shown in the stack (`omitCollapsedMessagesStrip`); **Kanban** is never shown as a strip in the main split.

**Values**: `'1'` = collapsed, `'0'` or missing = expanded. **Hydration**: read in `useEffect` on mount; default expanded until hydrated (same pattern as `workspace-main-split.tsx`).

## 6. Implementation map

| Piece               | Location                                           | Notes                                                                                                                                                                                                                                                                                                                      |
| ------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared collapsed UI | `src/components/layout/collapsed-column-strip.tsx` | `CollapsedColumnStrip`, `COLLAPSED_COLUMN_WIDTH_CLASS` (`w-8`) for aligned strips.                                                                                                                                                                                                                                         |
| Workspace rail UI   | `src/components/layout/WorkspaceRail.tsx`          | Uses strip variant `zinc`.                                                                                                                                                                                                                                                                                                 |
| Bubble sidebar      | `src/components/dashboard/bubble-sidebar.tsx`      | Uses strip variant `card`.                                                                                                                                                                                                                                                                                                 |
| Shell wiring        | `src/components/dashboard/dashboard-shell.tsx`     | Owns rail, bubble, and **chat** collapsed state + `localStorage`. **Two** rails collapsed: **Bubbles** (white) / **Workspace** (dark), equal height. **All three** collapsed: **Messages** (black, **top**) / **Bubbles** / **Workspace**, each **`flex-1`** (~⅓ height).                                                  |
| Messages rail       | `workspace-main-split.tsx`                         | When chat is collapsed (and not duplicated in the shell stack), shows the black **Messages** strip beside the board. **Kanban** is never shown as a strip in this split: when Kanban is collapsed, only Messages fills the main area; opening Kanban again is done by **collapsing Messages** (shell setters swap panels). |
| Prior art           | `workspace-main-split.tsx`                         | Chat **width** still persisted here; collapse flags **controlled** from the shell.                                                                                                                                                                                                                                         |

## 7. Later work

- Optional **`lib/layout-storage.ts`** if a third column repeats the same hydrate/persist boilerplate.
- Additional left columns reuse **`CollapsedColumnStrip`** and `COLLAPSED_COLUMN_WIDTH_CLASS`.

## 8. Testing notes

- Toggle collapse, refresh: state should persist for that workspace.
- Switch workspace via rail (when expanded): each workspace retains its own **rail** flag; bubble sidebar has its own flag per workspace too.
- With rail collapsed, **profile** and **create BuddyBubble** are only reachable after expanding the rail. With the bubble sidebar collapsed, bubble list and add form are hidden until expanded.
