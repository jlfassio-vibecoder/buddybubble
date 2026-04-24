# ProgramsBoard

Source: [src/components/fitness/ProgramsBoard.tsx](../../src/components/fitness/ProgramsBoard.tsx)

Large Kanban-style surface for **fitness program** tasks in the **Programs** bubble: active programs, planning, **this week** workout cards, history, and **templates** (including built-ins from `PROGRAM_TEMPLATES` in [program-templates.ts](../../src/lib/fitness/program-templates.ts)). It coordinates scheduling, program removal/archival, child workout tasks, and opening the task modal for edits.

## Props (shell contract)

| Prop                              | Role                                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `workspaceId`                     | Workspace scope for queries.                                                                                                                                       |
| `selectedBubbleId`                | Programs bubble id (must match Programs channel selection from shell).                                                                                             |
| `bubbles`                         | Workspace bubbles — bubble picker on cards, parity with main Kanban.                                                                                               |
| `workspaceCategory`               | Template styling / date labels (from effective kanban category).                                                                                                   |
| `calendarTimezone`                | Week bounds and scheduled dates (`getProgramDaysForWeek`, `workspaceCalendarWeekYmdBounds` from [program-schedule.ts](../../src/lib/fitness/program-schedule.ts)). |
| `calendarSlot`                    | Injected calendar rail from shell (`cloneElement`).                                                                                                                |
| `taskViewsNonce`                  | Refetch when shell bumps task views.                                                                                                                               |
| `onOpenTask` / `onOpenCreateTask` | Delegates to `TaskModal` / create flows.                                                                                                                           |
| `canWrite`                        | Gates mutations and destructive controls.                                                                                                                          |

## Column model (conceptual)

The board defines logical areas including (names from source constants):

- **`programs`** — Active / planned program cards with status derived from metadata (`programDurationWeeks`, `programCurrentWeek`, completion) via `metadataFieldsFromParsed` / `parseTaskMetadata` from [item-metadata.ts](../../src/lib/item-metadata.ts).
- **`planned`**, **`this_week`**, **`history`** — Program-adjacent and week-scoped workout task columns using workspace week boundaries and `taskColumnIsCompletionStatus` from [kanban-column-semantic.ts](../../src/lib/kanban-column-semantic.ts).
- **`templates`** — Dismissible template cards backed by `PROGRAM_TEMPLATES` and localStorage (`programsBoardDismissedTemplateIdsStorageKey` in [layout-collapse-keys.ts](../../src/lib/layout-collapse-keys.ts)).

Collapsed column ids persist per workspace+bubble (`programsBoardCollapsedColumnsStorageKey`).

## ScheduleProgramStartDialog

When a program needs a start date/time, the board sets `scheduleDialogTask` and renders [ScheduleProgramStartDialog](schedule-program-start-dialog.md). On save, the parent updates the task’s `scheduled_on` / `scheduled_time` and runs follow-up sync (see below).

## Notable lib dependencies

| Module                                                                                       | Role in board                                                                                                                                                |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [remove-program-task.ts](../../src/lib/fitness/remove-program-task.ts)                       | `archiveProgramAndAllChildTasks`, `archiveProgramTaskOnly`, `endProgramKeepingHistory`, `programHasAssociatedData` — removal/end flows with confirmation UX. |
| [archive-program-child-workouts.ts](../../src/lib/fitness/archive-program-child-workouts.ts) | Archives open child workouts when collapsing a program week.                                                                                                 |
| [sync-program-workout-schedules.ts](../../src/lib/fitness/sync-program-workout-schedules.ts) | Keeps linked workout task dates aligned with program state.                                                                                                  |
| [active-program-for-user.ts](../../src/lib/fitness/active-program-for-user.ts)               | Guards against conflicting active programs for the same user in a workspace.                                                                                 |

## UI building blocks

Uses **`KanbanColumnHeader`**, **`KanbanTaskCard`**, **`CollapsedColumnStrip`** like the main board, plus `useBoardColumnDefs` and `useTaskBubbleUps` for week workout cards.

## Related docs

- [schedule-program-start-dialog.md](schedule-program-start-dialog.md)
- [README.md](README.md)
