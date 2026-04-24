# Workouts (bubble)

**Role:** Default **workout card** channel on a fitness Kanban: plan sessions, move cards across Library / Scheduled / Today / Completed, and **start** in-app workout playback from the board when the task supports it.

## Seeding

The channel name **`Workouts`** is defined in [`WORKSPACE_SEED_BY_CATEGORY.fitness`](../../src/lib/workspace-seed-templates.ts). There is **no** name-based shell override for `Workouts`; it always uses the standard Kanban surface.

## What you see

The main stage is **[`KanbanBoard`](../../src/components/board/KanbanBoard.tsx)** with fitness workspace category and columns from the workspace’s `board_columns` (seeded as Library, Scheduled, Today, Completed for fitness). The shell passes `onStartWorkout` so opening a workout from the board can launch **[`WorkoutPlayer`](../workout-player.md)** (see [dashboard-shell.tsx](../../src/components/dashboard/dashboard-shell.tsx) `handleStartWorkout` / `workoutPlayerTask`).

## Typical content

- **`item_type = workout`** (and related) **task** cards with exercise metadata; members use **TaskModal** for details, comments, and the workout viewer/editor.
- **WorkoutPlayer** — when the user starts a workout from the board, the player records a **`workout_log`** task (see [workout-player.md](../workout-player.md)).

## Permissions, state, and gating (this channel)

Same **role and state** model as the rest of the app ([bubbles README](README.md#architecture-roles-state-and-gating)). **Workouts** uses the standard [KanbanBoard](../../src/components/board/KanbanBoard.tsx); task creation/editing and chat obey **`canWriteTasks`**, **`canPostMessages`**, and private-bubble `bubble_members` as elsewhere. **Starting a workout** runs through **`handleStartWorkout`**: in addition to normal permissions, the shell may **open `StartTrialModal` instead of `WorkoutPlayer`** when [shouldBlockWorkoutForExpiredMemberPreview](../../src/lib/member-trial-soft-lock.ts) is true (task on a **trial** bubble after storefront preview ended)—an explicit redirect, not a hidden control.

## Related

- [workout-viewer-dialog.md](../workout-viewer-dialog.md) and [workout-exercises-editor.md](../workout-exercises-editor.md) for editing workout definitions in the task modal.
- [bubbles README](README.md) for the full channel index.
