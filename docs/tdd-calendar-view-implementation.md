# Technical Design: Calendar View (Task Chronology)

## 1. Problem

BuddyBubble relies on a Kanban board to organize actionable items. While excellent for pipeline management (status), it lacks a spatial, chronological view (time). For use cases like "Kids & Family" (sports practices) or "Class Cohort" (exam schedules), users need to see their pipeline laid out chronologically.

Instead of introducing a complex, disconnected "Events" system, the Calendar View will act strictly as an alternative layout for existing Kanban Tasks. It provides improved cognitive organization post-planning and scheduling without introducing new data models.

## 2. Goals

1. **One Entity, Two Views:** The Calendar does not invent new data types; it queries the existing `tasks` table and lays items out in time using **`scheduled_on`** (calendar day, `YYYY-MM-DD` in the workspace’s `calendar_timezone`) and optional **`scheduled_time`** (local time on that day; `null` means all-day). This matches what `TaskModal` and `KanbanBoard` already persist.
2. **Component Reuse:** The Calendar should render the same **`KanbanTaskCard`** (`src/components/board/kanban-task-card.tsx`) the board already uses, so Theme Engine tokens and card behavior stay consistent.
3. **Multi-Rail Architecture Integration:** The calendar lives as a **main-stage column** between **Messages** and **Kanban** (`Workspace` → `Bubbles` → `Messages` → **Calendar** → `Kanban`). **Phase 1 (done):** `CalendarRail` is wired in `workspace-main-split.tsx` with collapse state in `dashboard-shell.tsx`; left rails (**WorkspaceRail**, **BubbleSidebar**) are unchanged. Further polish (resize between Calendar/Kanban, full “focused” behavior) is later work—see **`docs/tdd-layout-column-drawers.md`** for collapse persistence patterns.
4. **Fluid Layout States:** Support a thin collapsed strip, a side-by-side split view (Calendar + Kanban), and a full-screen view (when other panels are collapsed).
5. **Interactive UI:** Support drag-and-drop to reschedule dates, including dragging tasks directly from an open Kanban rail onto the adjacent Calendar rail.
6. **Clutter Management (Archive):** Allow users to permanently "Archive" and "Recover" tasks to manage clutter across all views, while keeping completed (but unarchived) tasks visible for context.

### Non-goals (v1)

- Google Calendar / Outlook two-way sync (push this to v2).
- Complex recurring rules (e.g., "Every 3rd Thursday").
- A separate `events` database table.

### Codebase snapshot (for implementers)

- **Task scheduling columns already exist:** `scheduled_on`, `scheduled_time` (see migrations under `supabase/migrations/` such as `*tasks_scheduled*`, and `TaskRow` in `src/types/database.ts`). Do **not** introduce `due_date` unless product explicitly renames the domain; the codebase speaks “scheduled”.
- **Workspace “today” and chips:** `src/lib/workspace-calendar.ts` (`getCalendarDateInTimeZone`, `scheduledOnRelativeToWorkspaceToday`) — reuse for week/month highlighting and parity with the board.
- **Task scope matches Kanban:** `tasks` rows are keyed by **`bubble_id`**, not `workspace_id`. Loading should mirror `KanbanBoard` (`src/components/board/KanbanBoard.tsx`): active bubble vs “All bubbles” via `ALL_BUBBLES_BUBBLE_ID` and `.in('bubble_id', bubbleIds)`.
- **Drag-and-drop:** Kanban already uses **`@dnd-kit`**; cross-rail calendar drops will likely require a **shared `DndContext`** (or equivalent) scoped in `dashboard-shell.tsx` with collision/drop targets on calendar day cells—not a second isolated DnD island.
- **`date-fns`:** Already a dependency (`package.json`); safe to use for calendar grid math (cards already use it for date formatting).
- **`archived_at`:** **Shipped in Phase 1:** migration `supabase/migrations/20260423120000_tasks_archived_at.sql`, `TaskRow.archived_at` in `src/types/database.ts`, and active-list queries use **`.is('archived_at', null)`** where appropriate (`KanbanBoard`, chat task picker, scheduled-tasks cron). UI to set/recover archived tasks is **not** done yet (see §6).

## 3. Data Model (Zero New Tables)

We will **not** create a new `events` table. The Calendar View relies entirely on the existing `tasks` schema, with one minor addition for state management.

### 3.1 Schema Update: Archiving

**Status: implemented.** `public.tasks.archived_at` is a nullable `timestamptz` (migration **`20260423120000_tasks_archived_at.sql`**). It soft-hides tasks from active Kanban/chat lists until a recover/archive UI exists.

### 3.2 The Read Strategy

The Calendar needs tasks whose **`scheduled_on`** falls in the visible range, with the **same bubble scope** as the board.

- **Query (conceptual):** From `public.tasks`, filter `bubble_id` exactly as `KanbanBoard.loadTasks` does (single bubble or all bubbles in the workspace), then `scheduled_on` within the view’s min/max calendar dates, and **`archived_at IS NULL`** (Supabase: `.is('archived_at', null)`). Optionally order by `scheduled_time` nulls last within a day for the week ribbon.
- **Null dates:** Tasks with **`scheduled_on IS NULL`** do not appear on the calendar (they stay on Kanban only), consistent with current scheduling UX.

_Optional agenda detail:_ **`scheduled_time`** already supports a specific time on `scheduled_on`; the 7-day ribbon can show it using the same helpers as the card (`src/lib/task-scheduled-time.ts`). No extra `start_time` / `end_time` columns are required for v1 unless we later add true intervals.

## 4. UI / Architecture

### 4.1 Navigation & Placement (The 4th Rail)

The calendar column sits between **Messages** (`ChatArea`) and **Kanban** (`KanbanBoard`) inside **`WorkspaceMainSplit`**. **`CalendarRail`** (`src/components/dashboard/calendar-rail.tsx`) is the Phase 1 shell: collapsed strip (Lucide `Calendar` + label, `w-8`) or expanded placeholder (“Calendar Expanded View”). Collapse is persisted per workspace via **`calendarCollapsedStorageKey`** in **`src/lib/layout-collapse-keys.ts`** (`CALENDAR_COLLAPSED_KEY` prefix + `.{workspaceId}`), hydrated in **`dashboard-shell.tsx`** alongside chat/Kanban. Chat ↔ board resize clamps account for calendar width (strip vs expanded min).

Target **UX** states (split and full-screen behavior are partially aspirational until later phases):

- **Collapsed State (The Strip):** Appears as a thin, persistent vertical strip on the left-center of the screen. It features a Calendar icon and potentially the current date. It occupies minimal width, maximizing space for Chat or Kanban.
- **Split View (Expanded):** Clicking the strip expands the Calendar. If Messages or Kanban are open, the Calendar shares the horizontal real estate, creating a powerful side-by-side workflow (ideal for dragging unscheduled Kanban tasks onto calendar days).
- **Full Screen (Focused):** If the user expands the Calendar and manually collapses the adjacent Messages and Kanban rails, the Calendar dynamically expands to fill the entire main content area.

### 4.2 Desktop-First Layout: Dual Calendar View

**Approach:** When the Calendar Rail is expanded, it reveals a custom desktop layout combining a 7-day horizontal ribbon and a full month grid, using `date-fns` for the calendar math.

1. **Top Section: Scrolling 7-Day View (Weekly Ribbon)**
   - A horizontal, scrollable ribbon displaying 7 days at a glance.
   - **Rendering:** This section will render the **full-size Kanban Cards** stacked vertically under each day column. This provides high detail for immediate upcoming tasks.

2. **Bottom Section: Full Month Display (CSS Grid)**
   - A custom CSS Grid Month View (`grid-cols-7`).
   - Provides the macro-level overview. Clicking a day here snaps the top 7-Day ribbon to that specific week.
   - **Rendering:** Due to space constraints, prefer **`KanbanTaskCard`** with a **denser presentation**: either extend **`KanbanCardDensity`** (`src/components/board/kanban-density.ts`) with something like `'compact'`, or reuse **`'summary'`** if it is visually tight enough for month cells. Goal: accent, title, priority (same as today’s summary mode), without duplicating a second card component.

### 4.3 Theme Integration

Reusing **`KanbanTaskCard`** keeps Theme Engine behavior (structural colors, Shadcn `Card`, `--accent-*` tokens) aligned with the board.

## 5. Interactions & States

1. **Expand / Collapse:** Clicking the persistent left-center calendar strip seamlessly animates the rail open or closed, triggering the other active rails to resize contextually via CSS flexbox/grid transitions.
2. **Cross-Rail Drag and Drop:** Users can drag a task card from Kanban and drop it on a calendar day. That should **`PATCH` `scheduled_on`** (and optionally clear or preserve `scheduled_time` per product rules). Dragging within the calendar reschedules the same fields.
3. **Quick Add:** Clicking an empty day cell opens a fast-creation popover. Since everything is a task, it asks for "Task Name" and optionally assigns it to a default Kanban column (like "Todo").
4. **Completed Tasks:** Tasks in a terminal column (e.g. a **Done** column, depending on workspace template) **remain visible** on the calendar for context. **`KanbanTaskCard`** should gain a clear completed visual (e.g. muted opacity, strikethrough) driven by `task.status` / column semantics—align with how columns are defined (`useBoardColumnDefs` and seed templates).
5. **Archive & Recover:** Users can explicitly "Archive" a task (via `TaskModal` or a card affordance) to set **`archived_at`** and hide the row from calendar and board lists. Recovery flows remain to be specified (filter, settings surface, etc.).
6. **Syncing Views:** Scrolling or paginating the top 7-day view updates the active week highlighted in the bottom month view, and vice versa.

## 6. Implementation Phases (For Cursor)

1. **Database Update — done:** Migration **`20260423120000_tasks_archived_at.sql`**; **`src/types/database.ts`** includes **`archived_at`**. **Reads:** **`KanbanBoard.loadTasks`** (and promotion / max-position when moving bubbles), **`ChatArea`** task-mention list, and **`src/app/api/cron/scheduled-tasks/route.ts`** filter **`archived_at IS NULL`**. RLS unchanged (archiving is app-layer until product specifies policy).
2. **UI Shell — Calendar column — done (placeholder):** **`dashboard-shell`**: `calendarCollapsed` + persistence; **`workspace-main-split`**: **`CalendarRail`** between chat and board; **`layout-collapse-keys`**: **`calendarCollapsedStorageKey`**. Messages/Kanban “at least one panel open” invariant is unchanged; **`setCalendarCollapsed`** includes a defensive guard if chat and Kanban were ever both collapsed.
3. **Data layer:** Shared hook or module that loads tasks for `[rangeStart, rangeEnd]` on **`scheduled_on`**, same **`bubble_id`** scope as `KanbanBoard`, `archived_at` null. Reuse **`createClient()`** patterns from the board.
4. **Calendar UI:** New presentational module(s) under e.g. `src/components/calendar/` (name TBD): month `grid-cols-7`, scrollable week ribbon, `date-fns` for month boundaries; style with existing tokens (`border-border`, `bg-card`, etc.).
5. **Card & modal behavior:** Adjust **`KanbanTaskCard`** (density and/or completed styling). Add Archive to **`src/components/modals/TaskModal.tsx`** and a recovery surface. **`KanbanBoard`** already omits archived tasks in **`loadTasks`**.
6. **Rendering:** Map fetched rows into week + month regions using **`KanbanTaskCard`**; pass **`calendarTimezone`** from the shell (already wired into `KanbanBoard` as `workspaceCalendarTz`).
7. **Cross-rail DnD:** Integrate with existing **`@dnd-kit`** usage in **`src/components/board/KanbanBoard.tsx`**—likely lift or bridge `DndContext` so calendar cells are valid drop targets and updates run through the same Supabase update helpers.

## 7. Primary files and references

| Area                               | Path(s)                                                                                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calendar shell (Phase 1)           | `src/components/dashboard/calendar-rail.tsx`                                                                                                                    |
| Shell & layout                     | `src/components/dashboard/dashboard-shell.tsx`, `src/components/dashboard/workspace-main-split.tsx`                                                             |
| Collapse key pattern               | `src/lib/layout-collapse-keys.ts` (`CALENDAR_COLLAPSED_KEY`, `calendarCollapsedStorageKey`), `docs/tdd-layout-column-drawers.md`                                |
| Board & task load                  | `src/components/board/KanbanBoard.tsx`, `src/components/board/kanban-task-card.tsx`, `src/components/board/kanban-density.ts`, `src/hooks/use-board-columns.ts` |
| Chat task list (excludes archived) | `src/components/chat/ChatArea.tsx`                                                                                                                              |
| Scheduled promotion cron           | `src/app/api/cron/scheduled-tasks/route.ts`                                                                                                                     |
| Task editor & schedule             | `src/components/modals/TaskModal.tsx`, `src/types/task-modal.ts`                                                                                                |
| Calendar / schedule helpers        | `src/lib/workspace-calendar.ts`, `src/lib/task-scheduled-time.ts`, `src/lib/task-date-filter.ts`                                                                |
| Types                              | `src/types/database.ts` (`TaskRow`)                                                                                                                             |
| Schema & RLS                       | `supabase/migrations/*` (incl. **`20260423120000_tasks_archived_at.sql`** for `archived_at`)                                                                    |
