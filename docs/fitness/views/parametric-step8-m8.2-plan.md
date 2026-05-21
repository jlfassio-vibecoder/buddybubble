# Parametric Step 8 — M8.2 (Finish Payload)

**Status:** Shipped  
**Parent:** [parametric-step8-plan.md](./parametric-step8-plan.md)  
**Prerequisite:** M8.1 — no migration/RPC; `tasks.metadata` JSONB is sufficient.

**Out of scope (M8.2):** Draft autosave factory copy, M8.3 read UI, `finalizeWorkoutMetadataForSave` changes, WorkoutPlayer integration tests.

---

## Goal

When the athlete taps **Finish Workout**, persist a deep-cloned `ai_workout_factory` prescription snapshot on the completed `workout_log` task alongside the existing flat `exercises` + `set_logs` performance cache.

---

## Shipped deliverables

| Artifact                | Path                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Finish metadata builder | [`build-workout-log-finish-metadata.ts`](../../../src/lib/workout-factory/build-workout-log-finish-metadata.ts)           |
| Unit tests              | [`build-workout-log-finish-metadata.test.ts`](../../../src/lib/workout-factory/build-workout-log-finish-metadata.test.ts) |
| Player wiring           | [`WorkoutPlayer.tsx`](../../../src/components/fitness/WorkoutPlayer.tsx) `handleFinish`                                   |

---

## Type contract

- `WORKOUT_LOG_SCHEMA_VERSION = 1` on every player-finished log.
- `buildWorkoutLogFinishMetadata` — attaches factory when `sessionVm.source === 'rich'` **and** `hasRichWorkoutSetInMetadata(sourceMetadata)`.
- `buildWorkoutLogExercisePayloadFromLogs` — completed sets only (`done: true`).

---

## Snapshot rules

1. Deep-clone **only** `ai_workout_factory` from source metadata — no full task clone.
2. Do **not** rewrite factory `formatParams` when AMRAP extra rounds lengthen flat `set_logs`.
3. Flat-only sources: version + `exercises` only.

---

## Edge cases (documented)

| Scenario               | Factory                | Flat `exercises`                            |
| ---------------------- | ---------------------- | ------------------------------------------- |
| Tabata 8 rounds logged | Unchanged prescription | `sets` / `set_logs` reflect completed count |
| AMRAP extra rounds     | Untouched              | Longer `set_logs`; M8.3 overlays on read    |
| Zero done sets         | Still attached (rich)  | `sets: 0`, empty `set_logs`                 |
| Flat-only source       | Omitted                | Payload only                                |

---

## Verification

```bash
pnpm exec vitest run src/lib/workout-factory/build-workout-log-finish-metadata.test.ts
pnpm run check
```

**Manual QA:** Finish rich Tabata → confirm `metadata.ai_workout_factory` + `workout_log_schema_version: 1` on new `workout_log`. Rich display with set overlay is **M8.3**.

---

## Follow-up

- **M8.3** — History read parity (`WorkoutLogReadSummary`, Task Modal full metadata, viewer precedence).
