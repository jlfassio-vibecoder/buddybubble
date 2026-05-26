# WorkoutPlayer and WorkoutPlayerTriggers

Source: [src/components/fitness/WorkoutPlayer.tsx](../../src/components/fitness/WorkoutPlayer.tsx)

Full-screen modal (**desktop**: centered Radix dialog; **mobile**: bottom sheet) for **doing** a workout: per-exercise sets, weight/reps/RPE drafts, optional detailed view with form cues, elapsed timer, and **Finish Workout** which inserts a **`workout_log`** task.

## WorkoutPlayerProps

| Prop                | Notes                                                                                                                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open` / `onClose`  | Controls visibility; closing the root calls `onClose`.                                                                                                                                                                           |
| `mode`              | Optional `'desktop'` \| `'mobile'`. If omitted, `useLayoutEffect` picks mobile when `matchMedia('(max-width: 768px)')` matches on open.                                                                                          |
| `workspaceId`       | Loads `fitness_profiles.unit_system` for this workspace and current user; passed to `WorkoutCoachRail`.                                                                                                                          |
| `workoutTitle`      | Shown in chrome; log task title becomes `` `${workoutTitle} — Log` ``.                                                                                                                                                           |
| `metadata`          | Raw `tasks.metadata` (`Json`); `useWorkoutSessionViewModel` runs inside the player so session state does not reset on parent re-renders. Rich factory cards render block sections + subtitles; flat exercises drive set logging. |
| `bubbleId`          | Inserted on the new `workout_log` row; scopes Coach rail messages to the task bubble.                                                                                                                                            |
| `sourceTaskId`      | Source **`workout`** (or compatible) task id (`null` in edge cases): copies `program_id`, `program_session_key`, `scheduled_on`, `scheduled_time`, `visibility`, and assignees onto the log row; draft recovery key.             |
| `sessionId`         | Live class session id when launched from class board; forwarded to `WorkoutCoachRail` (`null` for Kanban play).                                                                                                                  |
| `class_instance_id` | Class instance id when launched from class board; forwarded to Coach rail and draft autosave metadata.                                                                                                                           |
| `isMemberView`      | When `true`, Coach rail uses member-scoped context (class / member flows).                                                                                                                                                       |
| `canPostMessages`   | Gates Coach rail composer, attachments, and send in `WorkoutCoachRail`; shell passes workspace write permission.                                                                                                                 |
| `workoutData`       | Optional legacy flat exercise JSON for Coach rail context; player prefers live `flatExercises` from the ViewModel when non-empty.                                                                                                |
| `onComplete`        | Invoked after successful insert (e.g. shell’s `bumpTaskViews`); then `onClose` runs.                                                                                                                                             |

## Unit display

Loads `unit_system` from **`fitness_profiles`** for `(workspace_id, user_id)` via [Supabase client](../../utils/supabase/client.ts). Display uses **kg** vs **lbs** for target lines; logged set values follow what the user typed in the session UI.

## Personal cues from your coach (detailed view)

When the player is in **detailed** view, each exercise can show a second block below the catalog **Instructions / Form cues / Tips / Coach notes** content:

- **Header:** “Personal cues from your coach” — text comes from **`public.user_exercise_notes`** for the signed-in user and the exercise’s **`exercise_dictionary`** row.
- **Hydration:** [`useUserExerciseNotes`](../../src/hooks/useUserExerciseNotes.ts) calls **`exercise_dictionary_lookup_by_names`** once for the workout’s exercise names, then selects matching **`user_exercise_notes`** rows.
- **Realtime:** the hook subscribes to **`postgres_changes`** on **`user_exercise_notes`** filtered by **`user_id`**, so new Coach-written cues appear without closing the player.

Catalog copy in **`tasks.metadata`** is unchanged; personal cues are additive and user-scoped.

## Finish flow (`handleFinish`)

1. Builds `exercisePayload` from exercises plus **completed** sets only (`done === true`), including `set_logs` with parsed numbers.
2. Computes `duration_min` from the elapsed second counter.
3. Optionally loads the source task row for program linkage and assignees.
4. **`tasks.insert`** with `item_type: 'workout_log'`, `status: 'completed'`, metadata `{ duration_min?, exercises }`, and copied program/schedule/visibility fields. Rows are inserted into the **Workout Logs** bubble via [`resolveWorkoutLogsBubbleId`](../../src/lib/fitness/resolve-workout-logs-bubble-id.ts) (`logBubbleId`), not necessarily the source template’s bubble.
5. **`replaceTaskAssigneesWithUserIds`** from [task-assignees-db.ts](../../src/lib/task-assignees-db.ts) when the source had assignees.

Errors use **`toast.error`** with **`formatUserFacingError`**.

## WorkoutPlayerTriggers

Exported helper that renders **Desktop Player** and **Mobile Player** buttons; each sets forced `mode` and mounts nested **`WorkoutPlayer`**. Used from [TaskModalEditorChrome.tsx](../../src/components/modals/task-modal/TaskModalEditorChrome.tsx). Returns `null` when `buildWorkoutSessionViewModel(metadata).flatExercises` is empty (includes factory-derived exercises when rich metadata exists, memoized on `metadata`).

## Shell integration

[DashboardShell](../../src/components/dashboard/dashboard-shell.tsx) mounts a single **`WorkoutPlayer`** when **`workoutPlayerLaunch`** is set (from `KanbanBoard` **`onStartWorkout`** or class board **`handleStartWorkoutFromClass`**, after trial checks). The shell passes raw **`task.metadata`**, `bubbleId`, `sourceTaskId`, optional `sessionId` / `class_instance_id`, and `canPostMessages` from workspace permissions. The player builds the block-aware body internally via `useWorkoutSessionViewModel` — no pre-parsed exercise array is required at the shell boundary.

See also [views/layout-shell-architecture.md](views/layout-shell-architecture.md) for how the overlay relates to layout collapse / mobile tabs.

## Related docs

- [README.md](README.md)
- [workout-exercises-editor.md](workout-exercises-editor.md) (editing before play happens in task modal, not inside `WorkoutPlayer`)
- [views/parametric-step3-plan.md](views/parametric-step3-plan.md) — block-aware player P0 (shipped)

---

## Architectural assessment (updated 2026-05-20)

This section describes the **current** `WorkoutPlayer` architecture after Parametric Workout Blocks **Steps 1–3**: block-aware rendering via `WorkoutSessionViewModel`, flat-indexed set logging unchanged, and an integrated **Coach split pane**.

### Mount and entry points

- **Client component** — Radix dialog (desktop) or bottom sheet (mobile).
- **Dashboard shell** — `workoutPlayerLaunch` state; `handleStartWorkout` / `handleStartWorkoutFromClass` set payload and render `<WorkoutPlayer open … />`.
- **Task modal** — `WorkoutPlayerTriggers` mounts a nested player with forced `mode`; gate uses memoized `buildWorkoutSessionViewModel(metadata).flatExercises.length > 0`.

The overlay does not change workspace layout collapse or mobile `?tab=` (see [layout-shell-architecture.md](views/layout-shell-architecture.md)).

### State and data flow

```mermaid
flowchart TB
  META[tasks.metadata Json]
  VM[useWorkoutSessionViewModel]
  META --> VM
  VM --> SRC[source: rich | flat | empty]
  VM --> BLOCKS[blocks + subtitles]
  VM --> FLAT[flatExercises]
  FLAT --> LOGS[SetDraft matrix by global index]
  FLAT --> FINISH[handleFinish flat payload]
  FLAT --> COACH[WorkoutCoachRail workoutData]
  SRC -->|rich + blocks| BL[WorkoutPlayerBlockList]
  SRC -->|flat fallback| LIN[linear WorkoutPlayerExercisePanel list]
  BL --> PANELS[WorkoutPlayerExercisePanel per exercise]
  LIN --> PANELS
```

1. **`useWorkoutSessionViewModel(metadata)`** — memoized read model from [workout-session-view-model.ts](../../src/lib/workout-factory/workout-session-view-model.ts):
   - **`source === 'rich'`** when `ai_workout_factory.workout_set.workouts[]` is non-empty.
   - **`flatExercises`** — derived from factory via `workoutInSetToTaskExercises` when rich; else from `metadata.exercises`.
   - **`blocks[]`** — warmup / main / finisher / cooldown with `formatBlockSubtitle` per main block.
   - **`flatCacheStale`** — stored flat list differs from factory-derived list (not yet surfaced in UI).

2. **`exercises = sessionVm.flatExercises`** — single list for logs, Coach rail, personal notes, and finish.

3. **Draft recovery identity** — `exercisesStringDigest` (`JSON.stringify(exercises)`) plus `sourceTaskId` and `bubbleId` reset `logs` when exercise content changes; avoids churn from unrelated parent re-renders while still recovering when metadata content changes.

4. **Set state** — `logs: SetDraft[][]` indexed by **global exercise index** (same as flat list order). Seeded with `makeSets(ex)` on open / recovery. Unchanged finish shape: flat `metadata.exercises` + completed `set_logs` only.

5. **Unit system** — loaded from `fitness_profiles` for `(workspaceId, userId)` on open.

### Rich vs flat body rendering

`PlayerBody` chooses the scroll region:

| Condition                                                                                | UI                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sessionVm.source === 'rich'` **and** `blocks.length > 0` **and** `exercises.length > 0` | [WorkoutPlayerBlockList](../../src/components/fitness/workout-block-renderer/WorkoutPlayerBlockList.tsx) — instruction sections (warmup/finisher/cooldown) + main blocks with headers/subtitles |
| Otherwise                                                                                | Linear list of `WorkoutPlayerExercisePanel` (legacy flat path)                                                                                                                                  |

Block list maps main-block exercises to global log indices via [workout-player-exercise-index.ts](../../src/lib/workout-factory/workout-player-exercise-index.ts). **P0 only:** subtitles and extended target lines (work/rest/rounds); no AMRAP/EMOM/Tabata timers or superset pairing UX yet ([parametric-step3-plan.md § Out of scope](views/parametric-step3-plan.md#out-of-scope-step-4)).

### Split pane and Coach rail (shipped)

The player body is a **two-pane split** (`splitPaneBody`):

- **Desktop** — Coach rail left (`md:max-w-[min(38%,400px)]`), workout logging right; dialog widened (`sm:max-w-6xl`).
- **Mobile** — tabbed **Workout | Coach** (`mobileUnifiedPane`); only one pane visible at a time.

**Left pane:** [WorkoutCoachRail](../../src/components/chat/WorkoutCoachRail.tsx) with props from `WorkoutPlayer`:

| Prop                                             | Role                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `workspaceId`, `bubbleId`                        | Scoped thread context (does not rely on global bubble selection for routing)            |
| `taskId`                                         | `sourceTaskId` (empty string when null)                                                 |
| `canPostMessages`                                | Disables composer, attach, and send when false                                          |
| `sessionId`, `class_instance_id`, `isMemberView` | Class / member session context                                                          |
| `workoutTitle`, `workoutData`                    | Coach context; `workoutData` prefers live `flatExercises` over shell `workoutData` prop |
| `onApplyExecutionPatch`                          | Applies Coach `execution_patch` into `logs` by `exerciseIndex`                          |

**Right pane:** `PlayerBody` (header, exercise scroll, Cancel / Finish footer).

### Persistence

- **Workout Logs routing** — draft recovery, autosave, and finish INSERT/UPDATE target the **Workout Logs** bubble (`resolveWorkoutLogsBubbleId` → `logBubbleId`). The source template stays on the **Workouts** bubble; finish never moves the template column.
- **Draft autosave** — debounced (2s) write of `draft_logs` to an `in_progress` `workout_log` row via [`buildWorkoutLogDraftMetadata`](../../src/lib/workout-factory/build-workout-log-finish-metadata.ts); when the source workout is rich, also deep-clones `ai_workout_factory` so reload/resume from the log card keeps EMOM/Tabata structure.
- **Draft visibility** — `status: 'in_progress'` logs appear under the fitness **In Progress** Kanban column (seed + migration [`20260526000000_add_in_progress_column_fitness.sql`](../../supabase/migrations/20260526000000_add_in_progress_column_fitness.sql)) and show an amber **In progress** badge on Kanban, chat task cards, and Task Modal ([`workout-log-task-state.ts`](../../src/lib/workout-log-task-state.ts), [`WorkoutLogInProgressBadge.tsx`](../../src/components/tasks/WorkoutLogInProgressBadge.tsx)).
- **Finish** — [`buildWorkoutLogFinishMetadata`](../../src/lib/workout-factory/build-workout-log-finish-metadata.ts) on the draft or a new row: `workout_log_schema_version`, flat `exercises` + `set_logs`, factory snapshot; copies program/schedule/assignees from source task.

**Active Session** (opt-in route) uses the same draft/finish builders and Workout Logs routing via `target_bubble_id` on the session payload — see [active-session-engine-plan.md](./active-session-engine-plan.md).

### Remaining gaps (Step 4+)

Documented in [views/README.md](views/README.md) and [parametric-step3-plan.md](views/parametric-step3-plan.md):

- Interval timer shells (AMRAP / EMOM / Tabata)
- Superset / contrast paired-round UX
- Ladder / pyramid progression UI
- Block metadata on finished `workout_log`
- Shared block renderer for `RichWorkoutReadView`, deck “up next”, and live loggers
- User-visible warning when `flatCacheStale` is true
