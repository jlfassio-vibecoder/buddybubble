# AnalyticsBoard

Source: [src/components/fitness/AnalyticsBoard.tsx](../../src/components/fitness/AnalyticsBoard.tsx)

Fitness **Analytics** bubble UI: after resolving the signed-in user, loads **programs** assigned to that user in the workspace, then loads **`workout`** and **`workout_log`** tasks for the **selected program** to show session counts, minutes, streak, a Monday-first week heat strip, and recent sessions.

## Props

| Prop               | Role                                                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `workspaceId`      | Scope for `bubbles` + `tasks` queries.                                                                                                                                                                                                           |
| `calendarTimezone` | Workspace IANA TZ; passed from shell as `activeWorkspace.calendar_timezone`. Drives `workoutOccurrenceYmd` bucketing to match the calendar rail (`getCalendarDateInTimeZone` from [workspace-calendar.ts](../../src/lib/workspace-calendar.ts)). |
| `calendarSlot`     | Optional rail injected by `WorkspaceMainSplit` / shell `cloneElement`.                                                                                                                                                                           |
| `taskViewsNonce`   | Refetch programs and workouts when tasks change.                                                                                                                                                                                                 |

## Data loading

1. **Auth** — `getUser()` sets `viewerUserId`; gate messaging if unauthenticated.
2. **Programs** — All bubble ids in workspace → `tasks` where `item_type === 'program'` and `task_assignees` inner join matches `viewerUserId` (limit 100, newest first).
3. **Workouts** — For `selectedProgramId`, `item_type` in `['workout','workout_log']` with same assignee filter (limit 500).

## Occurrence date

`workoutOccurrenceYmd(task, timeZone)` prefers **`scheduled_on`** (normalized to `YYYY-MM-DD` or parsed instant in TZ); otherwise falls back to **`created_at`** interpreted in the workspace calendar zone. Aligns analytics dots with calendar behavior described in source comments.

## Derived stats

- **Completed** — status `done` or `completed` (`isCompletedWorkoutStatus`).
- **Week / month** — Uses `date-fns` `startOfWeek` / `endOfWeek` with **`CALENDAR_WEEK_OPTIONS`** from [calendar-view-range.ts](../../src/lib/calendar-view-range.ts) for parity with other calendar views.
- **Streak** — Walks backward calendar days from “today” in TZ while completed-day set contains each day.
- **Minutes** — Sums `metadata.duration_min` on completed tasks (`WorkoutMeta` type in file).

## Empty and error states

- No programs assigned → instructional empty state (points users to Programs board / self-assign).
- `loadError` with no programs → destructive alert with refresh hint.

## Related docs

- [README.md](README.md)
- [programs-board.md](programs-board.md) (where programs are created and assigned)
