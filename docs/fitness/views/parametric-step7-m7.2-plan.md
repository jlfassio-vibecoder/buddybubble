# Parametric Step 7 — M7.2 (Local AMRAP Shell & Grid Extension)

**Status:** Shipped (2026-05-21)

**Master plan:** [parametric-step7-plan.md](./parametric-step7-plan.md)

**Prerequisite:** [parametric-step7-m7.1-plan.md](./parametric-step7-m7.1-plan.md) (Tabata shell + shared timer modules)

---

## Shipped scope

| Module                 | Path                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AMRAP config           | [`resolve-amrap-timer-config.ts`](../../../src/lib/workout-factory/interval-timer/resolve-amrap-timer-config.ts)                                                                                             |
| AMRAP countdown engine | [`amrap-timer-engine.ts`](../../../src/lib/workout-factory/interval-timer/amrap-timer-engine.ts)                                                                                                             |
| Row append helper      | [`append-amrap-round-rows.ts`](../../../src/lib/workout-factory/interval-timer/append-amrap-round-rows.ts)                                                                                                   |
| React hook             | [`use-amrap-timer-engine.ts`](../../../src/hooks/use-amrap-timer-engine.ts)                                                                                                                                  |
| Shell                  | [`AmrapIntervalShell.tsx`](../../../src/components/fitness/interval-shells/AmrapIntervalShell.tsx)                                                                                                           |
| Player wiring          | [`WorkoutPlayer.tsx`](../../../src/components/fitness/WorkoutPlayer.tsx) `logAmrapRound` → [`WorkoutPlayerBlockList.tsx`](../../../src/components/fitness/workout-block-renderer/WorkoutPlayerBlockList.tsx) |

## Resolved decisions

| Topic          | Decision                                                                           |
| -------------- | ---------------------------------------------------------------------------------- |
| Timer          | Dedicated AMRAP engine (`idle \| running \| paused \| done`), not Tabata work/rest |
| Log Round      | Copies last row weight/reps/rpe; `done: false`                                     |
| Callback owner | `WorkoutPlayer.logAmrapRound(blockId)`                                             |
| M6.2 Coach     | `liveSetCounts` auto-updates from `logs.map(row => row.length)` — no extra wiring  |
| Live-video     | No `amrap_*` RPCs or `useAmrapSetDuplication`                                      |

## Verification

```bash
pnpm exec vitest run \
  src/lib/workout-factory/interval-timer \
  src/components/fitness/workout-block-renderer/WorkoutPlayerBlockList.test.tsx
```

**Manual QA:** Rich AMRAP → Start countdown → Log Round ×N → row growth; Coach fill on new rows.

## Next

[M7.3](./parametric-step7-m7.3-plan.md) — EMOM shell (shipped).
