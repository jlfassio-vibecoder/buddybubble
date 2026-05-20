# Parametric Workout Blocks — Steps 1 & 2 (implemented)

**Status:** Shipped (data contract + ViewModel). Step 3: [parametric-step3-plan.md](./parametric-step3-plan.md).

**Related:** [Workout UI landscape audit](./README.md) · [Parametric engine](../../refactor/parametric-workout-blocks/README.md)

---

## Step 1: Data contract (persistence & sync)

### Architectural rule

| Layer                                                | Role                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| `metadata.ai_workout_factory.workout_set.workouts[]` | **Source of truth** when non-empty                         |
| `metadata.exercises`                                 | **Derived legacy cache** for Player / loggers until Step 3 |
| Flat-only cards                                      | No factory → `exercises` remains authoritative             |

### Module: [`sync-workout-metadata.ts`](../../../src/lib/workout-factory/sync-workout-metadata.ts)

| Export                            | Purpose                                        |
| --------------------------------- | ---------------------------------------------- |
| `hasRichWorkoutSetInMetadata`     | Same guard as server merge `hasRichWorkoutSet` |
| `deriveFlatExercisesFromMetadata` | Flatten factory session → `WorkoutExercise[]`  |
| `flatExercisesMatchDerived`       | Detect form flat vs factory drift              |
| `applyFlatWorkoutEditsToMetadata` | Apply flat edits; **never deletes** factory    |
| `finalizeWorkoutMetadataForSave`  | Called from `buildTaskMetadataPayload` on save |

### Flat edit degradation (viewer Apply, Details tab, live deck)

When rich factory exists and flat exercises change:

1. Preserve `ai_workout_factory` siblings (`generated_at`, `model`, `chain_metadata`).
2. Replace `workouts[0].exerciseBlocks` with one `straight_sets` block named **Main**.
3. Preserve `warmupBlocks`, `finisherBlocks`, `cooldownBlocks`.
4. Refresh `metadata.exercises` from derived flatten.

### Files changed (Step 1)

| File                                                                                                  | Change                                                          |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [`useTaskWorkoutAi.ts`](../../../src/components/modals/task-modal/hooks/useTaskWorkoutAi.ts)          | `handleWorkoutViewerApply` → `applyFlatWorkoutEditsToMetadata`  |
| [`item-metadata.ts`](../../../src/lib/item-metadata.ts)                                               | `buildTaskMetadataPayload` → `finalizeWorkoutMetadataForSave`   |
| [`session-deck-snapshot.ts`](../../../src/features/live-video/shells/huddle/session-deck-snapshot.ts) | Factory-aware `workoutMetadataSignature`; merge via sync helper |

### Tests

- [`sync-workout-metadata.test.ts`](../../../src/lib/workout-factory/sync-workout-metadata.test.ts)
- [`session-deck-snapshot.test.ts`](../../../src/features/live-video/shells/huddle/session-deck-snapshot.test.ts)

---

## Step 2: WorkoutSessionViewModel

### Module: [`workout-session-view-model.ts`](../../../src/lib/workout-factory/workout-session-view-model.ts)

```typescript
export type WorkoutSessionSource = 'rich' | 'flat' | 'empty';

export type WorkoutSessionViewModel = {
  source: WorkoutSessionSource;
  workoutSet: WorkoutSetTemplate | null;
  session: WorkoutInSet | null;
  blocks: WorkoutSessionBlockView[];
  flatExercises: WorkoutExercise[];
  flatCacheStale: boolean;
};
```

`buildWorkoutSessionViewModel(meta)`:

- **Rich:** normalize `workouts[0]`, build blocks (warmup → main → finisher → cooldown), subtitles via `formatBlockSubtitle`.
- **Flat:** single synthetic main block.
- **Empty:** no blocks.

### React hook: [`use-workout-session-view-model.ts`](../../../src/hooks/use-workout-session-view-model.ts)

Thin `useMemo` wrapper over `buildWorkoutSessionViewModel`.

### Fixtures & tests

- [`__fixtures__/workout-session-view-model.fixtures.ts`](../../../src/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures.ts) — all 12 `block_format` values
- [`workout-session-view-model.test.ts`](../../../src/lib/workout-factory/workout-session-view-model.test.ts)
- [`use-workout-session-view-model.test.tsx`](../../../src/hooks/use-workout-session-view-model.test.tsx)

### Optional adoption

[`useTaskWorkoutAi.ts`](../../../src/components/modals/task-modal/hooks/useTaskWorkoutAi.ts) `viewerWorkoutSet` now uses `buildWorkoutSessionViewModel(metadata).workoutSet`.

---

## Out of scope (Step 3+)

- `WorkoutPlayer.tsx` block-aware UI
- Block-aware editor
- `CoachDraftCard` rich preview
- Toast on flat-edit degradation (optional UX)

---

## Verification

```bash
pnpm exec vitest run \
  src/lib/workout-factory/sync-workout-metadata.test.ts \
  src/lib/workout-factory/workout-session-view-model.test.ts \
  src/features/live-video/shells/huddle/session-deck-snapshot.test.ts \
  src/hooks/use-workout-session-view-model.test.tsx
```
