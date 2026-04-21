# Workout Builder: selection mode + collapsed video + deck reorder

**Status:** Approved (implementation TBD).  
**Context:** Hybrid “Selection + Local DnD” for the Session Deck (visually “Workout Builder”): add cards from the Kanban board in a selection mode, collapse the live video to free space, reorder cards in the deck with **@dnd-kit**.

## Architecture snapshot

```mermaid
flowchart TB
  subgraph dash [DashboardShell]
    dock [DashboardLiveVideoDock]
    split [WorkspaceMainSplit]
    dock --> LiveSessionView
    split --> KanbanBoard
  end
  provider [WorkoutDeckSelectionContext]
  provider --> dock
  provider --> split
```

## Codebase facts

- **DnD:** `package.json` includes `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`. `KanbanBoard.tsx` already uses `DndContext` and `useSortable` for column cards.
- **Layout:** `DashboardLiveVideoDock` renders `LiveSessionView` above the main column; `KanbanBoard` is mounted from `dashboard-shell.tsx` (~1110) with `onOpenTask={openTaskModal}`.
- **Deck today:** `SessionDeckBuilder.tsx` holds `deck` in local `useState` only—state must be lifted for board integration.
- **Card type:** `TaskRow` from `@/types/database`; visual: `KanbanTaskCard` from `@/components/board/kanban-task-card.tsx`.

---

## 1. State management: `deck` + `isSelectingFromBoard`

**Location:** A **React Context** (e.g. `WorkoutDeckSelectionContext`) **provided in `DashboardShell`** so it wraps both the live-video dock and the workspace main area that contains `KanbanBoard`. Avoids deep prop drilling through `WorkspaceMainSplit`.

**Suggested context value**

| Piece                     | Role                              |
| ------------------------- | --------------------------------- |
| `deck: TaskRow[]`         | Ordered workout queue.            |
| `addTaskToDeck(task)`     | Append (dedupe by `id`).          |
| `reorderDeck` / `setDeck` | Support horizontal reorder.       |
| `isSelectingFromBoard`    | Selection mode flag.              |
| `enterSelectionMode()`    | Set true; triggers collapse (§2). |
| `exitSelectionMode()`     | Set false; restores video strip.  |

**Consumers:** `SessionDeckBuilder` (replaces local state), `LiveSessionView` or dock (collapse), and wiring for `KanbanBoard` (§3).

**Alternative:** `useState` only in `DashboardShell` + prop drilling—possible but heavier.

---

## 2. Layout shift: collapsing the video

**Constraint:** Dock uses `min-h-[70vh]` in `dashboard-live-video-dock.tsx`, which reserves vertical space.

**Steps**

1. **`DashboardLiveVideoDock`:** When `isSelectingFromBoard`, relax `min-h-[70vh]` to `min-h-0` (or a small `max-h-*` if a thin chrome strip remains).
2. **`LiveSessionView`:** Wrap the `VideoStageWrapper` row in a container with `transition-all duration-300 ease-in-out`. When selecting, apply `max-h-0 min-h-0 overflow-hidden` (optional `opacity-0`) so the main video collapses upward. Prefer explicit `max-h-[…]` → `max-h-0` or grid `1fr` → `0fr` for smooth animation.
3. Keep `SessionControls` + `SessionDeckBuilder` visible while selecting unless product says otherwise (default: keep deck row + “Done selecting”).
4. **`VideoStageWrapper`:** Optional `className` from parent for collapsed state.

---

## 3. Kanban click interception (selection mode)

**Entry:** `+ Add from Board` in `SessionDeckBuilder` calls `enterSelectionMode()`.

**Primary change site:** `KanbanBoard.tsx` (owns all column task lists).

- New optional props, e.g. `workoutSelectionMode?: boolean`, or consume context inside the board.
- Build `lookupTask(taskId: string): TaskRow | undefined` via `useMemo` over merged column task arrays.
- Wrap `onOpenTask` passed to `SortableTaskCard` / `KanbanTaskCard`:
  - If `workoutSelectionMode` and `lookupTask(taskId)` succeeds → `addTaskToDeck(task)` and **return** (no modal).
  - Else → existing `onOpenTask(taskId, opts)`.

**Note:** `KanbanTaskCard` invokes `onOpenTask` from multiple UI paths (title, quick actions). V1: treat any “open” intent while selecting as “add to deck”, or gate quick actions separately.

**Exit:** Floating **“Done selecting”** button (`fixed`, high `z-index`) calling `exitSelectionMode()`. Optional muted backdrop on the board (`bg-muted/30`).

**Wiring:** `dashboard-shell.tsx` passes selection props into `KanbanBoard` alongside `openTaskModal`.

---

## 4. Local drag-and-drop (deck reorder)

**Library:** Reuse `@dnd-kit`.

**Isolation:** Use a **separate `DndContext`** only around the horizontal deck strip in `SessionDeckBuilder`—do not nest inside Kanban’s `DndContext` (different subtrees; avoids sensor conflicts).

**Sketch**

- `DndContext` + `SortableContext` with `items={deck.map((t) => t.id)}`.
- `horizontalListSortingStrategy` from `@dnd-kit/sortable`.
- Each `w-64 shrink-0` wrapper: `useSortable({ id: task.id })` + `CSS.Transform` (same pattern as `SortableTaskCard` in `KanbanBoard.tsx`).
- `onDragEnd`: persist new order to context/state.
- Use a **drag handle** on each tile so card body clicks do not start a drag.

---

## 5. Titles: “Workout Builder” vs live session

**Rule of thumb:** **Workout Builder** in pre-huddle / builder emphasis; **Up Next** / **Session deck** (or equivalent) when the trainer is in the live session flow.

**Implementation**

- Derive `uiMode: 'builder' | 'live'` from `SessionState` (`globalStartedAt`, `phase`, etc.) or a shell prop.
- Extend `SessionHeader.tsx` (currently static “Live Session — The Huddle”) with title/subtitle props.
- Add a row label on `SessionDeckBuilder` per mode.

---

## 6. Files likely touched

| File                            | Change                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------- |
| New context module              | `WorkoutDeckSelectionContext` + provider + hook                              |
| `dashboard-shell.tsx`           | Provider; pass selection into `KanbanBoard`; optional **Done selecting** FAB |
| `dashboard-live-video-dock.tsx` | Dock height when selecting                                                   |
| `LiveSessionView.tsx`           | Collapsing video row driven by context                                       |
| `SessionDeckBuilder.tsx`        | Context, horizontal dnd-kit, titles, wire **Add from Board**                 |
| `KanbanBoard.tsx`               | `lookupTask` + wrapped `onOpenTask`                                          |
| `SessionHeader.tsx`             | Title variants (optional props)                                              |

---

## 7. Quality gate

- `npm run lint`
- Manual QA: **Add from Board** → video collapses → click card adds to deck (no modal) → reorder deck → **Done selecting** restores layout → normal click opens modal again.
