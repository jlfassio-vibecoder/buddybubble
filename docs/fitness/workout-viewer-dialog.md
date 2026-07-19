# Workout viewer dialog and content

Source: [src/components/fitness/workout-viewer-dialog.tsx](../../src/components/fitness/workout-viewer-dialog.tsx)

Two exports share most behavior:

- **`WorkoutViewerContent`** — layout-agnostic body (embedded in [TaskModal](../../src/components/modals/TaskModal.tsx) split pane or inside a standalone dialog).
- **`WorkoutViewerDialog`** — wraps content in `Dialog` with `open` / `onOpenChange`.

## Types

- **`WorkoutViewerApplyPayload`** — `{ title, description, exercises, blocks? }` passed to `onApply`. When `blocks` is set (rich block editor path), [`useTaskWorkoutAi`](../../src/components/modals/task-modal/hooks/useTaskWorkoutAi.ts) writes via `applyBlockEditsToMetadata`; otherwise the M0 flat guard applies. In Task Modal, `onApply` also persists via `saveCoreFields` and toasts success/failure.
- **`WorkoutViewerCanvasDraftHandle`** — imperative canvas API for Coach effects: `mode`, `enterEdit`, `applyExternalBlocks`, `applyStructuralPatch`.
- **`WorkoutViewerDialogProps`** — Adds `open`, `onOpenChange`, plus workout data, permissions, AI card-cover hooks, optional `onSaveTask` for inline DB save from the task modal, and loading flags for AI generation.

`WorkoutViewerContentProps` omits `open` / `onOpenChange`, adds:

| Prop                 | Role                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `onRequestClose`     | Close handler for embedded or dialog chrome.                                                                                               |
| `syncKey`            | Hard reset only: when the pane opens / task switches, discard drafts and return to view. Soft Coach metadata updates do **not** bump this. |
| `layout`             | `'dialog'` (default) vs `'embedded'` for flex layout in Task modal.                                                                        |
| `dialogTitleAsChild` | Accessibility when title is rendered as child of `DialogTitle`.                                                                            |

## View vs edit

Mode and drafts live in [`useWorkoutBlockDraftSession`](../../src/components/fitness/hooks/useWorkoutBlockDraftSession.ts) (`view` | `edit`).

**Rich cards (`ai_workout_factory`):** View uses `WorkoutBlockListRenderer` (or `WorkoutLogReadSummary` when `readVariant="log"`). Edit uses `WorkoutBlockListEditor` when `readVariant !== 'log'` and `sessionVm.source === 'rich'`; otherwise [WorkoutExercisesEditor](workout-exercises-editor.md). See [parametric-step5-m2-plan.md](views/parametric-step5-m2-plan.md).

`onApply` is invoked from the apply path with the normalized payload so parents merge into `tasks.metadata` and related fields. The draft session exits edit **only after** `onApply` succeeds (`false` keeps edit + dirty so a failed Task Modal save cannot strand unsaved canvas work).

## Coach → canvas (two-path)

Canonical architecture: [Coach implementation reference — Two-path editor](../agents/coach/README.md#two-path-workout-editor-architecture).

| Effect                      | When                                         | Canvas behavior                                                                                      |
| --------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `structural_patch`          | Existing rich workout on the Task Modal rail | Enters edit if needed; patches by stamped `block_id` / `exercise_id` (name fallback).                |
| `proposed_workout_metadata` | Creation / pre-rich draft only               | Applies external blocks only while already in edit mode.                                             |
| Soft metadata write-through | Server already persisted a Coach patch       | Merges prescription fields (sets/reps/RPE/notes/timing) into an open draft without wiping structure. |

Effects arrive via `useAgentEffectSweep` → Task Modal handlers → the `WorkoutViewerCanvasDraftHandle` ref.

## AI and card cover

- **`isAiGenerating`** — can show `WorkoutGeneratingOverlay` with rotating lines from [WORKOUT_FACTORY_CHAIN_MESSAGES](../../src/lib/workout-factory/api-client.ts).
- **Card cover** — Optional `cardCoverPath` resolves a signed URL via `useTaskCardCoverUrl`. Inline AI block uses `TaskModalCardCoverAiBlock` with hint/preset/generate props mirrored from task modal details.

## Exercise image requests

When an exercise has no `thumbnail_url`, read rows can show **Request image** — a `mailto:` link. If `NEXT_PUBLIC_EXERCISE_IMAGE_REQUEST_EMAIL` is set, it becomes the default **To** address; otherwise the user’s client opens a blank To field with prefilled subject/body (exercise name, optional catalog hint, task id).

## Related docs

- [workout-exercises-editor.md](workout-exercises-editor.md)
- [README.md](README.md)
- [../agents/coach/README.md](../agents/coach/README.md) — two-path Coach editor architecture
