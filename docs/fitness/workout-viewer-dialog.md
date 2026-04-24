# Workout viewer dialog and content

Source: [src/components/fitness/workout-viewer-dialog.tsx](../../src/components/fitness/workout-viewer-dialog.tsx)

Two exports share most behavior:

- **`WorkoutViewerContent`** — layout-agnostic body (embedded in [TaskModal](../../src/components/modals/TaskModal.tsx) split pane or inside a standalone dialog).
- **`WorkoutViewerDialog`** — wraps content in `Dialog` with `open` / `onOpenChange`.

## Types

- **`WorkoutViewerApplyPayload`** — `{ title, description, exercises }` passed to `onApply` when the user confirms edits so the parent can persist task metadata.
- **`WorkoutViewerDialogProps`** — Adds `open`, `onOpenChange`, plus workout data, permissions, AI card-cover hooks, optional `onSaveTask` for inline DB save from the task modal, and loading flags for AI generation.

`WorkoutViewerContentProps` omits `open` / `onOpenChange`, adds:

| Prop                 | Role                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `onRequestClose`     | Close handler for embedded or dialog chrome.                                                                |
| `syncKey`            | Increment when the pane opens so local draft state resets from props (`title`, `description`, `exercises`). |
| `layout`             | `'dialog'` (default) vs `'embedded'` for flex layout in Task modal.                                         |
| `dialogTitleAsChild` | Accessibility when title is rendered as child of `DialogTitle`.                                             |

## View vs edit

Internal `ViewMode` toggles between **`view`** (read-only exercise rows with thumbnails, meta lines, optional “Request image” mailto) and **`edit`** (delegates list editing to [WorkoutExercisesEditor](workout-exercises-editor.md)).

`onApply` is invoked from the apply path with the normalized payload so parents merge into `tasks.metadata` and related fields.

## AI and card cover

- **`isAiGenerating`** — can show `WorkoutGeneratingOverlay` with rotating lines from [WORKOUT_FACTORY_CHAIN_MESSAGES](../../src/lib/workout-factory/api-client.ts).
- **Card cover** — Optional `cardCoverPath` resolves a signed URL via `useTaskCardCoverUrl`. Inline AI block uses `TaskModalCardCoverAiBlock` with hint/preset/generate props mirrored from task modal details.

## Exercise image requests

When an exercise has no `thumbnail_url`, read rows can show **Request image** — a `mailto:` link. If `NEXT_PUBLIC_EXERCISE_IMAGE_REQUEST_EMAIL` is set, it becomes the default **To** address; otherwise the user’s client opens a blank To field with prefilled subject/body (exercise name, optional catalog hint, task id).

## Related docs

- [workout-exercises-editor.md](workout-exercises-editor.md)
- [README.md](README.md)
