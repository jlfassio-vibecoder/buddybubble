# Parametric Step 7 — M7.1 (Core Timer Engine & Tabata Shell)

**Status:** Shipped (2026-05-20)

**Master plan:** [parametric-step7-plan.md](./parametric-step7-plan.md)

---

## Shipped scope

- Shared timer: [`src/lib/timer/`](../../../src/lib/timer/), [`src/components/timer/`](../../../src/components/timer/)
- Pure engine: [`src/lib/workout-factory/interval-timer/`](../../../src/lib/workout-factory/interval-timer/)
- Hook: [`src/hooks/use-interval-timer-engine.ts`](../../../src/hooks/use-interval-timer-engine.ts)
- Shell: [`src/components/fitness/interval-shells/TabataIntervalShell.tsx`](../../../src/components/fitness/interval-shells/TabataIntervalShell.tsx)
- Player wiring: [`WorkoutPlayerBlockList.tsx`](../../../src/components/fitness/workout-block-renderer/WorkoutPlayerBlockList.tsx), active-row highlight in [`WorkoutPlayerExercisePanel.tsx`](../../../src/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel.tsx)

## Resolved decisions

| Topic         | Decision                                                    |
| ------------- | ----------------------------------------------------------- |
| Timer modules | `@/lib/timer` + `@/components/timer`; live-video re-exports |
| Auto-run      | rAF `tick` when `remainingMs <= 0`                          |
| Row editing   | Highlight only; inputs never disabled                       |
| Multi-block   | Per-`block.id` snapshot map                                 |

## Verification

```bash
pnpm exec vitest run \
  src/lib/workout-factory/interval-timer \
  src/components/fitness/workout-block-renderer/WorkoutPlayerBlockList.test.tsx
```

**Manual QA:** Rich Tabata card → Start → 8× WORK/REST; row highlight 0→7; pause/resume; edit any row while running.

## Next

[M7.2 sub-plan](./parametric-step7-m7.2-plan.md) (not started) — local AMRAP shell.
