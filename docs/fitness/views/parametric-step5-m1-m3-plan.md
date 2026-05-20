# Parametric Step 5 — M1 + M3 (Block editor + write path)

**Status:** Shipped.

**Parent:** [parametric-step5-plan.md](./parametric-step5-plan.md) (Step 5 umbrella).

**Follow-up (shipped):** [parametric-step5-m2-plan.md](./parametric-step5-m2-plan.md) — viewer Edit + Apply wiring.

---

## Goal

Let users edit existing block/exercise fields on rich factory cards without React-side adapters:

1. **M3** — `applyBlockEditsToMetadata(meta, blocks)` rebuilds `ai_workout_factory` and syncs `metadata.exercises`.
2. **M1** — `WorkoutBlockListEditor` mutates `WorkoutSessionBlockView[]` via `onChange`.

```mermaid
flowchart LR
  Meta[metadata Json]
  VM[buildWorkoutSessionViewModel]
  Editor[WorkoutBlockListEditor]
  Apply[applyBlockEditsToMetadata]
  Meta --> VM
  VM -->|blocks| Editor
  Editor -->|onChange blocks| Apply
  Apply --> Meta
```

---

## What shipped

### M3 — Write path (`src/lib/workout-factory/sync-workout-metadata.ts`)

| Export                          | Role                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `viewExerciseToFactoryExercise` | View exercise → factory `Exercise`                                                         |
| `viewBlockToExerciseBlock`      | Main block → `ExerciseBlock` (preserves `blockFormat`, `formatParams`, renumbered `order`) |
| `viewBlockToWarmupBlock`        | Instruction sections → `WarmupBlock`                                                       |
| `blocksViewToProgramWorkout`    | Partition/sort blocks into session arrays                                                  |
| **`applyBlockEditsToMetadata`** | Rich-only entry; flat cache via `workoutInSetToTaskExercises`; no-op on flat-only metadata |

**Out of scope:** add/remove blocks or exercises; `formatParams` editing (M4); writing `subtitle` (computed on read).

### M1 — Editor (`src/components/fitness/workout-block-renderer/`)

| Module                            | Role                                                                  |
| --------------------------------- | --------------------------------------------------------------------- |
| `workout-block-editor-types.ts`   | Props, `updateBlock`, `updateExerciseInBlock`, grouped layout helpers |
| `WorkoutBlockExerciseEditRow.tsx` | Name, sets, reps, RPE, rest, coach notes; read-only work/rounds chips |
| `WorkoutInstructionBlockEdit.tsx` | Section label + instructions textarea (fixed line count vs loaded)    |
| `WorkoutBlockListEditor.tsx`      | Orchestrator: warmup → main → finisher → cooldown                     |
| `index.ts`                        | Public exports                                                        |

**Out of scope:** weight input (no factory field); DnD reorder; `onBlockFormatParamsChange` (M4).

### M0 (prerequisite, prior commit)

`useTaskWorkoutAi` — title-only Apply no longer degrades rich blocks via flat path.

---

## Verification

```bash
pnpm exec vitest run \
  src/lib/workout-factory/sync-workout-metadata.test.ts \
  src/components/fitness/workout-block-renderer/WorkoutBlockListEditor.test.tsx
```

Round-trip pattern (sync tests + editor integration test):

```ts
const vm1 = buildWorkoutSessionViewModel(meta);
const edited = /* patch vm1.blocks */;
const next = applyBlockEditsToMetadata(meta, edited);
const vm2 = buildWorkoutSessionViewModel(next);
```

---

## Explicitly not in this milestone

- **M2:** `localBlocks`, `WorkoutViewerApplyPayload.blocks`, viewer Apply wiring
- **M4:** `formatParams` editor
- Convert-to-flat-list menu
- Drag-and-drop reorder (optional up/down deferred)
