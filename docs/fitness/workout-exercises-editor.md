# WorkoutExercisesEditor

Source: [src/components/fitness/workout-exercises-editor.tsx](../../src/components/fitness/workout-exercises-editor.tsx)

Controlled editor for the ordered list of **exercises** on a workout card. It handles drag-and-drop reordering, inline row expansion for per-exercise fields, and normalization of reps/sets/weight/RPE/duration into the shared **`WorkoutExercise`** shape.

## Public API

`WorkoutExercisesEditorProps` (exported):

| Prop                | Purpose                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `exercises`         | Current list; parent owns truth.                                                                                      |
| `onChange(next)`    | Called when the list mutates (reorder, field edits, add/remove).                                                      |
| `canWrite`          | When false, UI is read-oriented (no destructive reorder edits where disabled).                                        |
| `workoutUnitSystem` | `metric` \| `imperial` from profile/task context for labels.                                                          |
| `idPrefix`          | Optional prefix for DOM ids when multiple editors mount on one page.                                                  |
| `autoEditFirstRow`  | If true and the list becomes non-empty, opens the first row in inline edit (e.g. explicit “edit” intent from Kanban). |

## Behavior highlights

- **Reordering:** Uses `@dnd-kit` (`DndContext`, `SortableContext`, `verticalListSortingStrategy`) with `arrayMove` on drag end. Inline edit index is remapped when rows move.
- **Reps:** Draft strings round-trip through [parse-reps-scalar.ts](../../src/lib/workout-factory/parse-reps-scalar.ts) (`formatRepsDisplay`, `parseRepsDraftToStorage`) so stored `reps` can be scalar or structured as defined by the workout factory.
- **Optional numerics:** Empty inputs clear optional fields on the exercise object (`sets`, `reps`, `weight`, `duration_min`, `rpe`) via `exerciseFromDraft`.

## Data model

Exercises are **`WorkoutExercise`** values from [item-metadata.ts](../../src/lib/item-metadata.ts). That type is what task metadata serialization expects alongside `metadataFieldsFromParsed` / `parseTaskMetadata` in parents.

## Consumers

1. **[workout-viewer-dialog.tsx](../../src/components/fitness/workout-viewer-dialog.tsx)** — Edit mode inside `WorkoutViewerContent` after the user switches from read-only view.
2. **[TaskModalWorkoutFields.tsx](../../src/components/modals/task-modal/TaskModalWorkoutFields.tsx)** — Direct editing on the task form.
3. **[LiveSessionWorkoutPlayer.tsx](../../src/features/live-video/shells/huddle/LiveSessionWorkoutPlayer.tsx)** — Live session workout deck editing.

## Related docs

- [README.md](README.md) — hub index.
- [workout-viewer-dialog.md](workout-viewer-dialog.md) — wraps this in modal/task flows.
