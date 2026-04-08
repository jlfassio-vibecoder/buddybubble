# Technical design: item polymorphism (the “smart table”)

## 1. Problem

BuddyBubble models work items in **`public.tasks`**, which today reads as a single “to-do” pipeline. In practice, families, class cohorts, and communities track a wider spectrum of information: planning future fun (**experiences**), brainstorming (**ideas**), gatherings (**events**), and retrospective logs (**memories**).

Creating **separate tables** per category would force heavy joins for Kanban and calendar views, hurt performance, and make **cross-column drag-and-drop** brittle.

## 2. Goals

1. **One smart table:** Extend **`public.tasks`** with a polymorphic discriminator and type-specific payload, keeping Kanban and calendar queries **single-table** and fast (`select('*')`, range filters on `scheduled_on`—see §7).
2. **Unified rendering:** Evolve **`KanbanTaskCard`** so styling, iconography, and optional content (e.g. memory thumbnail, event location) depend on **`item_type`**.
3. **Type fluidity:** Let users change an item’s type (e.g. idea → experience → scheduled event) **without row migration** or table hops—only column updates.
4. **Metadata flexibility:** Use a **JSONB** column for type-specific fields (location, horizon hints, image reference, etc.) without many nullable scalar columns.

## 3. Non-goals (v1)

- Renaming the PostgreSQL table from **`tasks`** to **`items`** (large codebase churn). The table stays **`tasks`**; product copy may later say “item” where appropriate.
- **Per-type permission matrices** (same RLS as tasks today).
- **Separate “deadline” column.** Scheduling continues to use existing **`scheduled_on`** / **`scheduled_time`** (workspace `calendar_timezone`)—see §6 and `docs/tdd-task-scheduled-dates.md`.

## 4. Current implementation (baseline)

| Area                   | Location                                          | Relevance                                                                                                                                                           |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task row shape         | `src/types/database.ts` → `TaskRow`               | Today: `priority`, `scheduled_on`, `scheduled_time`, `archived_at`, JSONB `subtasks`, `comments`, `activity_log`, `attachments`.                                    |
| Kanban + load          | `src/components/board/KanbanBoard.tsx`            | `.from('tasks').select('*')`, filters `archived_at` in JS.                                                                                                          |
| Calendar fetch         | `src/hooks/use-calendar-tasks.ts`                 | `.gte/.lte('scheduled_on', range)`; items **without** `scheduled_on` do not appear in calendar queries.                                                             |
| Month grid micro cards | `src/components/calendar/calendar-month-grid.tsx` | `KanbanTaskCard` with `density="micro"` (title + drag handle today—no type icon).                                                                                   |
| Task editor            | `src/components/modals/TaskModal.tsx`             | Insert/update payloads, **`activity_log`** on save, staged-deploy fallbacks via `isMissingColumnSchemaCacheError` for `scheduled_on`, `scheduled_time`, `priority`. |
| Date labels            | `src/lib/task-date-labels.ts`                     | “Due by” vs “Scheduled on” from `workspaces.category_type`.                                                                                                         |
| Status vs schedule     | `src/lib/workspace-calendar.ts`                   | `alignStatusWithFutureSchedule`, `promotedStatusForScheduledOnToday`.                                                                                               |
| Midnight promotion     | `src/app/api/cron/scheduled-tasks/route.ts`       | `scheduled` → `today` when `scheduled_on` matches workspace local date (type-agnostic today).                                                                       |

## 5. Data model

### 5.1 Schema migration (Supabase)

Add to **`public.tasks`**:

| Column          | Type             | Default       | Notes                                                                                                                                                                                                       |
| --------------- | ---------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`item_type`** | `text not null`  | `'task'`      | Backfills existing rows. Enforce allowed values with **`CHECK (item_type IN ('task','event','experience','idea','memory'))`** or a Postgres `enum` (enum is stricter; harder to extend without migrations). |
| **`metadata`**  | `jsonb not null` | `'{}'::jsonb` | Type-specific payload only.                                                                                                                                                                                 |

**Naming note:** If “metadata” clashes with logging or mental model of `attachments`, an alias column name such as **`item_metadata`** is acceptable; this document uses **`metadata`** unless implementation chooses otherwise.

**Indexes:** Existing **`(bubble_id, scheduled_on)`** (`tasks_bubble_scheduled_on_idx`) remains the main calendar path. Add **`(bubble_id, item_type)`** (or a partial index) only if product adds **type-filtered** hot queries.

**RLS / Realtime:** New columns inherit existing task policies; `tasks` already uses `replica identity full` for realtime.

### 5.2 Semantic definitions

| `item_type`      | Intent                 | Calendar behavior                                                                              | Example `metadata` (illustrative)                                                                       |
| ---------------- | ---------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **`task`**       | Actionable to-do       | Appears when **`scheduled_on`** falls in the visible range (same as today).                    | `{}`                                                                                                    |
| **`event`**      | Time-blocked gathering | Same as task; optional time via **`scheduled_time`**.                                          | `{ "location": "Park", "url": "https://zoom.us/..." }`                                                  |
| **`experience`** | Horizon / planning     | **Kanban until** user sets **`scheduled_on`**; then same calendar rules as task.               | `{ "season": "Summer", "year": 2026 }`                                                                  |
| **`idea`**       | Brainstorm / backlog   | **Kanban-only** until **`scheduled_on`** is set; then calendar-eligible.                       | `{ "votes": 4 }`                                                                                        |
| **`memory`**     | Retrospective log      | Appears on calendar when **`scheduled_on`** is the remembered **day** (typically in the past). | `{ "caption": "..." }` plus image via **`attachments`** (recommended) or URL/path in metadata—see §5.3. |

**Critical clarification:** The app’s calendar hook filters on **`scheduled_on`**. There is **no** separate “memory date” column in v1. **Memories must set `scheduled_on`** to the log day to appear in `useCalendarTasks`. Ideas/experiences without a date correctly stay off the calendar.

### 5.3 Images and `attachments` (existing system)

Tasks already store file metadata in **`attachments`** (JSONB) with **private storage** and **signed URLs** (`src/lib/task-storage.ts`, `TaskAttachmentImagePreview` in `TaskModal.tsx`).

**Recommendation:** For **memory** images, **prefer the existing attachment pipeline** (consistent RLS, thumbnails, signing). If **`metadata`** stores an image reference, specify whether it is:

- a **storage object path** resolved like attachments, or
- a **duplicate** of attachment-derived state (avoid two sources of truth).

Raw public URLs to private-bucket objects will **not** work in the browser without signing.

## 6. Scheduling and copy (aligned with codebase)

- **Single scheduling surface:** **`scheduled_on`** (date) and optional **`scheduled_time`** (local wall time in workspace timezone)—not a new “deadline” column.
- **UI labels** continue to come from **`taskDateFieldLabels(workspaceCategory)`** (“Due by” vs “Scheduled on” / “Event date”). Item types do not require separate label tables for v1; optional later: tweak helper copy per `item_type`.

## 7. UI / architecture

### 7.1 Type-aware Kanban card

**File:** `src/components/board/kanban-task-card.tsx`

- Read **`task.item_type`** (default **`task`** in UI if null during staged deploys).
- **Iconography:** Map each type to a **Lucide** icon (e.g. `MapPin` event, `Lightbulb` idea, `Camera` memory, `Calendar` or `Sparkles` experience—exact set in implementation).
- **Visual differentiation:** Map types to **CSS variables / Tailwind** accents (left border, subtle background, or chip) so dense boards remain scannable.
- **Content injection:**
  - **`memory`:** If a displayable image exists (attachment thumb or agreed `metadata` field), show a **small thumbnail**.
  - **`event`:** Show **location** (and optionally link) from `metadata` when present.
- **Micro density:** Today, micro layout is **title + drag handle** only. Add a **compact leading type icon** (there is no legacy “checkbox” to replace).

### 7.2 Creation and editing

**File:** `src/components/modals/TaskModal.tsx`

- **Type selector:** Header control (Shadcn **Select** or **Tabs**) for **`item_type`** on create and edit.
- **Conditional fields** (body), writing into **`metadata`** (merge with existing object; avoid wiping unrelated keys):
  - **Event:** Location, meeting link → `metadata.location`, `metadata.url`.
  - **Memory:** Prefer **attachment upload** for image; optional caption in `metadata.caption`.
  - **Experience:** Horizon fields (e.g. season/year) → `metadata`.
- **Persistence:** Include **`item_type`** and **`metadata`** in **insert** and **update** payloads.
- **Activity log:** Extend field tracking so changes to **`item_type`** and meaningful **`metadata`** keys are appended via the same **`appendActivityForFieldChange`** pattern used for `status` / `scheduled_on`.
- **Staged deploys:** If migrations may lag code, mirror existing **`isMissingColumnSchemaCacheError`** handling for the new columns (optional but consistent with `TaskModal` today).

### 7.3 Shared primitive

**New component (suggested path):** `src/components/board/item-type-selector.tsx` (or under `components/ui` if reused).

- Props: value, onChange, disabled, optional `className`.
- Uses design-system controls (Shadcn) and a single exported **`ItemType`** union type shared with cards and modal.

### 7.4 TypeScript

After **`supabase gen types`**, update **`src/types/database.ts`** (generated) and add a thin layer:

- **`ItemType`** union matching the DB check constraint.
- Optional **Zod** (or manual) parsers for **`metadata`** per type so the UI does not treat JSON as untyped everywhere.

Update test stubs that build **`TaskRow`** objects (e.g. `src/lib/task-scheduled-time.test.ts`) once `TaskRow` includes the new fields.

## 8. Interactions, automation, and edge cases

### 8.1 Type evolution

Changing **`item_type`** in the modal should **immediately** reflect in card UI after save (and optimistically if product chooses). **Merge** `metadata` when switching types: either preserve unrelated keys or define a product rule to prune keys—document the chosen behavior in implementation.

### 8.2 Calendar routing (summary)

| Types                | Behavior                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| **Task, event**      | Unchanged: driven by **`scheduled_on`** / **`scheduled_time`**.                                 |
| **Experience, idea** | Kanban-first; appear in calendar **once `scheduled_on` is set**.                                |
| **Memory**           | Chronological log **on `scheduled_on`** (past dates appear when the month/range includes them). |

### 8.3 Cron: `scheduled` → `today`

**File:** `src/app/api/cron/scheduled-tasks/route.ts`

Today promotion is **type-agnostic**. **Decide explicitly:**

- **Option A (simple):** All types that use **`status`** / **`scheduled_on`** participate (memories rarely in `scheduled` column).
- **Option B:** Restrict promotion to **`item_type in ('task','event')`** so **idea** / **memory** / **experience** never get automatic status churn.

Record the product decision in the PR that touches cron.

## 9. Implementation phases

1. **Database:** Supabase migration adding **`item_type`** (default **`task`**) and **`metadata`** (default **`{}`**), with **`CHECK`** or enum. Run type generation; commit updated **`src/types/database.ts`**.
2. **Type selector UI:** Build **`ItemTypeSelector`**; wire into **`TaskModal`** header; persist on create/update.
3. **Data layer:** Ensure insert/update objects include **`item_type`** + **`metadata`**; extend **`originalRef`** / dirty detection; add **activity_log** entries for type/metadata changes where valuable.
4. **Kanban card:** Refactor **`KanbanTaskCard`** for icons, accents, optional thumbnail/location; update **micro** density for calendar month cells.
5. **Polish:** Event fields (location, URL); memory flow aligned with **attachments**; experience horizon fields; cron filter if Option B in §8.3.

## 10. Success criteria

- Existing tasks behave as **`item_type = task`** with empty **`metadata`**.
- Kanban and calendar queries remain **single-table** with no new join requirements for v1.
- Users can assign a type, edit type-specific fields, set **`scheduled_on`** when ready, and see consistent behavior on board and calendar.
- No regression in **`TaskModal`** save paths, **archived** filtering, or **signed URL** attachment behavior.

## 11. Related documents

- `docs/tdd-task-scheduled-dates.md` — `scheduled_on`, workspace timezone, labels.
- `docs/tdd-kanban-card-restore.md` — Kanban card density and board structure.
- `docs/tdd-calendar-view-implementation.md` — calendar UI consumption of tasks.
