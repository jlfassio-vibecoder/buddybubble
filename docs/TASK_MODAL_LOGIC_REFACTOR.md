# TaskModal logic & state refactor assessment

This document assesses **business logic and state** in [`src/components/modals/TaskModal.tsx`](../src/components/modals/TaskModal.tsx). It intentionally ignores JSX layout and extracted presentational components.

## Heaviest logic blocks (by size & coupling)

Ordered by maintenance risk and line mass in the current file:

1. **`saveCoreFields` (async, ~lines 985–1324)** — Single largest block. Computes effective status via `promotedStatusForScheduledOnToday` and `alignStatusWithFutureSchedule`, diffs against `originalRef` to append `activity_log` entries, builds `metadataForSave`, then performs `tasks.update` with layered **schema-migration fallbacks** (`isMissingColumnSchemaCacheError` for `scheduled_time`, `scheduled_on`, `priority`, `visibility`), each path mutating activity log, local state, `originalRef`, and sometimes calling `loadTask`. Program completion triggers `archiveOpenChildWorkoutsForProgram`.
2. **`createTask` (async, ~lines 1326–1442)** — Insert with `position` discovery, same calendar/status helpers as save, `metadataForSave`, and parallel **missing-column retry** branches for insert.
3. **`handlePersonalizeProgram` (async `useCallback`, ~lines 597–795)** — Auth, `hasOtherActiveProgramForUserInWorkspace`, `postPersonalizeProgram`, Kanban slug resolution, `upsertProgramWorkoutTasks`, activity diffing, `tasks.update`, `syncProgramLinkedWorkoutSchedules`, optional `archiveDuplicateProgramsFromSameTemplate`, then `loadTask`. Dependency array is already large (~25 entries).
4. **`applyRow` + `loadTask` + open/taskId reset `useEffect`** — `applyRow` maps a `TaskRow` into ~20 state fields and refreshes `originalRef`. The reset effect (create-mode branch ~lines 799–843) duplicates the inverse: clearing the same fields. Together they define the modal’s **hydration contract**.
5. **`coreDirty` `useMemo` (~lines 1718–1757)** — Compares live fields + stringified `metadataForSave` to `originalRef` (and create-mode heuristics). Tightly coupled to whatever `saveCoreFields` considers persisted.

Smaller but non-trivial: **`handleAiGenerateWorkout`**, **`archiveTask`**, attachment/card-cover CRUD, comment user hydration effect, AI workout progress interval effect, realtime channel effect.

---

## 1. State & logic inventory

Grouped by responsibility. Line references are approximate (file ~2.7k lines).

### Presence & workspace context (cross-cutting)

| Kind            | Names                                                                    | Role                                                                                                                       |
| --------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Store selectors | `updateFocus` (`usePresenceStore`), `activeBubble` (`useWorkspaceStore`) | First `useEffect`: when modal opens/closes or `taskId` changes, updates presence focus (`task`, `bubble`, or `workspace`). |

### Ephemeral UI / navigation

| Kind          | Names                                                     | Role                                                                                                               |
| ------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `useState`    | `tab`, `viewMode`                                         | Tab strip + `comments-only` inspector mode; `selectTab` forces `full` when leaving comments in comments-only mode. |
| `useState`    | `loading`, `saving`, `archiving`, `error`                 | Global modal busy/error surface; `saving` reused for long writes and uploads.                                      |
| `useState`    | `templatePickerOpen`, `workoutViewerOpen`                 | Template accordion / workout viewer dialog visibility.                                                             |
| `useRef`      | `workoutViewerAutoOpenedRef`                              | One-shot guard for `initialOpenWorkoutViewer`.                                                                     |
| `useCallback` | `selectTab`                                               | Tab + viewMode coupling.                                                                                           |
| `useEffect`   | open + `initialViewMode` / `initialTab`                   | Hydrates `viewMode`/`tab` when opening (create vs edit).                                                           |
| `useEffect`   | open + `taskId` + `initialCreateStatus` + `defaultStatus` | Sets initial Kanban `status` in create mode.                                                                       |

### Core form state (task row + scheduling + assignment)

| Kind       | Names                                        | Role                                                                               |
| ---------- | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `useState` | `title`, `description`, `status`, `priority` | Primary editable row fields.                                                       |
| `useState` | `scheduledOn`, `scheduledTime`               | Date/time inputs; time cleared when date cleared (also done in section callbacks). |
| `useState` | `itemType`, `visibility`, `assignedTo`       | Type switcher, portal visibility, assignee.                                        |
| `useState` | `workspaceMembersForAssign`                  | Options for assignee `<select>` (loaded from `workspace_members` + `users`).       |

### Typed metadata “mirror” fields (JSON + per-type columns in UI)

These duplicate structured data that ultimately flows through `buildTaskMetadataPayload` / `parseTaskMetadata`:

| Kind       | Names                                                                                                | Role                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `useState` | `metadata`                                                                                           | Raw JSON blob from DB; merged/patched by AI workout, viewer apply, card cover flows. |
| `useState` | `eventLocation`, `eventUrl`, `experienceSeason`, `experienceEndDate`, `memoryCaption`                | Event / experience / memory fields.                                                  |
| `useState` | `workoutType`, `workoutDurationMin`, `workoutExercises`                                              | Workout composition.                                                                 |
| `useState` | `programGoal`, `programDurationWeeks`, `programCurrentWeek`, `programSchedule`, `programSourceTitle` | Program planner fields.                                                              |
| `useState` | `cardCoverPath`, `cardCoverAiHint`, `cardCoverPresetId`                                              | Cover image path + AI generation inputs.                                             |
| `useMemo`  | `metadataForSave`                                                                                    | Single derived payload from all of the above + `itemType`.                           |

### Dirty snapshot & validation

| Kind      | Names         | Role                                                                                                                                                                                                                 |
| --------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useRef`  | `originalRef` | Snapshot after load/save: title, description, status, priority, scheduled date/time, itemType, stringified metadata payload, visibility, assignee. Used by `saveCoreFields` for activity diffing and by `coreDirty`. |
| `useMemo` | `coreDirty`   | Create-mode “any meaningful input” vs edit-mode field-by-field + `metadataForSave` JSON equality.                                                                                                                    |

**Inline validation** (no separate schema module): e.g. `createTask` requires `title.trim()`; `handlePersonalizeProgram` requires title and duration weeks; `uploadCardCover` checks image filename; various early returns when `!canWrite` or missing `taskId`.

### Board / calendar derived inputs (read-mostly)

| Kind      | Names                                            | Role                                                                                                 |
| --------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Hook      | `useBoardColumnDefs(workspaceId)`                | Drives `statusOptions`, `defaultStatus`, `statusSelectOptions`, and calendar alignment helpers.      |
| `useMemo` | `hasTodayBoardColumn`, `hasScheduledBoardColumn` | Passed into `saveCoreFields` / `createTask` / `handlePersonalizeProgram` for status promotion rules. |

### Fitness: unit system & templates

| Kind        | Names                                      | Role                                                        |
| ----------- | ------------------------------------------ | ----------------------------------------------------------- |
| Hook        | `useWorkoutTemplates(workspaceId \| null)` | Only when `isWorkoutItemType && !taskId`.                   |
| `useEffect` | open + `isWorkoutItemType` + `workspaceId` | Loads `fitness_profiles.unit_system` → `workoutUnitSystem`. |

### AI & fitness orchestration

| Kind          | Names                                         | Role                                                                                                  |
| ------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `useState`    | `aiWorkoutGenerating`, `aiWorkoutProgressIdx` | Progress message index; interval advances every 15s while generating.                                 |
| `useEffect`   | `aiWorkoutGenerating`                         | Resets/advances `aiWorkoutProgressIdx`.                                                               |
| `useCallback` | `handleAiGenerateWorkout`                     | `postGenerateWorkoutChain`; mutates title/description/exercises/type/metadata (`ai_workout_factory`). |
| `useMemo`     | `viewerWorkoutSet`                            | Reads optional embedded factory set from metadata for `WorkoutViewerDialog`.                          |
| `useCallback` | `handleWorkoutViewerApply`                    | Applies viewer edits; strips `ai_workout_factory` from metadata.                                      |
| `useCallback` | `applyWorkoutTemplate`                        | Prefills from template metadata; closes picker.                                                       |
| `useState`    | `aiProgramPersonalizing`                      | Loading flag for program personalization.                                                             |
| `useCallback` | `handlePersonalizeProgram`                    | Full personalize pipeline (see “Heaviest blocks”).                                                    |
| `useState`    | `aiCardCoverGenerating`                       | Card cover AI generation.                                                                             |
| Async fn      | `generateCardCoverWithAi`                     | `postGenerateCardCover`; updates path + metadata + `originalRef.metadataJson`.                        |

### Embedded collections (JSON columns on `tasks`)

| Kind       | Names                                                | Role                                                                                |
| ---------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `useState` | `subtasks`, `comments`, `activityLog`, `attachments` | Loaded via `applyRow`; updated by add/toggle/remove/upload handlers.                |
| `useState` | `newComment`, `newSubtaskTitle`                      | Draft inputs for add flows.                                                         |
| `useState` | `commentUserById`                                    | Denormalized display map; filled by effect fetching `users` for comment author ids. |

### Mutations & persistence (Supabase + storage)

| Async / callback                                       | Responsibility                                                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `loadTask`                                             | `tasks` select by id; `applyRow` or set error.                                                 |
| `saveCoreFields`                                       | Main row update + activity + metadata + migration fallbacks + optional program child archival. |
| `createTask`                                           | Insert + retries + `onCreated`.                                                                |
| `archiveTask`                                          | Soft-archive; program → `archiveOpenChildWorkoutsForProgram`; close + `onTaskArchived`.        |
| `addComment`, `addSubtask`, `toggleSubtask`            | Optimistic UUID rows; `tasks.update` JSON columns.                                             |
| `uploadAttachment`, `removeAttachment`, `downloadLink` | Storage + `attachments` JSON.                                                                  |
| `uploadCardCover`, `removeCardCover`                   | Storage + `metadata` patch + `originalRef` metadata string.                                    |

### Realtime synchronization

| `useEffect` | Subscribes to `postgres_changes` on `public.tasks` filtered by `id=eq.${taskId}`; on UPDATE calls `loadTask(taskId)`. Cleanup removes channel. |

### External hooks (logic-adjacent)

| Hook               | Role                                                                           |
| ------------------ | ------------------------------------------------------------------------------ |
| `useTaskBubbleUps` | `bubbleUpPropsFor(taskId)` for footer bubble-up control (depends on `taskId`). |

### Refs tied to DOM (logic uses them)

| `useRef` | `cardCoverFileInputRef` | Programmatic click for file picker; not business state but coupled to upload handlers. |

---

## 2. Custom hook architecture proposal

Goal: **slice by domain** while keeping a thin orchestration layer (either `TaskModal` or a single `useTaskModalController`) that wires shared inputs (`workspaceId`, `taskId`, `open`, `canWrite`, etc.).

Suggested hooks and responsibilities:

### `useTaskModalPresence({ open, taskId, activeBubbleId, updateFocus })`

- Owns the focus `useEffect` only.
- **Returns:** nothing (side effect only) or a small debug object.

### `useWorkspaceAssignees({ open, workspaceId })`

- Loads `workspaceMembersForAssign` (current assignee loader effect).
- **Returns:** `{ workspaceMembersForAssign }` and optionally a `refresh` if ever needed.

### `useTaskModalNavigation({ open, taskId, initialTab, initialViewMode, initialCreateStatus, defaultStatus })`

- Owns `tab`, `viewMode`, `selectTab`, and the effects that set tab/view/status for create vs edit.
- **Returns:** `{ tab, viewMode, selectTab, setTab, setViewMode }` (only export what JSX needs).

### `useWorkoutUnitSystem({ open, workspaceId, isWorkoutItemType })`

- Fetches fitness profile unit system.
- **Returns:** `{ workoutUnitSystem, setWorkoutUnitSystem }` (setter still needed for create reset).

### `useTaskFormModel` (or split into `useTaskCoreFields` + `useTaskMetadataFields`)

**Option A — single hook:** Holds all `useState` fields that participate in `metadataForSave`, `applyRow`, and create reset; exposes grouped setters or a reducer dispatch.

**Option B — split:**

- `useTaskCoreFields`: title, description, status, priority, scheduledOn/Time, itemType, visibility, assignedTo.
- `useTaskItemMetadataState`: event/experience/memory/workout/program/card cover mirror fields + `metadata`.

**Returns (combined):** state values, setters, `metadataForSave`, helpers `resetForCreate(initials)`, and `hydrateFromRow(row)` (extracted from `applyRow`).

### `useTaskOriginalSnapshot`

- Wraps `originalRef` + `setOriginalFromRow` / `clearOriginal` logic used by `applyRow`, `saveCoreFields`, card cover uploads, and `coreDirty`.
- **Returns:** `{ originalRef, setOriginalFromAppliedRow, patchOriginalMetadataJson, clearOriginal }`.

### `useTaskDirtyState({ originalRef, isCreateMode, metadataForSave, ...core getters })`

- Implements `coreDirty` `useMemo`.
- **Returns:** `{ coreDirty }`.

### `useTaskLoadAndRealtime({ open, taskId, hydrateFromRow, onResetCreate })`

- `loadTask`, Supabase channel subscription, and the large `useEffect` that branches create vs edit (could call `onResetCreate` from a small internal hook).
- **Returns:** `{ loading, error, setError, loadTask }`.

### `useTaskMutations` (or split save vs collections)

**`useTaskSaveAndCreate`** — `saveCoreFields`, `createTask`, and all `isMissingColumnSchemaCacheError` branches. Depends on: supabase client pattern, `metadataForSave`, calendar helpers, `boardColumnDefs`, `activityLog`, `originalRef`, field getters, `loadTask`, `set*` updaters.

**`useTaskEmbeddedCollections`** — comments, subtasks, attachments, card cover file ops, `commentUserById` effect, `addComment`, `addSubtask`, `toggleSubtask`, attachment/card CRUD.

**`useTaskArchive`** — `archiveTask` + `archiving` state.

Alternatively one `useTaskMutations` returns namespaced objects: `{ save: { saveCoreFields, saving, setSaving }, create: { createTask }, archive: { archiveTask, archiving }, collections: { ... } }` to keep import surface predictable.

### `useTaskWorkoutAi` (fitness + viewer)

- State: `templatePickerOpen`, `aiWorkoutGenerating`, `aiWorkoutProgressIdx`, `workoutViewerOpen`, `workoutViewerAutoOpenedRef`.
- Logic: AI interval effect, `handleAiGenerateWorkout`, `applyWorkoutTemplate`, `viewerWorkoutSet`, `handleWorkoutViewerApply`, effects for closing viewer on open change and auto-open from `initialOpenWorkoutViewer`.
- **Returns:** everything `TaskModalWorkoutFields`, `WorkoutViewerDialog`, and template picker need.

### `useTaskProgramPersonalization`

- `aiProgramPersonalizing`, `handlePersonalizeProgram` only (large dependency surface → see section 3).

### `useTaskCardCoverAi`

- `aiCardCoverGenerating`, `generateCardCoverWithAi` (could merge with collections hook if preferred).

### `useWorkoutTemplates` stays as-is\*\* — already a dedicated hook; controller only passes `workspaceId` gate.

---

## 3. Dependency & re-render strategy

### Why dependency arrays hurt today

- `handlePersonalizeProgram` reads **most** of the form surface area (program fields, metadata mirrors, activity log, visibility, calendar flags) and calls **many** async steps. Any extracted hook that mirrors this as a single `useCallback` will inherit a long dependency list unless the **data model is grouped**.
- `metadataForSave` already centralizes derivation but **consumers** (`saveCoreFields`, `coreDirty`, uploads) still list individual fields in their logic or closures.
- `saveCoreFields` is not memoized; it closes over latest state. That avoids `useCallback` deps but makes extraction into a hook **require** either stable parameters or a ref-based latest snapshot.

### Should core form state become `useReducer`?

**Yes, as an optional middle step—not mandatory for every field.**

Recommended approach:

1. **Reducer for “hydratable document”** — One state object (or two: `core` + `metadataMirror`) representing everything `applyRow` writes and the create-reset clears. Actions like `HYDRATE_FROM_ROW`, `RESET_CREATE`, `PATCH_METADATA`, `APPLY_WORKOUT_VIEWER`. Benefits: `applyRow` becomes a pure reducer + `originalRef` update in one place; fewer stale-closure bugs when splitting hooks.
2. **Keep ephemeral UI flags in `useState`** — tab, dialogs, AI spinners, template picker; they churn independently and should not force reducer churn.
3. **Use refs for “latest snapshot for async work”** where appropriate — e.g. `saveCoreFields` could read `latestFieldsRef.current` updated in an effect to shrink dependency arrays **if** you convert it to `useCallback` for testing. Tradeoff: must discipline updates so async paths never read stale data.

### Preventing “dependency array nightmares” after split

- **Pass stable, grouped objects** into mutation hooks: e.g. `form: TaskFormModel` from context or a single `useTaskFormModel` return value whose identity changes only when needed (or use `useReducer` so dispatch is stable).
- **Colocate effects with the state they mutate** — assignee load stays with assignee state; comment user map with comments.
- **Extract pure functions to modules** — status/schedule computation, activity diff building, and “update payload with fallback” could live in `task-modal/save-core-fields.ts` with unit tests; hooks only glue Supabase.
- **Avoid splitting `saveCoreFields` across hooks** until pure helpers exist; it is the riskiest seam.

### Re-render notes

- Many `useState` slices cause **broad re-renders** of the modal subtree; a reducer does not automatically fix that unless combined with **context splitting** or passing props only to subtrees. For this refactor phase, **correctness and testability** matter more than render optimization unless profiling shows pain.

---

## 4. Phased execution plan (PR-sized, low regression risk)

### Phase 1 — Pure extraction + typing (no behavior change)

- Move **pure helpers** out of the component: scheduled value normalization, activity diff construction fragments (if any can be isolated), and small guards reused by save/create.
- Add **`applyRow` / create-reset** parity tests or a single “hydrate + reset” test module that asserts field mapping given a fixture `TaskRow` (even if initially run as dev-only or Vitest if present).
- **Outcome:** `TaskModal.tsx` shrinks mentally; zero UX change.

### Phase 2 — `useTaskLoadAndRealtime` + `useWorkspaceAssignees` + `useWorkoutUnitSystem`

- Extract the three **isolated effect clusters** with clear inputs/outputs (assignees, fitness unit, load + postgres channel + open/taskId reset).
- Keep all state in the parent initially; hooks receive `setState` callbacks or return setters to avoid moving state twice.
- **Outcome:** Easier to reason about subscriptions; still one main state owner.

### Phase 3 — `useTaskWorkoutAi` + `useTaskProgramPersonalization` (+ optional `useTaskCardCoverAi`)

- Move AI workout generation, progress ticker, template apply, viewer apply, viewer open effects, and program personalize handler into dedicated hooks **co-located under** e.g. `src/components/modals/task-modal/hooks/`.
- Feed them **minimal props** (ids, flags, dispatch/setters for fields they mutate).
- **Outcome:** Removes two of the largest cognitive blocks from the main file; dependency lists stay local to each hook.

### Phase 4 — `useTaskSaveAndCreate` + snapshot/`coreDirty` module

- Introduce `useTaskOriginalSnapshot` + `useTaskDirtyState` (or reducer-based form model) and port **`saveCoreFields`** / **`createTask`** into a mutation hook backed by extracted **pure builders** for update/insert payloads and fallback paths.
- Consider **`useCallback`** for save/create only after `latestRef` or reducer state is in place.
- **Outcome:** Largest line count reduction; highest risk — ship behind thorough manual QA (program complete → child archival, missing-column messages, scheduled time/date edge cases, visibility).

---

## Summary

| Domain               | Primary state / refs                                | Hotspots                                                               |
| -------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| Core + metadata form | Many `useState` + `metadataForSave` + `originalRef` | `applyRow`, create reset, `coreDirty`, `saveCoreFields`                |
| Mutations            | `saving`, `archiving`, `error`                      | `saveCoreFields`, `createTask`, collections, card cover                |
| AI / fitness         | AI flags, viewer, templates                         | `handlePersonalizeProgram`, `handleAiGenerateWorkout`, viewer/metadata |
| Realtime             | (none)                                              | `postgres_changes` → `loadTask`                                        |
| Ephemeral UI         | tab, viewMode, dialogs, loading                     | Multiple small effects + `selectTab`                                   |

The **fastest win / lowest risk** extractions are **effects and AI handlers**; the **highest value** extraction is **`saveCoreFields` + snapshot/dirty model**, best done after pure helpers and optional `useReducer` for hydrate/reset.
