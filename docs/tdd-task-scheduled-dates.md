# Technical design: task scheduled date / due date (category-aware) and “roll into Today” at midnight

## 1. Problem

BuddyBubble workspaces are **templates** (`workspaces.category_type`: `business` | `kids` | `class` | `community`) with **different Kanban column sets** (see `WORKSPACE_SEED_BY_CATEGORY` in `src/lib/workspace-seed-templates.ts`). Users need a **single calendar date** on a task, but the **label and mental model** should match the template:

- **Kids / community** workflows emphasize **when something happens** (“scheduled”), not a punitive deadline.
- **Business / class** workflows emphasize **deadlines** (“due by”).

Separately, templates that include both **`scheduled`** and **`today`** columns (e.g. **kids**, **community**) need a rule: a task **scheduled for a given calendar day** should **appear in the `today` column when that day starts**, evaluated in a **single, consistent timezone** for the workspace so all members see the same board state.

Today, `public.tasks` has no date field; status changes are manual (Kanban drag) or app-driven only where implemented.

## 2. Goals

1. Store **one optional calendar date** per task (no time-of-day for v1 unless product expands).
2. Show **category-appropriate copy** in UI (`TaskModal`, `KanbanTaskCard`, filters later): **Due by** vs **Scheduled on** (exact strings below).
3. For workspaces whose board defines a **`today`** column slug, **automatically set** `tasks.status` to that column’s slug at **local midnight** on the scheduled date, where “local” means the **workspace calendar timezone** (see §5).
4. **Non-goal for v1**: recurring schedules, time-of-day reminders, or per-member “my timezone” for when the card moves (the board is shared; one timezone is the source of truth).

## 3. Product copy by `category_type`

These are **defaults**; implementation can centralize in e.g. `lib/task-date-labels.ts`.

| `category_type` | Primary field label (task detail) | Short label (card chip) | Notes                                                                 |
| --------------- | --------------------------------- | ----------------------- | --------------------------------------------------------------------- |
| `kids`          | **Scheduled on**                  | **Scheduled**           | Caregiver-friendly; aligns with “Schedule Sync” / “Today!” columns.   |
| `community`     | **Scheduled for**                 | **Event date**          | Event-oriented; works with “Upcoming Events” / “Scheduled” / “Today”. |
| `business`      | **Due by**                        | **Due**                 | Standard obligation language.                                         |
| `class`         | **Due by**                        | **Due**                 | Assignment-style; matches “Submitted” / “Graded” flow.                |

**Helper text (optional):**

- Kids / community: “Tasks show in **Today** on that calendar day (workspace time).”
- Business / class: “Used for planning and sorting; overdue styling can come later.”

## 4. Data model

### 4.1 Column on `tasks`

Add a **nullable** column, one of:

- **Recommended:** `scheduled_on date` (PostgreSQL `date`)
  - Semantics: the **calendar day** the task is tied to, **in the workspace calendar timezone** (not UTC date).
  - Avoids “off-by-one” bugs from storing UTC midnight timestamps for a “date only” concept.

Alternative names if product prefers: `due_on` (business/class) with the same DB type—**one column** keeps queries and RLS simple; labels differ by category only in UI.

### 4.2 Workspace calendar timezone

Add to `workspaces` (or a small `workspace_settings` table if you prefer normalization):

- `calendar_timezone text not null default 'America/Los_Angeles'` (or `UTC` if you want a neutral default)

**Rules:**

- **Only workspace admins** can update `calendar_timezone` (UI: Workspace settings).
- This is the timezone used to answer: “What is **today’s date** for this workspace?” and “When does **scheduled_on** become **today**?”

**Why not the viewing user’s browser timezone?**  
Members in different zones would disagree on whether a task belongs in **Today** vs **Scheduled**. The product requirement here is to anchor “midnight” to the **admin / workspace** calendar (see §6 for tying to the admin user).

**Mapping “admin user”:**  
On creation, set `calendar_timezone` from the **creating user’s** profile timezone if present; otherwise default. Ongoing edits are **workspace admin** only (not necessarily `created_by` after ownership changes—define in RLS: `workspace_members.role = 'admin'`).

### 4.3 User timezone (optional, for seeding only)

If `users` gains `timezone text` (IANA), use it **once** when creating a workspace to initialize `workspaces.calendar_timezone`. It is **not** required for daily task moves.

## 5. Behavior: roll into `today` at 12:00 AM

### 5.1 Which workspaces auto-move?

From seed templates:

- **kids** and **community** boards include slugs `scheduled` and `today` — **auto-move is in scope**.
- **business** and **class** boards do **not** include a `today` slug in the default seed. For v1:
  - **Do not** auto-change `status` by date unless product adds a `today` column or a **per-workspace configured “due-day target slug”**.
  - Still show **Due by** on the card and allow **sort/filter** by date later.

If a workspace **customizes** `board_columns` and adds a `today` slug, the same job can apply when `scheduled_on` is set and `status` is still the configured “before today” slug—see §5.3.

### 5.2 Desired transition

For a task with:

- `scheduled_on = D`
- `status = 'scheduled'` (or whatever slug represents “not yet the day” for that board)

When the workspace’s calendar date **first becomes `D`** (at **00:00:00** in `workspaces.calendar_timezone`):

- Set `status` to the slug of the **Today** column (e.g. `'today'` for kids/community seeds).

**Idempotency:** Running the job twice for the same day must not thrash positions; only tasks matching **scheduled date == workspace today** and **current status == scheduled bucket** should update.

### 5.3 How to resolve column slugs safely

Avoid hardcoding only `'scheduled'` / `'today'`:

- **Config table (recommended for robustness):** `workspace_board_automation` with `workspace_id`, `from_status_slug`, `to_status_slug`, `trigger: 'scheduled_date_equals_today'`. Seed rows for kids/community templates.
- **Convention (smaller v1):** If `board_columns` contains slug `today`, use it as target; source slug is `'scheduled'` if present, else skip automation.

Document the chosen approach in migrations and tests.

## 6. Implementation strategies for “midnight”

| Approach                                                                                          | Pros                                        | Cons                                                                    |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| **A. Scheduled Edge Function / cron** (e.g. Vercel Cron **every hour** or **daily at 00:05** UTC) | Simple; uses service role to `UPDATE` tasks | Must compute “workspace local date” in code; stagger if many workspaces |
| **B. pg_cron + SQL**                                                                              | Runs inside DB                              | Needs timezone helpers (`AT TIME ZONE`) and careful testing             |
| **C. Client-only timer**                                                                          | No server job                               | Wrong when nobody online; **do not use** for authoritative status       |

**Recommendation:** **A** for v1: one job that loads workspaces with auto-move enabled, computes each workspace’s **current local date**, and runs batched updates.

**Query sketch (conceptual):**  
For each workspace `W` with timezone `TZ`, let `local_today = (now() AT TIME ZONE 'UTC' AT TIME ZONE TZ)::date` (exact expression depends on Postgres helpers used). Update tasks where `scheduled_on = local_today` and `status` is the “pre-today” slug.

## 7. Application layers

| Layer              | Changes                                                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Migration**      | `tasks.scheduled_on`, `workspaces.calendar_timezone`, optional automation config; indexes on `(bubble_id, scheduled_on)` or `(workspace_id via join, scheduled_on)` for cron. |
| **Types**          | `src/types/database.ts` generated types.                                                                                                                                      |
| **TaskModal**      | Date picker (shadcn Calendar + `date-fns` or `@internationalized/date`), label from `category_type`; persist `scheduled_on`.                                                  |
| **KanbanTaskCard** | Small chip: formatted date + icon; respect density.                                                                                                                           |
| **KanbanBoard**    | Optional: sort or group by `scheduled_on`; filter “due this week” later.                                                                                                      |
| **RLS**            | Same as tasks today; no new principals.                                                                                                                                       |
| **Realtime**       | Existing `tasks` subscriptions pick up status changes after cron.                                                                                                             |

## 8. Edge cases

1. **User changes `calendar_timezone`:** Re-evaluate on next cron run; tasks may shift between Scheduled/Today once. Show admin a confirmation: “This affects when tasks move to Today.”
2. **Task moved manually to Today before the date:** Do not fight the user; optional cron rule: only auto-move if `status` is still `scheduled`.
3. **All-day date without time:** Store `date` only; never use UTC midnight for display.
4. **Missing `today` column:** No auto status change; date is display-only.

## 9. Testing checklist

- Unit tests for **label map** per `WorkspaceCategory`.
- Unit tests for **date equality** in a fixed IANA zone (use a small table of `now` mocks).
- Integration: migration applies; TaskModal saves `scheduled_on`; cron SQL/function updates rows for a fixture workspace in `America/New_York` vs `UTC`.

## 10. Phasing

| Phase  | Scope                                                                                 |
| ------ | ------------------------------------------------------------------------------------- |
| **P0** | `scheduled_on` + UI labels + card display                                             |
| **P1** | `calendar_timezone` on workspace + admin settings + cron auto-move for kids/community |
| **P2** | Filters, overdue styling, optional business/class automation if columns change        |

---

## Appendix: default column slugs (reference)

From `WORKSPACE_SEED_BY_CATEGORY`:

- **community:** `planning`, `scheduled`, `today`, `past_events`
- **kids:** `ideas_wishlist`, `scheduled`, `today`, `done`
- **business:** `todo`, `in_progress`, `review`, `done`
- **class:** `todo`, `in_progress`, `submitted`, `graded`

Auto “Scheduled → Today” applies where both **`scheduled`** and **`today`** exist and product enables automation for that workspace.
