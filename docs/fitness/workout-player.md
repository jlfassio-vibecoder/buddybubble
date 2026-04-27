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

---

## Architectural assessment & gap analysis (2026-04-25)

This section captures the current `WorkoutPlayer` architecture, how “split pane” is implemented elsewhere (notably the WorkoutViewer-in-TaskModal pattern), and what’s missing to add a **WorkoutPlayer + Messages (Coach)** split pane that “opens the same way” as today.

### Current `WorkoutPlayer` architecture (as-is)

- **Mount + open semantics**
  - `WorkoutPlayer` is a **client component** that renders a **Radix Dialog**.
  - `DashboardShell` mounts it when `workoutPlayerTask` is set, and passes `open={true}` (single-instance shell mount).
  - `WorkoutPlayerTriggers` can also mount nested players (desktop/mobile buttons inside the Task Modal editor chrome) by setting `mode` and toggling a local `mode` state.

- **UI layout**
  - **Desktop**: centered dialog with fixed max width (`sm:max-w-2xl`) and `h-[90dvh]`.
  - **Mobile**: bottom sheet with drag handle and `h-[92dvh]`.
  - Single-column body with: header (title + timer + view toggle), scrollable exercise panels, footer (Cancel / Finish).

- **State + data flow**
  - Parses `tasks.metadata` inside the player using `metadataFieldsFromParsed`, with a JSON digest pattern to avoid parent re-render resets.
  - Builds per-exercise `logs` state (`SetDraft[][]`) seeded via `makeSets(ex)` when opened.
  - Local-only elapsed timer via `setInterval` while open.
  - Loads `fitness_profiles.unit_system` for `(workspaceId, profileId)` on open to format target lines (`kg` vs `lbs`).

- **Persistence / finish**
  - `handleFinish` inserts a `tasks` row with `item_type: 'workout_log'`, `status: 'completed'`, and `metadata.exercises` containing only **completed sets**.
  - Optionally loads the `sourceTaskId` task to copy scheduling / program fields + replicate assignees via `replaceTaskAssigneesWithUserIds`.
  - Error handling is `toast.error(formatUserFacingError(...))`.

### Where “split pane” exists today (WorkoutViewer pattern)

There are two relevant, already-established patterns:

- **TaskModal workout split pane**
  - `TaskModal` conditionally enables `showWorkoutSplitPane` and switches to a **two-column layout** (`md:flex-row`).
  - Left column is a **narrow rail** (“Card + Comments”), right column is `WorkoutViewerContent` rendered with `layout="embedded"`.
  - On mobile, this becomes a **two-tab unified pane** (“Workout” vs “Card”) rather than a true side-by-side split.

- **Workspace-level Messages vs Board split**
  - `WorkspaceMainSplit` implements a resizable split between **Messages** (`ChatArea`) and the **board/calendar stage**.
  - It persists per-workspace chat width in localStorage and has well-defined collapse/expand behavior.

For the requested change, the **TaskModal workout split pane** is the closest analogue: it’s a local, modal-scoped two-column composition (not the full workspace layout manager).

### Coach / messages rail primitives already in the codebase

- `ChatArea` is the “messages rail” component used in the workspace shell.
- `ChatArea` has an explicit surface-level default agent slug:
  - `CHAT_AREA_DEFAULT_AGENT_SLUG = 'coach'`
  - The comment above it states: “The fitness surface assumes `@Coach` is the implicit responder for non-mention messages.”
- `ChatArea` uses `resolveTargetAgent(... contextDefaultAgentSlug ...)` so that messages without an explicit `@mention` still route to Coach by default.

### Gaps to implement “WorkoutPlayer split pane + Coach-only message rail”

#### 1) `WorkoutPlayer` has no messages/chat integration today

- **Current**: `WorkoutPlayer` is self-contained (exercise logging + finish insert) and does not render `ChatArea` (or any message/thread UI).
- **Needed**: a right-hand pane that renders the messages rail while the workout is active.

#### 2) We need “message rail only” without disturbing global workspace chat state

`ChatArea` is currently tightly coupled to `useWorkspaceStore` for:

- Active bubble selection (`activeBubble`)
- Workspace id (`activeWorkspace?.id`)

To show “message rail only” _inside the workout player_ without changing the user’s main selected bubble / chat context in the dashboard, we’ll need one of:

- **A dedicated “rail” wrapper** for workout player that uses the same underlying message/thread hooks but does **not** depend on the global `useWorkspaceStore` bubble selection, or
- A way to **scope/override** `ChatArea`’s active bubble/workspace context for this surface (e.g. explicit `workspaceId` + `bubbleId` props, with store reads only as fallback).

This is the biggest architectural gap: the UI exists, and the Coach routing exists, but the workout player needs a **scoped chat context** so it doesn’t mutate the main app’s chat selection when it opens/closes.

#### 3) Pane choreography and mobile parity

- **Desired**: “split pane like the WorkoutViewer” implies:
  - Desktop: two columns.
  - Mobile: a unified/tabs approach (“Workout” vs “Coach”), matching `TaskModal`’s mobile split handling.
- **Current `WorkoutPlayer`**: already has distinct desktop dialog vs mobile bottom sheet chromes. Adding a split pane must preserve these entry points while changing only the interior composition.

#### 4) “Open exactly the same way” constraints

The WorkoutPlayer must continue to:

- Open from `DashboardShell`’s `workoutPlayerTask` the same way (no additional navigation).
- Preserve `mode` forcing from `WorkoutPlayerTriggers`.
- Keep the finish flow exactly as-is (it is production-critical DB behavior).

The split-pane + chat rail should be additive and should not change the insert payload shape or the reset semantics tied to `open` + `sourceTaskId` + exercises digest.

#### 5) “Coach loaded to assist… and fill out the workout player”

The codebase already supports:

- Coach as default agent for chat (`ChatArea`).
- Rich message composing + attachments + thread panel.

What’s not implemented (yet) in `WorkoutPlayer`:

- Any notion of “Coach can fill out sets for the user” (i.e., writing to the player’s `logs` state from a chat action).

This will require an explicit integration surface:

- **Option A (lower coupling)**: Coach replies with structured “draft cards” (similar to `CoachDraftCard`) that the user can apply into the workout player (sets/reps/weight) via a UI button.
- **Option B (direct coupling)**: Chat actions dispatch directly into the workout player via callbacks/refs (higher risk, tighter coupling).

This doc update focuses on the split-pane + rail plumbing; the “fill out for the user” piece will need a follow-up design decision on _how_ Coach proposes/applies changes into `logs`.

### Recommended implementation direction (based on current patterns)

- **Layout**: mirror `TaskModal`’s split-pane composition (flex row, fixed/narrow rail width on desktop; tabbed “Workout vs Coach” on mobile).
- **Messages rail**: reuse as much of `ChatArea` as possible, but introduce a workout-player-scoped variant or override hooks so it can render messages for `bubbleId` without mutating global `useWorkspaceStore` selection.
- **Agent**: rely on existing default agent slug `'coach'` (already aligned with the fitness surface) so “Coach” is the implicit responder.
