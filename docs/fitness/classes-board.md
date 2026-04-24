# ClassesBoard

Source: [src/components/fitness/ClassesBoard.tsx](../../src/components/fitness/ClassesBoard.tsx)

**Classes** bubble UI: four columns of **class instances** (scheduled offerings) for the current user — **Available**, **Scheduled**, **Today**, **History** — with enroll and cancel enrollment actions.

## Props

| Prop             | Role                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------- |
| `workspaceId`    | Passed to the class provider for listing and mutations.                               |
| `calendarSlot`   | Optional calendar rail from shell.                                                    |
| `taskViewsNonce` | Triggers `load()` again when tasks change (keeps board coherent with other surfaces). |

## Bucketing

`bucketInstance(inst, todayYmd)`:

- **History** — Instance date before today, or status `completed` / `cancelled`.
- **Today** — Instance date is today **and** user is `enrolled`.
- **Scheduled** — User is `enrolled` or `waitlisted` on a future instance.
- **Available** — Otherwise (upcoming, not yet enrolled).

`todayYmd` is the browser’s **local** calendar date (`YYYY-MM-DD`) for the current render, so it matches each instance’s local date from `scheduled_at` and stays aligned with the **Today** column until local midnight.

## Data and mutations

All list/enroll/unenroll operations go through **`DEFAULT_CLASS_PROVIDER`** from [class-providers.ts](../../src/lib/fitness/class-providers.ts):

- `listInstances(workspaceId, userId)`
- `enroll(instanceId, userId, workspaceId)`
- `unenroll(my_enrollment_id)`

The UI keeps **`enrollingId`** to disable per-card buttons during async work and surfaces **`error`** in a destructive banner.

## Data model (not Kanban tasks)

This surface does **not** read from `public.tasks`. It is backed by `class_offerings`, `class_instances`, and `class_enrollments` (see [20260501100000_class_domain_tables.sql](../../supabase/migrations/20260501100000_class_domain_tables.sql)).

At render-time, the board shows **ClassInstance** cards that include:

- `offering` (name, description, duration, location)
- `scheduled_at`, `capacity`, `status`, `instructor_notes`
- derived fields from provider: `enrollment_count`, `my_enrollment_status`, `my_enrollment_id`

## Permissions (RLS summary)

- Workspace members can read offerings/instances/enrollments (needed for capacity counts).
- Workspace owners/admins can create/update/delete offerings and instances.
- Any user can enroll/unenroll only themselves (enrollments are `user_id = auth.uid()` on mutate).

## Architectural bottlenecks / risks

- **No pagination**: `listInstances` reads all instances for a workspace and then reads enrollments for those instance ids. Larger workspaces may need pagination or server-side aggregation.
- **Time bucketing**: `todayYmd()` uses `new Date().toISOString().slice(0, 10)` (UTC date). This is acceptable for “rough bucketing” but will misclassify “today” near timezone boundaries; consider using workspace timezone in a later iteration.
- **Mutation refresh**: enroll/unenroll calls `load()` again. This is simple but can create extra load without optimistic updates.

## Internal UI

**`ClassCard`** (file-local) renders offering name, time, duration, location, enrollment counts/capacity, instructor notes, and action buttons with **Enrolled** / **Waitlist** / **Cancelled** chips.

## Related docs

- [README.md](README.md)
