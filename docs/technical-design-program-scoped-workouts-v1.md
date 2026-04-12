# Technical design: program-scoped workouts (`program_id`) and per-user program analytics

## 1. Summary

Today, program-generated workouts are associated with a program mainly via **JSON metadata** (`linked_program_task_id`, `program_session_key`) while **`bubble_id`** still points at the Workouts (or other) bubble. The Programs board’s “This week” list is driven by **calendar range + workspace-wide tasks**, not by program identity or assignee, so workouts do not “move with” a program in a queryable, analytics-friendly way.

This design introduces a **first-class, relational link** from workout-shaped tasks to their parent **program task**, uses existing **`assigned_to`** so programs are assignable to the workspace owner or **invited members** (same model as other cards), and scopes **“This week”** and **analytics** to **one user ↔ one active program** at a time. The **Workouts** bubble remains the primary execution surface; **Programs** is the lifecycle and analytics anchor.

---

## 2. Goals

1. **Relational integrity**: Every workout / workout_log that belongs to a program is keyed by a stable **`program_id`** (FK to the program row), not only by metadata.
2. **Assignability**: Program tasks use **`tasks.assigned_to`** (existing column) so a program can be owned by the BuddyBubble tenant (workspace owner) or **any member**, consistent with other task cards.
3. **Analytics-ready**: Dashboards filter by **`program_id`** and **viewer identity** (the assignee’s data only — not a workspace-wide aggregate for personal fitness analytics).
4. **One active program per user**: A single user may have **at most one** program in an “active” state (in progress) at a time within a workspace; starting another must **resolve** the prior one (complete, pause, or reassign — product-defined).
5. **Behavioral clarity**: When a program completes or archives, define consistent rules for dependent workouts (see §11.3).
6. **Compatibility**: Migrate existing rows that already store `linked_program_task_id` in metadata.
7. **Social / private workspaces**: Invited members participate in their **assigned** program; analytics are **per user**, not pooled across members.

## 3. Non-goals (this phase)

- Full **temporal versioning** of program definitions (v2 program schema while v1 workouts exist).
- Cross-workspace program portability.
- Replacing `metadata` entirely (structured columns reduce ambiguity; JSON can remain for exercises, AI payloads, etc.).
- **Aggregate “team” analytics** across all members (optional future product; v1 is per-assignee).

---

## 4. Current state (baseline)

| Area            | Behavior                                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Link            | `upsert-program-workout-tasks` writes `linked_program_task_id` + `program_session_key` in **`metadata`**.                                                   |
| Assignee        | `tasks.assigned_to` exists but program flows may not yet treat program cards as first-class assignable in all UIs.                                          |
| Programs UI     | “This week → On the board” loads **all** `workout` / `workout_log` in the workspace with **`scheduled_on` in range**; **no** filter on program or assignee. |
| `activeProgram` | Picks one program among `isActiveProgram` candidates by **latest `created_at`**, ignoring assignee.                                                         |

**Gap**: Metadata is not indexed for analytics, does not enforce parent `item_type = 'program'`, and does not align “this week” or analytics with **who the program is for**.

---

## 5. Proposed data model

### 5.1 Column: `tasks.program_id`

Add to `public.tasks`:

```sql
program_id uuid null references public.tasks (id) on delete <policy>;
```

**Semantics**

- **`program_id`**: The program **task** this row belongs to (parent is `item_type = 'program'`).
- **`NULL`**: Standalone workout / log / generic task with no program.

**Referential policy**

| `ON DELETE`  | Use when                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| **RESTRICT** | Cannot delete a program row while children exist (prefer **soft-delete** program via `archived_at`).          |
| **SET NULL** | Hard-delete program clears link but keeps workouts (audit); rarely needed if programs are never hard-deleted. |

Recommended: **`ON DELETE RESTRICT`** for program rows, with product rule that programs are ended via **status / metadata** and **`archived_at`**, not hard delete.

**Constraint**

- Trigger or deferred check: when `program_id` is not null, referenced row must have `item_type = 'program'`.

### 5.2 Optional: `program_session_key` column

For idempotent upserts and per-session analytics:

```sql
program_session_key text null
```

Partial unique index on `(program_id, program_session_key)` where both are non-null (and scoped to `item_type` in `('workout','workout_log')` as appropriate).

### 5.3 Assignee: `tasks.assigned_to` (existing)

No new column required. **Program tasks** (`item_type = 'program'`) should be assignable in the Task modal / board to:

- Workspace owner, or
- Any workspace member with access to the bubble

Same patterns as other cards. **Workout** rows created for a program should inherit policy clarity:

- **Recommendation**: Set **`assigned_to` on program-linked workouts** to match the **program’s `assigned_to`** at creation time; updates to program assignee may optionally cascade (product decision; v1 can require manual alignment or a one-time sync when assignee changes).

### 5.4 Indexes (analytics + UI)

- `create index ... on tasks (program_id) where program_id is not null;`
- `create index ... on tasks (program_id, scheduled_on) where archived_at is null;`
- For per-user program lookup: index program tasks on `(bubble_id, assigned_to, item_type)` or workspace-scoped equivalent via join to `bubbles`.

---

## 6. Invariants (product + engineering)

1. **Program-scoped workouts**: If `program_id` is set, **`metadata.linked_program_task_id`** (if present) must equal `program_id` during transition; later deprecate duplicate in metadata.
2. **Bubble placement**: `bubble_id` may still be the **Workouts** bubble for Kanban/calendar UX; **`program_id`** defines program ownership for Programs views and analytics.
3. **Programs bubble**: The **program task** lives in the Programs bubble; child workouts remain addressable via **`program_id`** without requiring `bubble_id` to match the Programs bubble.
4. **“Move with program”**: **Data association** (`program_id`, assignee) drives queries; physical bubble moves are independent unless product adds explicit “move children” behavior.

---

## 7. One active program per user (workspace-scoped)

**Rule**: For a given **user** (`assigned_to = user_id`) within a **workspace**, at most **one** program task may be in an **active / in-progress** state (e.g. `isActiveProgram` as defined in app: not finished, `current_week > 0` or status `in_progress`).

**Enforcement (phased)**

1. **P0 — Application**: On “Start week 1” (or equivalent), query for other active programs with same `assigned_to` in the same workspace (via program’s bubble → `workspace_id`); block or prompt to complete/pause the existing one.
2. **P1 — Database** (optional): Partial unique index or constraint on program tasks — requires a stable definition of “active” in SQL (e.g. generated column or check on `metadata->current_week`); only if definitions stabilize.

**Analytics implication**: With this rule, **“the active program for user U”** is unambiguous at most once, which simplifies filters.

---

## 8. Application changes (high level)

| Layer                                       | Change                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Upsert** (`upsert-program-workout-tasks`) | Set `program_id` + `program_session_key`; copy **program `assigned_to`** to new workout rows when appropriate.                                                                                                                                                                                                                                                                   |
| **Task modal**                              | Program type: ensure **Assign** UI parity with other cards; validation for one-active-program-per-user on save/start.                                                                                                                                                                                                                                                            |
| **Programs board — “This week”**            | **Resolved (§11.1)**: Scope **“On the board”** to workouts with **`program_id = activeProgramForViewer.id`**, where **`activeProgramForViewer`** is the single active program **assigned to the current user** (`assigned_to = auth.uid()`). Keep a **workspace-wide** workout view on the **Workouts** Kanban / calendar (existing breadth), not on the Programs board default. |
| **Analytics dashboard**                     | **Resolved (§11.2)**: Filter by **selected program** and **current user as assignee** — metrics reflect **that user’s** sessions/logs for **that** program only (no cross-member aggregate in v1).                                                                                                                                                                               |
| **Types**                                   | Regenerate Supabase types; extend `TaskRow` with `program_id`.                                                                                                                                                                                                                                                                                                                   |

---

## 9. Analytics dashboard (contract)

**Query pattern**

- Resolve workspace and user (assignee).
- Program dimension: `tasks.id` where `item_type = 'program'` and `assigned_to = :viewer` (when viewing “my” analytics).
- Child facts: `tasks.program_id = :programId` and `assigned_to` consistent with program (or trust `program_id` join to program row for assignee).
- Aggregate: counts, volume, completion, week boundaries — **never** mix assignees in v1 personal views.

**Multi-member workspace**: Owner and members each have **their own** program assignments and **their own** analytics series when they open the dashboard.

---

## 10. Migration plan

1. Add nullable columns `program_id`, optionally `program_session_key`.
2. Backfill:  
   `UPDATE tasks SET program_id = (metadata->>'linked_program_task_id')::uuid`  
   where valid and parent is `item_type = 'program'`.
3. Validate: rows with mismatched or missing parents.
4. Deploy app to write both column and metadata.
5. Later: stop writing duplicate in metadata.

**Do not** reset databases; run against real data in a controlled migration.

---

## 11. Resolved product decisions

### 11.1 This week scope (Programs board vs Workouts bubble)

**Context**: Private/social workspaces where the owner invites members; members can be on the **same** fitness journey with **individually assigned** program cards.

**Decision**

| Surface                                           | Scope                                                                                                                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Programs board — “This week” → “On the board”** | **Active program for the current user only**: `program_id` references the program task where **`assigned_to` = current user** and that program is the user’s **single** active in-progress program (see §7). |
| **Workouts bubble / main Kanban**                 | **Workspace-wide** scheduled workouts as today (all assignees, all program or non-program), so users still see the full board/calendar.                                                                      |
| **Non-program workouts**                          | **Excluded** from the Programs board “On the board” strip by default (no `program_id`); they remain visible on the Workouts board.                                                                           |

Rationale: Programs board stays **program-centric and personal**; the Workouts bubble remains the **shared execution layer** for everything scheduled this week.

### 11.2 Multiple programs, members, and analytics

**Decision**

- **Assignment is the filter**: Program cards use **`assigned_to`** (owner or member).
- **Analytics**: **One program, one user, one analytics series** — selecting a program in the dashboard shows data **for that program** scoped to **that program’s assignee** (the viewing user when viewing their own data).
- **Concurrency**: **One active program per user** at a time (§7); avoids ambiguous “which program is mine this week?” and keeps `activeProgramForViewer` deterministic.

### 11.3 Completing a program (child workouts)

**Decision** (recommended approach)

1. **`program_id` is immutable** on historical workout and workout_log rows (audit trail; analytics stay correct after completion).
2. **Optional bulk-archive**: When a program moves to **completed** / History, offer or automatically **`archived_at`** on **child** workout cards that are still open in the Workouts bubble for Kanban cleanliness — **without** clearing `program_id`.
3. **Do not** mass-delete child rows; prefer archive + frozen link.

---

## 12. RLS and security

- Existing policies are **bubble-scoped**; `program_id` does not replace `bubble_id` for access control.
- Members may only see program/workout rows permitted by bubble membership and role.
- Analytics queries must still respect **member vs owner** visibility (only aggregate personal metrics for the authenticated user unless a future “coach” role is introduced).

---

## 13. Rollout phases

| Phase  | Deliverable                                                                                                                         |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **P0** | DB columns + backfill + upsert writes `program_id`; program assignee UX parity where missing.                                       |
| **P1** | Programs board “This week” filters by **`activeProgramForViewer`** + `program_id`; one-active-program-per-user validation on start. |
| **P2** | Analytics: program picker + per-assignee series; optional archive children on program complete.                                     |
| **P3** | Deprecate redundant metadata fields; document API for consumers.                                                                    |

---

## 14. Success criteria

- 100% of newly generated program workouts have **`program_id`** set.
- Programs board “On the board” shows only **current user’s** active-program workouts for the week (plus plan from that program).
- Analytics for a selected program show **only that program’s assignee’s** data in v1 personal views.
- Enforcing **one active program per user** does not regress invited-member flows.
- Standalone workouts remain **`program_id IS NULL`** and visible on the Workouts surface.

---

## 15. Open questions (remaining)

- **Paused programs**: Do we add an explicit `paused` status/metadata flag, or is “not active” only complete vs not-started?
- **Assignee change mid-program**: Cascade `assigned_to` on children, or forbid until complete?
- **Coach / trainer read-only view** of a member’s program analytics (future).
