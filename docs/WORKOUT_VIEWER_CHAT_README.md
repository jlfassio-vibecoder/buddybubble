# Workout viewer + task comments (shipped)

This document describes the **implemented** “workout viewer + chat” experience in the CRM. It complements the earlier assessment in [`WORKOUT_VIEWER_CHAT_PLAN.md`](./WORKOUT_VIEWER_CHAT_PLAN.md), which explored options; **this README reflects what is in the tree today**.

---

## What shipped (summary)

- **Single `TaskModal` shell** widens to **`max-w-6xl`** when the **unified workout split** is active.
- **No second Radix dialog** stacked above the task modal for that path: [`WorkoutViewerContent`](../src/components/fitness/workout-viewer-dialog.tsx) is **embedded** in the modal as a **second column** (`layout="embedded"`).
- **Task-scoped comments** stay on the **card column** (same thread as the Comments tab): [`TaskModalCommentsPanel`](../src/components/modals/task-modal/TaskModalCommentsPanel.tsx) + [`useMessageThread`](../src/hooks/useMessageThread.ts) with `filter: { scope: 'task', taskId }`.
- **`WorkoutViewerDialog`** (standalone Radix dialog) still lives in [`workout-viewer-dialog.tsx`](../src/components/fitness/workout-viewer-dialog.tsx) and wraps `WorkoutViewerContent` with `layout="dialog"`; the **dashboard currently opens the embedded path only** via `TaskModal` (see imports).

---

## When the split appears

All must be true (see [`TaskModal.tsx`](../src/components/modals/TaskModal.tsx) `showWorkoutSplitPane`):

| Gate                      | Role                                                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modal `open`              | Task modal visible                                                                                                                                                      |
| `taskId`                  | Editing an existing card (not create-only)                                                                                                                              |
| `workoutViewerOpen`       | User opened the viewer (header CTA, Kanban quick view, etc.)                                                                                                            |
| `hasWorkoutViewerContent` | From [`useTaskWorkoutAi`](../src/components/modals/task-modal/hooks/useTaskWorkoutAi.ts): workout / workout_log **and** (exercises **or** AI `workout_set` in metadata) |
| `isWorkoutItemType`       | Item type is workout or workout_log                                                                                                                                     |

`initialOpenWorkoutViewer` (e.g. Kanban) still auto-opens via the same hook once content is loaded.

---

## Layout

### Desktop (`md+`)

- **Flex row** inside the modal body: **card column first**, **workout column second** (comments / details live in the card column; workout card on the right).
- **Card column**: narrow rail — `basis` / `max-w` caps so **comments + chrome do not dominate**; **`md:border-r`** separates from the workout pane.
- **Workout column**: **`md:flex-1 md:min-w-0`** so the **workout viewer gets the larger share** of width.

### Mobile (`max-md`)

- **Segmented control** (“Workout” | “Card”) above the split; only one pane visible at a time (`mobileUnifiedPane`).
- Opening the split bumps **`workoutPaneSyncKey`** so embedded viewer draft state resets from props (see `TaskModal` + `WorkoutViewerContent` `syncKey`).

### Hero

- Cinematic [`TaskModalHero`](../src/components/modals/task-modal-hero.tsx) is **hidden while** `showWorkoutSplitPane` is true (saves vertical space for the two-pane body).

---

## How to open the viewer

| Entry                  | Behavior                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Task modal header**  | Primary **“Workout viewer”** when `hasWorkoutViewerContent` and split is **not** already open (moved out of editor chrome for visibility).                          |
| **Kanban**             | `openWorkoutViewer: true` → `initialOpenWorkoutViewer` on `TaskModal` → hook opens viewer after load.                                                               |
| **`useTaskWorkoutAi`** | `setWorkoutViewerOpen` / reset on modal close; `handleWorkoutViewerApply` writes title, description, exercises, and clears `ai_workout_factory` metadata as before. |

---

## Comments + “comments focus” (same thread)

- **Comments tab** uses **`TaskModalCommentsPanel`** → **`useMessageThread({ filter: { scope: 'task', taskId }, … })`** — aligned with unified task message model (not a duplicate bubble-only thread inside the workout file).
- **`viewMode: 'comments-only'`** (from Kanban comment icon, [`card-tab-strip`](../src/components/tasks/card-tab-strip.tsx), toast, or in-modal **Comments** tab via `selectTab`) hides type/visibility chrome and matches the compact “discuss this card” shell.
- Header **Details** CTA appears in comments-only when there is **no** workout viewer CTA (e.g. programs) so users can return to full **Details**.

---

## Key files (quick map)

| Area                                | File                                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Split shell, tab sync, header CTAs  | [`src/components/modals/TaskModal.tsx`](../src/components/modals/TaskModal.tsx)                                                              |
| Embedded vs dialog layout           | [`src/components/fitness/workout-viewer-dialog.tsx`](../src/components/fitness/workout-viewer-dialog.tsx) (`WorkoutViewerContent`, `layout`) |
| Viewer state / apply / auto-open    | [`src/components/modals/task-modal/hooks/useTaskWorkoutAi.ts`](../src/components/modals/task-modal/hooks/useTaskWorkoutAi.ts)                |
| Task thread UI                      | [`src/components/modals/task-modal/TaskModalCommentsPanel.tsx`](../src/components/modals/task-modal/TaskModalCommentsPanel.tsx)              |
| Shared message + realtime + send    | [`src/hooks/useMessageThread.ts`](../src/hooks/useMessageThread.ts)                                                                          |
| Bubble chat (different scope)       | [`src/components/chat/ChatArea.tsx`](../src/components/chat/ChatArea.tsx) + same hook with bubble / all-bubbles filters                      |
| Open-task options (tabs / viewMode) | [`src/types/open-task-options.ts`](../src/types/open-task-options.ts) (keep in sync with re-exports on `TaskModal` if both exist)            |

---

## Divergence from the original plan (intentional)

The plan considered **embedding `TaskModalCommentsPanel` inside `WorkoutViewerDialog`** and widening **that** dialog. The shipped design **keeps comments in `TaskModal`** and **embeds the workout UI** beside it instead:

- **Pros**: One modal layer, no z-index fight between two dialogs, reuse of existing tab strip and `comments-only` behavior.
- **Trade-off**: Users can have **Comments** visible in the left rail **and** the workout pane open **without** merging into a single “viewer” title bar; product mitigations from the plan (copy hint, auto-switch tab) remain **optional follow-ups**.

---

## Optional follow-ups (from assessment, not done here)

- Short UI copy if dual “comments surfaces” confuses testers.
- **Edit mode**: plan suggested optionally **hiding** chat when workout body is in **Edit**; current embedded viewer still shows the card column (user can switch tabs).
- **Standalone** `WorkoutViewerDialog` entry from shell without `TaskModal` would need **`workspaceId` / `bubbles` / task thread** wired separately (not required for current Kanban → modal flow).

---

## Related doc

- Assessment and alternatives: [`docs/WORKOUT_VIEWER_CHAT_PLAN.md`](./WORKOUT_VIEWER_CHAT_PLAN.md)
