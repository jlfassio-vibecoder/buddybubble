# Parametric Step 7 — M7.3 (Local EMOM Shell)

**Status:** Shipped (2026-05-21)

**Master plan:** [parametric-step7-plan.md](./parametric-step7-plan.md)

**Prerequisite:** [parametric-step7-m7.2-plan.md](./parametric-step7-m7.2-plan.md) (AMRAP shell)

---

## Shipped scope

| Module                 | Path                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| EMOM rounds helper     | [`resolve-emom-total-rounds.ts`](../../../src/lib/workout-factory/interval-timer/resolve-emom-total-rounds.ts)                                |
| EMOM config            | [`resolve-emom-timer-config.ts`](../../../src/lib/workout-factory/interval-timer/resolve-emom-timer-config.ts)                                |
| EMOM reset-loop engine | [`emom-timer-engine.ts`](../../../src/lib/workout-factory/interval-timer/emom-timer-engine.ts)                                                |
| React hook             | [`use-emom-timer-engine.ts`](../../../src/hooks/use-emom-timer-engine.ts)                                                                     |
| Shell                  | [`EmomIntervalShell.tsx`](../../../src/components/fitness/interval-shells/EmomIntervalShell.tsx)                                              |
| M6.1 alignment         | [`resolve-player-log-row-count.ts`](../../../src/lib/workout-factory/resolve-player-log-row-count.ts) via `resolveEmomTotalRounds`            |
| Player wiring          | [`WorkoutPlayerBlockList.tsx`](../../../src/components/fitness/workout-block-renderer/WorkoutPlayerBlockList.tsx) unified `intervalSnapshots` |

## Resolved decisions

| Topic                      | Decision                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| Engine                     | Dedicated EMOM reducer (fixed-reset loop), not Tabata work/rest                           |
| M6.1                       | `total_minutes` / `total_rounds` drive row count (not `formatParams.rounds` alone)        |
| Highlight                  | `IntervalRowSnapshot` shared with Tabata; EMOM uses `activeSetPhase='work'` while running |
| `rest_in_interval_seconds` | Deferred — full-interval countdown only                                                   |
| Live-video                 | No EMOM RPCs or session phases                                                            |

## Verification

```bash
pnpm exec vitest run \
  src/lib/workout-factory/interval-timer \
  src/lib/workout-factory/resolve-player-log-row-count.test.ts \
  src/components/fitness/workout-block-renderer/WorkoutPlayerBlockList.test.tsx

pnpm exec tsc --noEmit
```

**Manual QA:** Rich EMOM 16×60s → 16 rows; Start → countdown resets each minute; highlight advances; pause/resume; done clears highlight.

## Next

[M7.4](./parametric-step7-m7.4-plan.md) — polish (audio, wake lock) shipped.
