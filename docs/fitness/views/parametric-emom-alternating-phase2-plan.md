# Native Alternating EMOMs — Phase 2 (UI Execution)

**Status:** Shipped  
**Parent:** [parametric-emom-alternating-phase1-plan.md](./parametric-emom-alternating-phase1-plan.md) (schema shipped)

**Related:** [parametric-step7-m7.3-plan.md](./parametric-step7-m7.3-plan.md) · [resolve-player-log-row-count.ts](../../../src/lib/workout-factory/resolve-player-log-row-count.ts)

---

## Goal

Wire Phase 1 `is_alternating` + `alternating_stations` into WorkoutPlayer:

1. **Row count allocation** — each exercise gets one log row per minute it is active (not `total_rounds` for every exercise).
2. **Highlight routing** — timer `roundIndex` maps through the cycle to `activeStationIndices`; only matching exercises highlight the correct local set row.

Legacy EMOM (`is_alternating` absent/false) unchanged.

---

## Shipped deliverables

| Artifact         | Path                                                                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alternating math | [`resolve-emom-alternating.ts`](../../../src/lib/workout-factory/interval-timer/resolve-emom-alternating.ts)                                                   |
| Row counts       | [`resolve-player-log-row-count.ts`](../../../src/lib/workout-factory/resolve-player-log-row-count.ts)                                                          |
| Timer snapshot   | [`emom-timer-engine.ts`](../../../src/lib/workout-factory/interval-timer/emom-timer-engine.ts)                                                                 |
| Player highlight | [`WorkoutPlayerBlockList.tsx`](../../../src/components/fitness/workout-block-renderer/WorkoutPlayerBlockList.tsx)                                              |
| Fixture          | [`workout-session-view-model.fixtures.ts`](../../../src/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures.ts) `richAlternatingEmomMetadata` |

---

## Row-count formula

```
rowCount(e) = | { r ∈ [0, R) : e ∈ alternating_stations[r mod L] } |
```

| Scenario | R   | Cycle           | A   | B   | C   |
| -------- | --- | --------------- | --- | --- | --- |
| A/B/C    | 10  | `[[0],[1],[2]]` | 4   | 3   | 3   |
| A / B+C  | 12  | `[[0],[1,2]]`   | 6   | 6   | 6   |

---

## Highlight flow

```
roundIndex → cycle[roundIndex % L] → activeStationIndices
Per exercise: localActiveSetIndex = indexOf(roundIndex) in appearance list for that station
```

---

## Verification

```bash
pnpm exec vitest run \
  src/lib/workout-factory/interval-timer/resolve-emom-alternating.test.ts \
  src/lib/workout-factory/interval-timer/emom-timer-engine.test.ts \
  src/lib/workout-factory/interval-timer/resolve-emom-timer-config.test.ts \
  src/lib/workout-factory/resolve-player-log-row-count.test.ts \
  src/components/fitness/workout-block-renderer/WorkoutPlayerBlockList.test.tsx
```

**Manual QA:** 12-min `[[0],[1,2]]` — A/B/C each 6 rows; minute 2 highlights B+C only.

---

## Follow-up (Phase 3)

Shipped: [parametric-emom-alternating-phase3-plan.md](./parametric-emom-alternating-phase3-plan.md) — whiteboard taxonomy on block subtitles.
