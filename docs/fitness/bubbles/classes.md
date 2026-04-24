# Classes (bubble)

**Role:** Channel for **scheduled class instances** (enrollment, waitlist, today’s classes, history) rather than a traditional task-only Kanban.

## Seeding

The channel name **`Classes`** is defined in [`WORKSPACE_SEED_BY_CATEGORY.fitness`](../../src/lib/workspace-seed-templates.ts). The shell matches this **exact** name to mount the classes surface (see [bubbles README](README.md#name-contract-special-boards)).

## What you see

The main stage is **[`ClassesBoard`](../../src/components/fitness/ClassesBoard.tsx)**, documented in [classes-board.md](../classes-board.md). Data flows through **`DEFAULT_CLASS_PROVIDER`** in [class-providers.ts](../../src/lib/fitness/class-providers.ts) (`listInstances`, `enroll`, `unenroll`).

## Typical content

- **ClassInstance** rows bucketed into Available, Scheduled, Today, and History (see [classes-board.md](../classes-board.md)).
- Optional **calendar slot** beside the board when the shell injects the calendar rail.

## Permissions, state, and gating (this channel)

Shared **workspace/bubble** rules: [bubbles README](README.md#architecture-roles-state-and-gating). **Classes** also depends on the **class provider** (e.g. enroll must succeed server-side); the board does not add a second role matrix. If the user cannot post in chat globally, the **chat composer** is **disabled** like other channels. **Subscription** / **storefront soft-lock** behave the same as for other main-stage surfaces (overlay or `TrialPaywallGuard` when applicable).

## Gap analysis (current state)

### Key architectural distinction vs Kanban tasks

The **Classes** bubble does **not** use `public.tasks` at all. It is a separate fitness domain backed by:

- `public.class_offerings` (templates)
- `public.class_instances` (scheduled occurrences)
- `public.class_enrollments` (attendance/RSVP model)

This is why there is no `item_type === 'class'` path in `TaskModal` today.

### Data and permissions (RLS)

Defined in [20260501100000_class_domain_tables.sql](../../supabase/migrations/20260501100000_class_domain_tables.sql):

- **Read**: any workspace member can `SELECT` offerings/instances/enrollments (enrollments are readable so the UI can compute capacity counts).
- **Write (admin/owner only)**: only workspace owners/admins can insert/update/delete offerings and instances.
- **Enrollment**: members can insert/update/delete **their own** enrollment rows (`user_id = auth.uid()`).

### Immediate risks / missing pieces

- **Provider coupling**: `ClassesBoard` is hardwired to `DEFAULT_CLASS_PROVIDER` (manual Supabase implementation). Any partner integration will require a provider swap or routing mechanism.
- **Scaling**: `listInstances` loads **all enrollments in the workspace** for the returned instance ids to compute counts; this is OK for small workspaces but could get heavy without pagination or a server-side aggregate.
- **Privacy**: since all enrollments are readable by any workspace member, a member could infer who is enrolled in which class if surfaced in UI later. Currently the UI only uses counts and “my enrollment”.

## Related

- [bubbles README](README.md) for the full channel index.
