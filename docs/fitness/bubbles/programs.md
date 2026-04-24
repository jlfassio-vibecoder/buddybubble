# Programs (bubble)

**Role:** Channel for **training programs** as Kanban cards: active programs, planning, this week’s linked workouts, history, and program templates.

## Seeding

The channel name **`Programs`** is defined in [`WORKSPACE_SEED_BY_CATEGORY.fitness`](../../src/lib/workspace-seed-templates.ts). It must keep that exact name for the shell to mount the dedicated board (see [bubbles README](README.md#name-contract-special-boards)).

## What you see

The main stage is **[`ProgramsBoard`](../../src/components/fitness/ProgramsBoard.tsx)**, documented in [programs-board.md](../programs-board.md). It replaces the generic [KanbanBoard](../../src/components/board/KanbanBoard.tsx) when the selected bubble’s name is `Programs`. Program start scheduling can open [ScheduleProgramStartDialog](../schedule-program-start-dialog.md).

## Typical content

- **`item_type = program`** tasks with metadata for duration, current week, and status.
- Workout rows linked to programs, template cards from `PROGRAM_TEMPLATES`, and operations that archive or sync child workout tasks (see [programs-board.md](../programs-board.md) and linked `src/lib/fitness` modules).

## Permissions, state, and gating (this channel)

Uses the **shared** workspace + bubble model in [bubbles README — Architecture](README.md#architecture-roles-state-and-gating). **Programs** is not a special case in `permissions.ts`: `ProgramsBoard` receives `canWrite` from the shell (from `usePermissions` → `canWriteTasks`) for mutating program and workout cards; **owner/admin** keep full access including on **private** channels. **Storefront trial soft-lock** applies when the selected context is a **trial** `bubble_type` (the default **Programs** seed is not a trial bubble). **No** extra hide rule for this name in the sidebar.

## Related

- [TaskModal](../../src/components/modals/TaskModal.tsx) for editing program and workout cards.
- [bubbles README](README.md) for the full channel index.
