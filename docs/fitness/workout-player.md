# WorkoutPlayer and WorkoutPlayerTriggers

Source: [src/components/fitness/WorkoutPlayer.tsx](../../src/components/fitness/WorkoutPlayer.tsx)

Full-screen modal (**desktop**: centered Radix dialog; **mobile**: bottom sheet) for **doing** a workout: per-exercise sets, weight/reps/RPE drafts, optional detailed view with form cues, elapsed timer, and **Finish Workout** which inserts a **`workout_log`** task.

## WorkoutPlayerProps

| Prop               | Notes                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `open` / `onClose` | Controls visibility; closing the root calls `onClose`.                                                                                                                                           |
| `mode`             | Optional `'desktop'` \| `'mobile'`. If omitted, `useLayoutEffect` picks mobile when `matchMedia('(max-width: 768px)')` matches on open.                                                          |
| `workspaceId`      | Loads `fitness_profiles.unit_system` for this workspace and current user.                                                                                                                        |
| `workoutTitle`     | Shown in chrome; log task title becomes `` `${workoutTitle} — Log` ``.                                                                                                                           |
| `metadata`         | Raw `tasks.metadata` (`Json`); `metadataFieldsFromParsed` runs inside the player so session state does not reset on parent re-renders.                                                           |
| `bubbleId`         | Inserted on the new `workout_log` row.                                                                                                                                                           |
| `sourceTaskId`     | Source **`workout`** (or compatible) task id (`null` in edge cases): copies `program_id`, `program_session_key`, `scheduled_on`, `scheduled_time`, `visibility`, and assignees onto the log row. |
| `onComplete`       | Invoked after successful insert (e.g. shell’s `bumpTaskViews`); then `onClose` runs.                                                                                                             |

## Unit display

Loads `unit_system` from **`fitness_profiles`** for `(workspace_id, user_id)` via [Supabase client](../../utils/supabase/client.ts). Display uses **kg** vs **lbs** for target lines; logged set values follow what the user typed in the session UI.

## Finish flow (`handleFinish`)

1. Builds `exercisePayload` from exercises plus **completed** sets only (`done === true`), including `set_logs` with parsed numbers.
2. Computes `duration_min` from the elapsed second counter.
3. Optionally loads the source task row for program linkage and assignees.
4. **`tasks.insert`** with `item_type: 'workout_log'`, `status: 'completed'`, metadata `{ duration_min?, exercises }`, and copied program/schedule/visibility fields.
5. **`replaceTaskAssigneesWithUserIds`** from [task-assignees-db.ts](../../src/lib/task-assignees-db.ts) when the source had assignees.

Errors use **`toast.error`** with **`formatUserFacingError`**.

## WorkoutPlayerTriggers

Exported helper that renders **Desktop Player** and **Mobile Player** buttons; each sets forced `mode` and mounts nested **`WorkoutPlayer`**. Used from [TaskModalEditorChrome.tsx](../../src/components/modals/task-modal/TaskModalEditorChrome.tsx) when parsed metadata includes exercises. Returns `null` if the metadata has no exercises.

## Shell integration

[DashboardShell](../../src/components/dashboard/dashboard-shell.tsx) mounts a single **`WorkoutPlayer`** when `workoutPlayerTask` is set (from `KanbanBoard` **`onStartWorkout`** after trial checks), passing **`workoutPlayerTask.metadata`** and the task id (no pre-parsed `exercises` array).

## Related docs

- [README.md](README.md)
- [workout-exercises-editor.md](workout-exercises-editor.md) (editing before play happens in task modal, not inside `WorkoutPlayer`)
