# ScheduleProgramStartDialog

Source: [src/components/fitness/ScheduleProgramStartDialog.tsx](../../src/components/fitness/ScheduleProgramStartDialog.tsx)

Small Radix **Dialog** used when a program task needs an explicit **calendar start date** (and optional **time**) before week-one scheduling lines up with the workspace calendar.

## Props

| Prop               | Type                          | Notes                                                                                            |
| ------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `open`             | `boolean`                     | Dialog visibility.                                                                               |
| `onOpenChange`     | `(open: boolean) => void`     | Standard Radix close handling.                                                                   |
| `task`             | `TaskLike \| null`            | `id`, `title`, optional `scheduled_on`, `scheduled_time` — seeds the form when the dialog opens. |
| `calendarTimezone` | `string \| null \| undefined` | IANA zone; falls back to **`UTC`** when missing/blank.                                           |
| `saving`           | `boolean`                     | Disables inputs and submit while parent persists.                                                |
| `onSave`           | `(params) => Promise<void>`   | Receives `{ scheduledOnYmd, timeHm }` from the form submit.                                      |

`TaskLike` is a minimal shape so the parent can pass a program row without importing full `TaskRow`.

## Form behavior

- **Open effect:** When `open` and `task` are set, `scheduled_on` seeds **`dateYmd`** (first 10 chars if present). If absent, **today** in `calendarTimezone` via `getCalendarDateInTimeZone` from [workspace-calendar.ts](../../src/lib/workspace-calendar.ts).
- **`scheduled_time`:** Converted to `<input type="time">` value with `scheduledTimeToInputValue` from [task-scheduled-time.ts](../../src/lib/task-scheduled-time.ts).
- **Submit:** `scheduledOnYmd` is validated as `YYYY-MM-DD` or sent as `null` if invalid. `timeHm` is trimmed to `HH:MM` or `null` if empty (all-day calendar entry when time is empty per in-dialog copy).

## Parent responsibilities

The dialog does **not** write to Supabase itself. [ProgramsBoard](programs-board.md) opens it, then in `onSave` should update the program `tasks` row (and any follow-up sync such as linked workout schedules—see `syncProgramLinkedWorkoutSchedules` in that board’s implementation).

## Related docs

- [programs-board.md](programs-board.md) — primary caller.
- [README.md](README.md) — hub index.
