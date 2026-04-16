# Card architecture assessment (`public.tasks` as the universal card)

## The Refactoring Roadmap

**Phase 1: Unify the “Quick Actions” UI (Low Risk, High Reward).** Extract the duplicated Tab Strip (Details, Comments, Subtasks, Activity) into a single, shared component. This immediately cleans up both the Kanban and Chat cards and ensures our new `viewMode` logic works flawlessly everywhere.

**Phase 2: Fix Chat/Calendar State Sync (Medium Risk).** Implement a lightweight global task cache or unified Realtime listener so that when `TaskModal` saves, the Chat Rail and Calendar instantly reflect the new data.

**Phase 3: Thin out `TaskModal.tsx` (High Risk).** Break the 2,800-line file into smaller, domain-specific components (e.g., `WorkoutEditor.tsx`, `ProgramMetadata.tsx`) that the modal simply imports.

---

This document describes how the repository models and renders the polymorphic **Card** (persisted as a row in **`public.tasks`**), where it appears in the UI, how actions are wired, how extensible the design is, and where the architecture is weakest. It is derived from the current codebase and file layout only.

---

## 1. The universal domain model

### 1.1 Single table: `tasks`

The product’s “card” is a **`tasks`** row. Kanban, calendar, chat embeds, programs, workout flows, and `TaskModal` all read and write the same table. The schema evolution is documented in migrations and TDD notes; the important polymorphic columns are:

| Mechanism                                                                                                                     | Role                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`item_type`** (`text`, `NOT NULL`, DB `CHECK`)                                                                              | Discriminator for semantic kind: `task`, `event`, `experience`, `idea`, `memory`, `workout`, `workout_log`, `program`. Extended over time in `supabase/migrations/20260424120000_tasks_item_polymorphism.sql`, `20260503100000_tasks_item_type_workout.sql`, `20260504100000_tasks_item_type_program.sql`. |
| **`metadata`** (`jsonb`, `NOT NULL`, default `{}`)                                                                            | Type-specific payload (locations, URLs, workout exercises, program schedule, card cover path, etc.).                                                                                                                                                                                                       |
| **Core columns** (`title`, `description`, `status`, `position`, `priority`, `scheduled_on`, `scheduled_time`, `bubble_id`, …) | Shared lifecycle: scheduling, Kanban column membership, assignment, archiving (`archived_at`).                                                                                                                                                                                                             |
| **`program_id` / `program_session_key`**                                                                                      | Program ↔ child workout linkage at the row level (not only in `metadata`); see comments in `src/lib/item-metadata.ts`.                                                                                                                                                                                     |
| **`visibility`**                                                                                                              | Storefront / members-only split on public workspaces.                                                                                                                                                                                                                                                      |
| **JSON columns** (`subtasks`, `comments`, `activity_log`, `attachments`)                                                      | Structured blobs parsed in `src/types/task-modal.ts` and heavily used by `TaskModal`.                                                                                                                                                                                                                      |

### 1.2 How identities differ (workout vs playdate vs chat post)

- **Workout vs generic task vs program**  
  These are distinguished primarily by **`item_type`**. Workout-specific structure lives under **`metadata`** (e.g. `exercises`, `workout_type`, `duration_min`) with normalization and merge rules in **`src/lib/item-metadata.ts`** (`metadataFieldsFromParsed`, `buildTaskMetadataPayload`, `MANAGED_METADATA_KEYS`). Programs add **`metadata`** fields such as `goal`, `duration_weeks`, `schedule`, `current_week`, plus top-level **`program_id`** linkage for generated child rows.

- **“Playdate” / social event vs plain card**  
  The codebase does **not** use a separate table for “playdate.” A family-oriented **event** is still a **`tasks`** row with **`item_type = 'event'`** and **`metadata.location` / `metadata.url`** populated via the same metadata pipeline. Product copy may say “playdate”; the data model says **`event`**.

- **Chat post vs card**  
  A **message** is a row in **`public.messages`**. When a message “contains” a card, it sets **`messages.attached_task_id`** (FK to `tasks`). The chat UI loads **`tasks`** alongside messages (PostgREST embed `tasks!messages_attached_task_id_fkey(*)` in `src/components/chat/ChatArea.tsx`). The **card** is still the task row; the **post** is the message wrapper.

### 1.3 Application typing vs database

- **`ItemType`** and **`normalizeItemType`** in **`src/types/database.ts`** mirror the DB `CHECK` set. Unknown strings fall back to **`'task'`**, which can mask migration lag or bad data until inspected.
- **`src/types/database.ts`** `Database['public']['Tables']['tasks']` documents generated row shape including **`item_type`** and **`metadata`**.

---

## 2. Surface areas and component tree

| Surface                      | Responsibility                                                                                       | Primary components                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kanban board**             | Full card with drag handle, density modes, bubble move, workout quick actions, optional cover toggle | **`src/components/board/KanbanBoard.tsx`** → **`src/components/board/kanban-task-card.tsx`** (`KanbanTaskCard`, `KanbanTaskCardDragDecoration`)                |
| **Calendar week ribbon**     | Day columns; full-density cards                                                                      | **`src/components/calendar/calendar-week-ribbon.tsx`** → **`KanbanTaskCard`**                                                                                  |
| **Calendar month grid**      | Micro cells + experience chips; **`density="micro"`** on cards                                       | **`src/components/calendar/calendar-month-grid.tsx`** → **`KanbanTaskCard`**                                                                                   |
| **Calendar rail (shell)**    | Composes ribbon + month, task fetch, fitness-only day annotations                                    | **`src/components/dashboard/calendar-rail.tsx`** (uses **`src/hooks/use-calendar-tasks.ts`**)                                                                  |
| **Programs / fitness board** | Program-specific layout; still uses **`KanbanTaskCard`** for task-like rows                          | **`src/components/fitness/ProgramsBoard.tsx`** → **`KanbanTaskCard`**                                                                                          |
| **Chat feed**                | Read-only embed; tab strip opens **`TaskModal`** sections                                            | **`src/components/chat/ChatArea.tsx`** → **`src/components/chat/ChatFeedTaskCard.tsx`**                                                                        |
| **Thread side panel**        | Same embed as main feed                                                                              | **`src/components/chat/ThreadPanel.tsx`** → **`ChatFeedTaskCard`**                                                                                             |
| **Task inspector**           | Create/edit/archive, comments, subtasks, activity, type-specific editors, AI flows                   | **`src/components/modals/TaskModal.tsx`**, hero **`src/components/modals/task-modal-hero.tsx`**, type picker **`src/components/board/item-type-selector.tsx`** |
| **Workout player**           | Invoked from shell / card actions, not a second persistence model                                    | **`src/components/fitness/WorkoutPlayer.tsx`**, opened from **`src/components/dashboard/dashboard-shell.tsx`** (`handleStartWorkout`)                          |
| **Public storefront**        | Separate Astro stack; similar polymorphic _display_ but not the React card                           | **`apps/storefront/src/components/PublicCard.astro`**, styles **`apps/storefront/src/lib/item-styles.ts`**                                                     |

**`OpenTaskOptions`** / **`TaskModalTab`** / **`TaskModalViewMode`** are exported from **`TaskModal.tsx`** and imported across board, chat, calendar, and shell so all surfaces share the same modal contract.

---

## 3. Component architecture and action wiring

### 3.1 Opening the modal

- **`src/components/dashboard/dashboard-shell.tsx`** owns modal state (`taskModalOpen`, `taskModalTaskId`, initial tab, view mode, create-mode item type, etc.) and implements **`openTaskModal(id, opts?)`** passed down as **`onOpenTask`** to **`ChatArea`**, **`KanbanBoard`**, **`ProgramsBoard`**, **`CalendarRail`** (via context), etc.
- **`OpenTaskOptions`** (`tab`, `viewMode`, `autoEdit`, `openWorkoutViewer`) lets **`KanbanTaskCard`** open comments-only mode, force the workout viewer, or jump into edit on the pencil shortcut—without each surface reimplementing modal internals.

### 3.2 Workout play path

- **`KanbanTaskCard`** accepts **`onStartWorkout?: (task: TaskRow) => void`** (board only). **`dashboard-shell`** sets **`onStartWorkout={handleStartWorkout}`** on **`KanbanBoard`**, which opens **`WorkoutPlayer`** with exercises from **`metadataFieldsFromParsed(task.metadata).workoutExercises`**.
- **`ChatFeedTaskCard`** has **no** play button; chat embeds are preview + modal tabs only.

### 3.3 Shared vs duplicated presentation logic

**Shared**

- **`src/lib/item-type-styles.ts`**: icons, labels, Tailwind tokens for type chip / left bar / surface (`getItemTypeVisual`, `ITEM_TYPES_ORDER`, `itemTypeUiNoun`).
- **`src/lib/task-card-cover.ts`**: `metadata.card_cover_path` → signed URL hook used by **`KanbanTaskCard`** and **`ChatFeedTaskCard`** (and modal hero).
- **`src/lib/item-metadata.ts`**: parse/merge of **`metadata`** for forms and saves.
- **`src/components/tasks/bubbly-button.tsx`**: Bubble Up control; both card variants accept **`bubbleUp`** props from **`useTaskBubbleUps`** at parents.

**Not shared (duplication)**

- **`ChatFeedTaskCard`** reimplements a **header + cover + title/description** layout that overlaps conceptually with the “cover hero” branch of **`KanbanTaskCard`** but is **separate JSX** (different chrome: `stone-*` borders vs board `Card` / theme tokens).
- The **tab strip** (`Details`, `Comments`, `Subtasks`, `Activity`) is **literal duplicate arrays** in **`ChatFeedTaskCard.tsx`**, **`kanban-task-card.tsx`** (twice: micro and full layouts), all mapping to the same **`TaskModalTab`** union—there is **no shared `CardSectionTabs` component**.

### 3.4 Density and board-only behavior

**`KanbanTaskCard`** alone implements **`KanbanCardDensity`** (`micro`, `summary`, `full`, `detailed`), drag handle slot, bubble selector, presence ring, **`showKanbanCoverToggle`** + **`localStorage`** hide/show for covers, and **`KanbanCardQuickActions`** (workout quick view, play, edit, comments). **`ChatFeedTaskCard`** is a single fixed layout.

---

## 4. Theming and polymorphism extensibility

### 4.1 Social space / workspace “theme”

- Workspace template is **`workspaces.category_type`** → **`WorkspaceCategory`** in **`src/types/database.ts`** (`business`, `kids`, `class`, `community`, `fitness`, …).
- **`workspaceCategory`** is threaded into **`KanbanTaskCard`**, **`CalendarWeekRibbon`**, **`CalendarMonthGrid`**, **`TaskModal`**, and **`calendar-rail.tsx`**, mainly for **date field copy** (**`src/lib/task-date-labels.ts`**) and **fitness-only** calendar overlays (**`dayAnnotations`** in **`calendar-rail.tsx`** counts completed **`workout` / `workout_log`** per day).
- **Card chrome (colors, icons) is driven by `item_type`, not by `WorkspaceCategory`.** A workout card looks the same in a Kids vs Fitness workspace unless surrounding layout differs.

### 4.2 Extending `item_type`

Adding a type (e.g. **“Local Business Deal”**) currently requires touching **many** layers:

1. **Postgres**: alter **`tasks_item_type_check`** in a new migration.
2. **TypeScript**: extend **`ItemType`** and **`ITEM_TYPE_SET`** in **`src/types/database.ts`**.
3. **UI registry**: add **`ITEM_TYPE_VISUAL`** / **`ITEM_TYPES_ORDER`** / **`ITEM_TYPE_UI_NOUN`** in **`src/lib/item-type-styles.ts`**.
4. **Metadata**: extend **`MANAGED_METADATA_KEYS`**, **`TaskMetadataFormFields`**, **`metadataFieldsFromParsed`**, **`buildTaskMetadataPayload`** in **`src/lib/item-metadata.ts`** if the type has structured fields.
5. **Modal**: add branches in **`TaskModal.tsx`** (thousands of lines) for any new fields, validation, and save payloads.
6. **Optional**: **`ItemTypeSelector`** automatically lists all **`ITEM_TYPES_ORDER`** types—product must decide if the new type should appear everywhere.
7. **Storefront**: **`apps/storefront/src/lib/item-styles.ts`** and **`PublicCard.astro`** use **separate** icon/metadata logic; new types may silently hit **`FALLBACK`** or missing **`metadataBlocks`** until updated.

There is **no plugin/registry** for “card behavior per type”—conditionals accumulate in **`TaskModal`** and **`KanbanTaskCard`** (e.g. **`task.item_type === 'workout' || task.item_type === 'workout_log'`** for play, **`taskRowHasWorkoutViewerContent`** for quick view).

---

## 5. Gap analysis and deficiencies

### 5.1 File size and coupling

- **`TaskModal.tsx` (~2,790 lines)** concentrates persistence, validation, tabs, workout/program AI, attachments, comments, subtasks, visibility, presence, and layout. It is the **largest single choke point** for product and engineering velocity on the card domain.
- **`ChatArea.tsx` (~2,060+ lines)** mixes messaging, realtime, search, task mentions, and embed loading—another hotspot adjacent to the card story.

### 5.2 Chat rail vs Kanban: behavior and parity gaps

| Aspect                                    | Kanban (`KanbanTaskCard`)       | Chat (`ChatFeedTaskCard`)                           |
| ----------------------------------------- | ------------------------------- | --------------------------------------------------- |
| Workout **play**                          | Yes, via **`onStartWorkout`**   | No                                                  |
| Workout **quick view** (viewer from card) | Yes                             | No                                                  |
| Priority / schedule chips                 | Yes                             | No                                                  |
| Subtasks / assignee summary               | In **`detailed`** density       | No                                                  |
| Bubble move                               | Yes (when **`canWrite`**)       | No                                                  |
| Tab strip to modal sections               | Yes                             | Yes (**`CardTabStrip`** shared)                     |
| Visual system                             | Shadcn **`Card`**, theme tokens | Custom **`stone-*`** / **`max-w-sm`** embed styling |

Chat is intentionally “light,” but the **divergence is structural** (two components, two design dialects), not a single **`variant="embed"`** on one primitive.

### 5.3 State synchronization risks

**Board vs `TaskModal`**

- **`KanbanBoard`** subscribes to Supabase **`postgres_changes`** on **`tasks`** for the active bubble(s) and calls **`loadTasks()`** on any change—so the **board** tends to refresh when **`TaskModal`** writes to the DB (assuming Realtime is enabled and RLS allows delivery).

**Calendar vs board (Phase 2 mitigation)**

- **`use-calendar-tasks.ts`** still refetches when **`reloadNonce`** or its other dependencies change, but it also subscribes to **`postgres_changes`** on **`tasks`** for the same **`bubble_id`** scope (single or multi-bubble). Any task INSERT/UPDATE/DELETE bumps an internal tick and **re-runs the same fetch/merge** as the initial load, so calendar ribbon/grid stay aligned with **`TaskModal`** saves without relying solely on **`reloadNonce`**.
- When Kanban is visible, **`reloadNonce`** remains **`taskViewsNonce + calendarDropNonce`** from **`KanbanBoard`**. When Kanban is **collapsed**, the shell’s **`CalendarRail`** still does not receive **`taskViewsNonce`** on **`reloadNonce`**—**Realtime** covers task-row updates anyway.

**Chat embed vs task (Phase 2 mitigation)**

- **`ChatArea`** still uses **`postgres_changes`** on **`messages`** for thread rows. It **also** listens to **`tasks`** for the same bubble filters (single or all-bubbles). On task INSERT/UPDATE, messages whose **`attached_task_id`** matches get an in-place **`tasks`** payload update; archived tasks clear the embed; DELETE clears the embed.
- **`fetchEmbeddedTaskForMessage`** remains the source of truth on message INSERT/UPDATE.

**`taskViewsNonce` in shell**

- **`bumpTaskViews`** still runs on create, archive, workout completion, etc. It remains useful for **`reloadNonce`** and board **`taskViewsNonce`** flows; calendar/chat task visibility no longer depends only on those bumps for ordinary **`TaskModal`** saves.

### 5.4 Storefront / app drift

- **`getPublicCardVisual`** only defines **`task`, `event`, `experience`, `memory`, `idea`**. **`workout`, `workout_log`, `program`** fall back to a generic visual.
- **`PublicCard.astro`** uses **hand-rolled `if (it === 'event')`** for icons and metadata lines—parallel to **`item-metadata`** but **not shared** with the Next app.

### 5.5 Missing abstractions (technical debt)

1. **No single “Card view model”** — surfaces each interpret **`TaskRow`** with overlapping but inconsistent rules.
2. **Card chrome** — Phase 1 added **`CardTabStrip`** for modal section pills; Kanban vs chat **layout** for the card body is still separate components.
3. **Realtime is aligned for tasks** — board, calendar hook, and chat now subscribe to **`tasks`** where relevant; chat still uses **`messages`** for message rows.
4. **Extending types** requires coordinated edits across **DB, types, styles, metadata builder, modal, storefront**—high regression risk.
5. **`TaskModal` + `item-metadata`** own business rules (e.g. program upserts, status alignment with **`src/lib/workspace-calendar.ts`**) that are **opaque** to lightweight renderers (`ChatFeedTaskCard`), so **behavior** can diverge from **preview**.

---

## 6. Summary

The repository’s **card** is a **polymorphic `tasks` row** discriminated by **`item_type`** with a flexible **`metadata`** JSON payload and a few **relational** fields (**`program_id`**, etc.). **Rendering** is split between **`KanbanTaskCard`** (board + calendar + programs) and **`ChatFeedTaskCard`** (chat + thread), with **heavy** editing and persistence in **`TaskModal`**. **Type-aware styling** is partially centralized in **`item-type-styles.ts`**, but **behavior** and **embed layout** are still duplicated. **Task row sync:** Kanban, **`use-calendar-tasks`**, and **`ChatArea`** each subscribe to **`tasks`** via Realtime (chat also subscribes to **`messages`**); **`reloadNonce` / `taskViewsNonce`** remain for explicit invalidations. Refactors that would still pay down risk: **thin `TaskModal`**, **one card primitive with variants**, and **shared tab/actions**.
