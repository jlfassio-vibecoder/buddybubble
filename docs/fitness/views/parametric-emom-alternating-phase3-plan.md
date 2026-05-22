# Native Alternating EMOMs — Phase 3 (Taxonomy and Subtitles)

**Status:** Shipped  
**Parent:** [parametric-emom-alternating-phase2-plan.md](./parametric-emom-alternating-phase2-plan.md) (UI shipped) · [parametric-emom-alternating-phase1-plan.md](./parametric-emom-alternating-phase1-plan.md) (schema)

---

## Goal

Translate `alternating_stations` into S&C whiteboard vernacular on block subtitles (e.g. `[[0], [1, 2]]` → `A / B+C`), inherited by all read surfaces via `WorkoutSessionViewModel.block.subtitle`.

---

## Shipped deliverables

| Artifact             | Path                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| Taxonomy formatter   | [`format-alternating-taxonomy.ts`](../../../src/lib/workout-factory/format-alternating-taxonomy.ts)  |
| EMOM subtitle branch | [`format-block-subtitle.ts`](../../../src/lib/workout-factory/format-block-subtitle.ts) `formatEmom` |

---

## Example outputs

| Cycle           | Subtitle fragment                        |
| --------------- | ---------------------------------------- |
| `[[0],[1,2]]`   | `12 Min Alternating EMOM (A / B+C)`      |
| `[[0],[1],[2]]` | `10 Rounds Alternating EMOM (A / B / C)` |
| Legacy EMOM     | `16 Min EMOM (Every 60s)` unchanged      |

---

## Read surfaces (no layout changes)

- `WorkoutBlockListRenderer` / `WorkoutBlockHeader`
- `WorkoutPlayerBlockList`
- `WorkoutLogReadSummary`
- `formatRichWorkoutStripSummary` (Coach rail)

---

## Verification

```bash
pnpm exec vitest run \
  src/lib/workout-factory/format-alternating-taxonomy.test.ts \
  src/lib/workout-factory/format-block-subtitle.test.ts \
  src/lib/workout-factory/workout-session-view-model.test.ts \
  src/lib/workout-factory/format-block-summary-line.test.ts \
  src/components/fitness/workout-block-renderer/WorkoutLogReadSummary.test.tsx
```
