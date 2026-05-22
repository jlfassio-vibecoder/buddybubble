# Parametric Step 8 — M8.3 (History Read Parity)

**Status:** Shipped  
**Parent:** [parametric-step8-plan.md](./parametric-step8-plan.md)  
**Prerequisite:** [parametric-step8-m8.2-plan.md](./parametric-step8-m8.2-plan.md) (finish payload)

**Epic closure:** Completed `workout_log` cards show Step 4 block headers/subtitles with logged `set_logs` underneath.

---

## Shipped deliverables

| Artifact             | Path                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Set-log index helper | [`set-logs-by-global-index.ts`](../../../src/lib/workout-factory/set-logs-by-global-index.ts)                                                                          |
| Rich log overlay     | [`WorkoutLogReadSummary.tsx`](../../../src/components/fitness/workout-block-renderer/WorkoutLogReadSummary.tsx)                                                        |
| Factory row + logs   | [`WorkoutReadExerciseRow.tsx`](../../../src/components/fitness/workout-block-renderer/WorkoutReadExerciseRow.tsx)                                                      |
| Task Modal plumbing  | [`TaskModal.tsx`](../../../src/components/modals/TaskModal.tsx) → [`TaskModalWorkoutFields.tsx`](../../../src/components/modals/task-modal/TaskModalWorkoutFields.tsx) |
| Viewer precedence    | [`workout-viewer-dialog.tsx`](../../../src/components/fitness/workout-viewer-dialog.tsx)                                                                               |

---

## Read path

- **Structure:** `useWorkoutSessionViewModel(metadata)` → `WorkoutBlockListRenderer`
- **Performance:** `parseWorkoutExercisesFromMetadata(metadata)` → `setLogsByGlobalIndexFromMetadata` → `renderExercise` → `WorkoutReadExerciseRowFromFactory` with `setLogs`
- **Flat fallback:** `WorkoutFlatExerciseLogList` when no factory

---

## Verification

```bash
pnpm exec vitest run \
  src/lib/workout-factory/set-logs-by-global-index.test.ts \
  src/components/fitness/workout-block-renderer/WorkoutLogReadSummary.test.tsx \
  src/components/fitness/workout-viewer-dialog.test.tsx

pnpm run check
```
