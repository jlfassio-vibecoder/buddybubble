# Parametric Workout Blocks — Step 3 (implemented)

**Status:** Shipped (WorkoutPlayer P0 block-aware UI).

**Prerequisites:** [parametric-step1-2-plan.md](./parametric-step1-2-plan.md) (data contract + ViewModel).

**Related:** [Workout UI landscape audit](./README.md) · [workout-player.md](../workout-player.md)

---

## Goal

Render parametric block structure during live workout execution: warmup → main blocks with subtitles → finisher → cooldown, while keeping flat-indexed set logging unchanged.

---

## What shipped

### Data path

- [WorkoutPlayer.tsx](../../../src/components/fitness/WorkoutPlayer.tsx) uses `useWorkoutSessionViewModel(metadata)` → `flatExercises` for logs, Coach rail, recovery, and finish.
- Rich cards (`source === 'rich'`) render via [WorkoutPlayerBlockList.tsx](../../../src/components/fitness/workout-block-renderer/WorkoutPlayerBlockList.tsx).
- Flat-only cards keep the legacy linear exercise list (no block chrome).

### New modules

| Module                                                                                                                    | Role                                               |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| [workout-player-exercise-index.ts](../../../src/lib/workout-factory/workout-player-exercise-index.ts)                     | Maps main-block exercises → global log index       |
| [WorkoutBlockHeader.tsx](../../../src/components/fitness/workout-block-renderer/WorkoutBlockHeader.tsx)                   | Block name + subtitle                              |
| [WorkoutInstructionBlockList.tsx](../../../src/components/fitness/workout-block-renderer/WorkoutInstructionBlockList.tsx) | Read-only warmup/finisher/cooldown                 |
| [WorkoutPlayerExercisePanel.tsx](../../../src/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel.tsx)   | Set grid + extended target line (work/rest/rounds) |
| [WorkoutPlayerBlockList.tsx](../../../src/components/fitness/workout-block-renderer/WorkoutPlayerBlockList.tsx)           | Block-aware player body                            |

### Unchanged

- `SetDraft[][]` shape and global exercise indices
- `handleFinish` → flat `workout_log.metadata.exercises`
- Coach `execution_patch` by `exerciseIndex`
- Draft autosave (`draft_logs`)

### Play gate

- [WorkoutPlayerTriggers](../../../src/components/fitness/WorkoutPlayer.tsx) uses `buildWorkoutSessionViewModel(metadata).flatExercises.length > 0` (rich-only cards with derived exercises can play).

---

## Out of scope (Step 4+)

- AMRAP/EMOM/Tabata interval timer shells
- Superset/contrast paired layouts
- Ladder/pyramid progression UX
- Block metadata on `workout_log`
- Shared renderer refactor for `RichWorkoutReadView` (P1)
- Live video loggers

---

## Verification

```bash
pnpm exec vitest run \
  src/lib/workout-factory/workout-player-exercise-index.test.ts \
  src/components/fitness/workout-block-renderer/WorkoutPlayerBlockList.test.tsx
```

Manual: open a parametric workout card → Play → confirm block headers/subtitles and instruction sections; finish workout → log still flat.
