# Technical design: restore Kanban board & task card UI

This document describes where task/Kanban UI lives in the BuddyBubble codebase today, how it differs from the reference “original app” UI (see product screenshots), and a phased plan to restore the card and board chrome without rewriting data flows unnecessarily.

## 1. Reference UI (target)

From the reference screenshot, the **board chrome** includes:

- Title **“Kanban Board”** (not a generic “Tasks” label).
- **Priority filters**: segmented control — All, High, Medium, Low (one active, purple accent).
- **View density**: Summary | Full | Detailed (icons + labels; controls how much each card shows).
- **Columns**: human-readable titles (e.g. Todo, In Progress), **count badges** (warm/orange pill), **⋯** menu per column.
- **Column body**: when empty, a **dashed “+ Add New”** affordance; populated area shows **task cards** (not visible in the empty reference — cards are the main visual gap vs current minimal shadcn cards).

The **sidebar + chat** are out of scope for this TDD except where shared tokens (colors, radii) should stay consistent.

## 2. Current implementation map

| Area                            | Location                                                 | Role                                                                                                                      |
| ------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Board shell + modal wiring      | `src/components/dashboard/dashboard-shell.tsx`           | Renders `KanbanBoard` inside `WorkspaceMainSplit`, opens `TaskModal` for create/edit.                                     |
| Resizable split (chat vs board) | `src/components/dashboard/workspace-main-split.tsx`      | Layout only; no card styling.                                                                                             |
| **Kanban data + DnD + cards**   | `src/components/board/KanbanBoard.tsx`                   | Single file: column grid, `@dnd-kit` drag/drop, `SortableTaskCard`, `DragOverlay` preview.                                |
| Column definitions              | `src/hooks/use-board-columns.ts` + `board_columns` table | Dynamic slugs/labels per workspace.                                                                                       |
| Task row type                   | `src/types/database.ts` → `TaskRow`                      | `title`, `description`, `status`, `position`, `assigned_to`, JSON: `subtasks`, `comments`, `activity_log`, `attachments`. |
| Full task editor                | `src/components/modals/TaskModal.tsx`                    | Rich editor; not used for board card density.                                                                             |
| Generic card primitives         | `src/components/ui/card.tsx`                             | Shared `Card`, `CardHeader`, `CardContent`, etc. Current board uses basic `Card` + `CardContent` only.                    |

### 2.1 What `KanbanBoard` renders today

- **Header**: “Tasks” + short helper copy + optional “Full editor” button — **does not match** “Kanban Board” + priority + view toggles.
- **Quick add**: top **form** (`Input` + Add) when `canWrite` — reference shows **per-column “+ Add New”** instead (or in addition).
- **Columns**: `KanbanColumn` uses a simple bordered column, `h3` label (uppercase, muted), scrollable list — **no** count badge, **no** column menu.
- **Cards** (`SortableTaskCard`): `Card` with title, optional description (`line-clamp-3`), “Open details” link, optional **bubble** `<select>` for moving across bubbles. **No** priority chip, **no** assignee avatar, **no** density variants.

### 2.2 Data gaps vs reference UI

- **Priority (High / Medium / Low)** is **not** modeled in `public.tasks` or types. Filtering “All / High / …” cannot be faithful without either:
  - a new column (e.g. `priority text` / enum with check constraint), or
  - a convention stored in JSON (worse for filtering/indexing), or
  - deferring priority UI until schema is agreed (UI-only placeholder).

- **View modes** (Summary / Full / Detailed) are **purely presentational**; they can be implemented as React state + conditional rendering on existing `TaskRow` fields (and later priority when available).

## 3. Design goals

1. **Visual parity** with the reference for board header, column headers, empty states, and card silhouette (spacing, typography, badges, optional avatar slot).
2. **Preserve behavior**: keep `@dnd-kit` semantics, Supabase updates, and bubble move dropdown unless product explicitly removes them (may be tucked into ⋯ menu on the card in “Full” density).
3. **Separation of concerns**: extract presentational components from `KanbanBoard.tsx` so styling iterations do not destabilize drag logic.
4. **Incremental delivery**: ship column chrome + card shell first; add priority when schema exists.

## 4. Proposed architecture

### 4.1 New or extracted components (suggested paths)

| Component            | Responsibility                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KanbanBoardHeader`  | Title, priority filter, view mode toggle; emits `priorityFilter` + `cardDensity` (or uses context).                                                   |
| `KanbanColumnHeader` | Column title, count badge, optional DropdownMenu for column actions (future: collapse, sort).                                                         |
| `KanbanColumnEmpty`  | Dashed “+ Add New” — `onClick` focuses quick-add or opens `TaskModal` for that column’s default status.                                               |
| `KanbanTaskCard`     | Single presentational card; props: `task`, `density`, `canWrite`, drag handle props from `useSortable`, optional `onOpenTask`, bubble move (or menu). |

Keep **`KanbanBoard.tsx`** as the orchestrator: loading, subscriptions, DnD context, Supabase writes. Move markup only.

### 4.2 State model (client-only)

```ts
type PriorityFilter = 'all' | 'high' | 'medium' | 'low';
type CardDensity = 'summary' | 'full' | 'detailed';
```

- Store in `useState` inside `KanbanBoard` (or a small `useKanbanBoardUi()` hook colocated in the same folder).
- **Filter pipeline**: after `groupTasksToColumns`, flatten or filter each column’s tasks where `taskMatchesPriority(task, filter)`. Until DB supports priority, `taskMatchesPriority` returns `true` for non-`all` only if using a placeholder (e.g. all tasks “medium”) — **document as temporary** or hide priority bar until migration lands.

### 4.3 Card density behavior (suggested mapping)

| Density      | Show                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **summary**  | Title only (single line), maybe small status dot or priority chip when available.                                                                             |
| **full**     | Title + clipped description + primary actions (open, bubble control or overflow menu).                                                                        |
| **detailed** | Above + 1–2 lines metadata: assignee avatar if `assigned_to` resolvable to profile; subtask progress snippet from `subtasks` JSON length if cheap to compute. |

Drag handle: keep on the outer sortable wrapper; avoid putting interactive controls on the same node without `stopPropagation` (already done for select and “Open details”).

### 4.4 Styling

- Reuse existing Tailwind + `cn()` patterns; align **purple** primary with `Button`/`bg-primary` tokens already in the app.
- **Orange/amber** for count badges: use semantic classes e.g. `bg-amber-100 text-amber-900` (or design-token equivalents if defined in `globals.css`).
- Cards: rounded corners, subtle `shadow-sm` / `ring-1 ring-border`, optional left border accent by priority when data exists.

### 4.5 `DragOverlay`

Mirror the same `KanbanTaskCard` at **`full`** density (or match active card density) so the lifted card matches the list.

## 5. Backend / schema (priority)

**Prerequisite for real priority filters**

1. Add `priority` to `tasks` (e.g. `text` check in (`'low'`,`'medium'`,`'high'`) or Postgres enum), default `'medium'`.
2. Regenerate / update `src/types/database.ts`.
3. Update `TaskModal` to edit priority; KanbanBoard filter reads `task.priority`.
4. Optional: index `(bubble_id, priority)` if lists grow large.

Until then, either **hide** the priority control or show it disabled with tooltip “Coming soon”.

## 6. Phased rollout

| Phase  | Scope                                                                                                                                                                | Risk                                                       |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **P0** | Extract `KanbanTaskCard` + column header + empty state; restyle to match reference silhouette; board title “Kanban Board”; wire “+ Add New” to existing create flow. | Low — no schema change.                                    |
| **P1** | View density toggle (Summary / Full / Detailed) wired to card props.                                                                                                 | Low.                                                       |
| **P2** | Priority UI + migration + filter.                                                                                                                                    | Medium — needs migration review & RLS unchanged for tasks. |
| **P3** | Column ⋯ menus (per-column actions), polish animations.                                                                                                              | Low–medium.                                                |

## 7. Testing & QA

- **Manual**: drag within column, across columns, with card density toggled; open task modal from card; bubble move still works.
- **Regression**: `loadTasks` + realtime subscription paths in `KanbanBoard` unchanged.
- **Optional unit tests**: pure helpers `taskMatchesPriority`, `densityProps` if they grow logic.

## 8. Out of scope (unless product requests)

- Changing `WorkspaceMainSplit` or chat layout.
- Replacing `@dnd-kit` with another DnD library.
- Full redesign of `TaskModal` (cards should defer to modal for heavy editing).

## 9. Summary

The **only** in-repo implementation of Kanban **cards** today is **`SortableTaskCard`** in `src/components/board/KanbanBoard.tsx`, using generic `ui/card` primitives. The reference UI adds **board-level controls** (priority, density), **richer column chrome**, and **richer card visuals** — best delivered by **extracting presentational components** and, for priority, a **small schema addition** followed by filter logic in the existing task loader pipeline.
