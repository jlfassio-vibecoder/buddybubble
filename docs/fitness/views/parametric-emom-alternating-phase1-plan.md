# Native Alternating EMOMs — Phase 1 (Schema Upgrade)

**Status:** Shipped (Phase 1 — schema + parser + tests; no player UI)  
**Epic:** Native Alternating EMOMs (post–Parametric Workout Blocks Step 8)  
**Prerequisite:** [parametric-step7-m7.3-plan.md](./parametric-step7-m7.3-plan.md) (EMOM shell shipped; multi-exercise highlight deferred) · [parametric-step8-plan.md](./parametric-step8-plan.md) (factory snapshot on finish)

**Related:** [Workout UI landscape audit](./README.md) · [block-blueprint-library.ts](../../../src/lib/agents/coach/block-blueprint-library.ts) · [rail-composer-tokens.md](../../agents/coach/rail-composer-tokens.md)

---

## Problem statement — the Density Circuit Trap

Today, alternating EMOM prescriptions (e.g. Minute 1 = Deadlift, Minute 2 = Push-ups + Air Squat) are often modeled as **`circuit`** blocks or flat multi-exercise EMOM rows with **implicit A/B modulo** against `exercises.length`. That loses:

| Lost intent                    | Why it breaks                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| **Per-minute station mapping** | Modulo `(minute - 1) % exerciseCount` cannot express “minute 2 = two movements, minute 1 = one.” |
| **Complex minutes**            | A single minute slot may highlight **multiple** exercise indices (shared work window).           |
| **EMOM semantics**             | `circuit` implies round-robin completion, not fixed-interval minute boundaries.                  |

**Phase 1 goal:** Extend the closed-world **`emom` `formatParams`** contract so Coach merge, parse, and factory persistence can store an **explicit alternating station map** without changing player/timer behavior yet.

**Phase 1 non-goals:** WorkoutPlayer highlight routing, log row allocation per exercise, subtitle copy, Coach prompt examples beyond schema keys, live-video timers.

---

## Schema inventory (current state)

There is **no standalone Zod schema** for `formatParams`. The codebase uses a **closed-world allowlist + normalizer + shape validator** pattern:

| Layer                                     | Path                                                                                                                                                                                | Role                                                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Allowlist + normalize + validate**      | [`src/lib/agents/coach/block-blueprint-library.ts`](../../../src/lib/agents/coach/block-blueprint-library.ts)                                                                       | `FORMAT_PARAM_KEYS_BY_FORMAT`, `normalizeFormatParams`, `validateBlockShape`                                  |
| **Deno mirror**                           | [`supabase/functions/agents/coach/block-blueprint-library.ts`](../../../supabase/functions/agents/coach/block-blueprint-library.ts)                                                 | Byte-for-byte with client copy                                                                                |
| **Coach structured output (Vertex JSON)** | [`src/lib/agents/coach/schema.ts`](../../../src/lib/agents/coach/schema.ts) · supabase mirror                                                                                       | `format_params` object properties on `proposed_workout_metadata.blocks[]`                                     |
| **Parse pipeline**                        | [`src/lib/agents/coach/parse.ts`](../../../src/lib/agents/coach/parse.ts)                                                                                                           | Calls `normalizeFormatParams` + `validateBlockShape` before merge                                             |
| **Factory storage**                       | [`src/lib/workout-factory/types/ai-program.ts`](../../../src/lib/workout-factory/types/ai-program.ts)                                                                               | `ExerciseBlock.formatParams?: Record<string, unknown>` (untyped bag today)                                    |
| **Merge / hydration**                     | [`src/lib/agents/_shared/workout-metadata/merge-coach-proposed-into-task-metadata.ts`](../../../src/lib/agents/_shared/workout-metadata/merge-coach-proposed-into-task-metadata.ts) | EMOM: derives per-exercise `workSeconds` / `restSeconds` from `interval_seconds` + `rest_in_interval_seconds` |
| **Read subtitle (unchanged P1)**          | [`src/lib/workout-factory/format-block-subtitle.ts`](../../../src/lib/workout-factory/format-block-subtitle.ts)                                                                     | `formatEmom` — duration labels only                                                                           |

### Current EMOM keys (`FORMAT_PARAM_KEYS_BY_FORMAT.emom`)

```ts
['interval_seconds', 'total_minutes', 'total_rounds', 'rest_in_interval_seconds'];
```

### Current EMOM shape rules (`validateBlockShape`)

- Requires `interval_seconds > 0`
- Requires `total_minutes > 0` **or** `total_rounds > 0`
- No exercise-count coupling (cardinality not enforced for EMOM)

### Current merge behavior (preserve in Phase 1)

When `block_format === 'emom'`, merge still hydrates missing `workSeconds` / `restSeconds` on each exercise row from interval params. **New keys must pass through untouched** on `formatParams` after normalize.

---

## Proposed contract

### New optional fields

| Key                    | Type                    | Semantics                                                                                                                                                                                                 |
| ---------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `is_alternating`       | `boolean` (optional)    | When `true`, minute highlights follow `alternating_stations` instead of implicit single-column / modulo behavior. **Absent or `false` = legacy EMOM.**                                                    |
| `alternating_stations` | `number[][]` (optional) | **Cycle template** of 0-based exercise indices **within the block**. Example: `[[0], [1, 2]]` → minute 1 → exercise 0; minute 2 → exercises 1 and 2; minute 3 → wraps to `[0]`; minute 4 → `[1, 2]`; etc. |

**Indexing rule (for downstream phases — document now, implement in Phase 2):**

```ts
// minuteIndex: 0-based round index from EMOM timer (roundIndex)
const cycle = alternating_stations;
const stationIndices = cycle[minuteIndex % cycle.length] ?? [];
```

**Legacy default (backward compatibility):**

| Input                                         | Normalized output                                                | Behavior                                   |
| --------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------ |
| `{}` / no EMOM extras                         | unchanged                                                        | Same as today                              |
| `is_alternating` omitted                      | key omitted                                                      | Treated as `false`                         |
| `is_alternating: false`                       | `is_alternating: false`                                          | `alternating_stations` stripped if present |
| `is_alternating: true` without valid stations | block **dropped** at parse (`emom_alternating_invalid_stations`) | Fail closed on malformed Coach output      |

### TypeScript surface (new, optional but recommended)

Add a narrow helper type (new file keeps `ai-program.ts` unchanged):

**New:** [`src/lib/workout-factory/types/emom-format-params.ts`](../../../src/lib/workout-factory/types/emom-format-params.ts)

```ts
/** 0-based exercise index within an EMOM block. */
export type EmomStationIndex = number;

/** One minute slot in an alternating EMOM cycle (may list multiple stations). */
export type EmomAlternatingMinute = readonly EmomStationIndex[];

/** Closed-world EMOM formatParams (superset of legacy keys). */
export type EmomFormatParams = {
  interval_seconds?: number;
  total_minutes?: number;
  total_rounds?: number;
  rest_in_interval_seconds?: number;
  is_alternating?: boolean;
  alternating_stations?: readonly EmomAlternatingMinute[];
};

/** Type guard for normalized EMOM params (optional consumer helper). */
export function isAlternatingEmomParams(
  params: Record<string, unknown>,
): params is EmomFormatParams & {
  is_alternating: true;
  alternating_stations: readonly EmomAlternatingMinute[];
};
```

`ExerciseBlock.formatParams` remains `Record<string, unknown>` — no breaking change to the factory tree.

---

## File change matrix (Phase 1 implementation)

| #   | File                                                         | Change                                                                                                                 |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/lib/agents/coach/block-blueprint-library.ts`            | Extend EMOM allowlist; normalize booleans + station arrays; extend `validateBlockShape`; update blueprint prompt prose |
| 2   | `supabase/functions/agents/coach/block-blueprint-library.ts` | Mirror #1                                                                                                              |
| 3   | `src/lib/agents/coach/block-blueprint-library.test.ts`       | Normalization + validation cases (see Test strategy)                                                                   |
| 4   | `src/lib/agents/coach/schema.ts`                             | Add `is_alternating`, `alternating_stations` to `format_params.properties`; extend EMOM description string             |
| 5   | `supabase/functions/agents/coach/schema.ts`                  | Mirror #4                                                                                                              |
| 6   | `src/lib/workout-factory/types/emom-format-params.ts`        | New typed exports + `isAlternatingEmomParams` guard                                                                    |
| 7   | `src/lib/agents/coach/parse.test.ts`                         | End-to-end parse fixtures: alternating EMOM accepted; invalid stations dropped                                         |
| 8   | `docs/agents/coach/rail-composer-tokens.md`                  | EMOM row: document new keys                                                                                            |
| 9   | `docs/fitness/views/README.md`                               | Link this plan under a new “Native Alternating EMOMs” epic pointer                                                     |

**Explicitly out of scope for Phase 1 file matrix:**

- `WorkoutPlayerBlockList.tsx`, `EmomIntervalShell.tsx`, `resolve-player-log-row-count.ts`
- `format-block-subtitle.ts`
- `merge-coach-proposed-into-task-metadata.ts` logic changes (only verify pass-through via existing JSON clone)
- `pnpm check:agent-prompts` fixture updates if Direction B flags new keys — run and fix in same PR

---

## Normalization design (`normalizeFormatParams`)

Extend the EMOM branch in [`normalizeFormatParams`](../../../src/lib/agents/coach/block-blueprint-library.ts):

### `is_alternating`

```ts
// Pseudocode — follow existing direction/target_rpe patterns
if (key === 'is_alternating') {
  if (v === true) out.is_alternating = true;
  else if (v === false) out.is_alternating = false;
  // omit when absent or non-boolean
  continue;
}
```

### `alternating_stations`

```ts
function normalizeAlternatingStations(raw: unknown): number[][] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: number[][] = [];
  for (const minute of raw) {
    if (!Array.isArray(minute) || minute.length === 0) return null;
    const indices: number[] = [];
    for (const idx of minute) {
      if (typeof idx !== 'number' || !Number.isFinite(idx)) return null;
      const i = Math.trunc(idx);
      if (i < 0) return null;
      indices.push(i);
    }
    out.push(indices);
  }
  return out;
}
```

**Post-normalize hygiene when `is_alternating !== true`:** delete `alternating_stations` from `out` even if raw included it (prevents silent storage of unused maps).

**Deduping within a minute slot:** preserve order, optionally dedupe duplicate indices in the same minute array (implementation choice — recommend dedupe for stable comparisons).

---

## Shape validation design (`validateBlockShape`)

Add drop reason to `BlockShapeDropReason`:

```ts
| 'emom_alternating_invalid_stations'
```

Extend `case 'emom':`:

1. Existing checks unchanged (`interval_seconds`, duration).
2. When `params.is_alternating === true`:
   - `alternating_stations` must be a non-empty array (after normalize).
   - Every index must satisfy `0 <= index < exercisesLength`.
   - **Optional strict rule:** reject duplicate indices across the whole cycle if product wants disjoint stations only — **defer**; allow `[1, 1]` for now (same movement twice in one minute is valid).
3. When `params.is_alternating !== true`: do not require `alternating_stations`.

**Round count vs cycle length:** Phase 1 does **not** require `alternating_stations.length === total_rounds`. The cycle **repeats** until `resolveEmomTotalRounds` is exhausted (Phase 2 player uses modulo).

---

## Merge / hydration backward compatibility

| Scenario                                                 | Expected Phase 1 outcome                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Legacy EMOM `{ interval_seconds, total_minutes }`        | No new keys on block; merge hydration unchanged                                                  |
| Non-alternating EMOM with extra unknown keys in raw JSON | Stripped by allowlist (existing behavior)                                                        |
| `is_alternating: true` + valid stations                  | Keys persist on `exerciseBlocks[].formatParams`; factory snapshot on finish (M8.2) includes them |
| `is_alternating: true` + invalid indices                 | Block dropped at parse; never reaches merge                                                      |
| `is_alternating: false` + `alternating_stations` in raw  | Normalize strips stations; block saved as standard EMOM                                          |
| Rich metadata round-trip via `sync-workout-metadata`     | `formatParams` spread copy already preserves new keys — add one test                             |

**No new merge-time derivation** in Phase 1 (e.g. do not auto-synthesize `[[0],[1]]` from two exercises). Auto-fill belongs in Coach prompt / Lane 1 templates (later phase).

---

## Coach schema (Vertex JSON) additions

In `format_params.properties` ([`schema.ts`](../../../src/lib/agents/coach/schema.ts)):

```ts
is_alternating: {
  type: 'BOOLEAN',
  nullable: true,
  description:
    'EMOM only. When true, minute highlights follow alternating_stations instead of a single exercise column. Omit or false for legacy EMOM.',
},
alternating_stations: {
  type: 'ARRAY',
  nullable: true,
  description:
    'EMOM only when is_alternating is true. Cycle of minute slots; each slot is an array of 0-based exercise indices within this block. Example [[0],[1,2]]: minute 1 → exercise 0; minute 2 → exercises 1 and 2; repeats each cycle.length minutes.',
  items: {
    type: 'ARRAY',
    items: { type: 'INTEGER' },
  },
},
```

Update the EMOM sentence in `buildBlockBlueprintLibraryPrompt()`:

> Optional: `is_alternating` (boolean), `alternating_stations` (array of index arrays, 0-based within `exercises[]`). Use when minutes alternate different station sets — e.g. `[[0],[1,2]]` for A / B+C pacing. Do **not** use `circuit` for minute-bound alternating work.

---

## Unit test strategy

### A. `block-blueprint-library.test.ts`

| Test                                | Assert                                                                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy EMOM normalize               | `{ interval_seconds: 60, total_minutes: 12 }` unchanged; no alternating keys                                                                   |
| Boolean normalize                   | `'true'` string rejected; `true`/`false` preserved                                                                                             |
| Stations normalize                  | `[[0], [1, 2]]` preserved; floats truncated; negative indices dropped → null                                                                   |
| Strip stations when not alternating | Raw `{ is_alternating: false, alternating_stations: [[0]] }` → no `alternating_stations` key                                                   |
| Valid alternating shape             | `validateBlockShape('emom', 3, { interval_seconds: 60, total_minutes: 10, is_alternating: true, alternating_stations: [[0],[1,2]] })` → `null` |
| Index out of range                  | 3 exercises, index `3` in stations → `'emom_alternating_invalid_stations'`                                                                     |
| Missing stations when alternating   | `is_alternating: true` only → `'emom_alternating_invalid_stations'`                                                                            |
| Legacy shape still passes           | No `is_alternating` with 2 exercises → `null`                                                                                                  |

### B. `parse.test.ts`

| Test                     | Assert                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------- |
| Accept alternating block | `parseProposedWorkoutMetadataWithDrops` returns block with normalized `format_params` |
| Drop invalid alternating | `drops` contains `{ reason: 'emom_alternating_invalid_stations' }`                    |

### C. `sync-workout-metadata.test.ts` (one case)

Round-trip `applyWorkoutEditsToMetadata` or view→block sync preserves `is_alternating` + `alternating_stations` on main block.

### D. Optional pure helper tests (if added in Phase 1)

If we ship `resolveEmomActiveStationIndices(params, minuteIndex)` in `src/lib/workout-factory/interval-timer/` as a **read-only helper** for Phase 2 consumers:

- minute 0 → `[0]`, minute 1 → `[1,2]`, minute 2 → `[0]` for cycle `[[0],[1,2]]`
- legacy params → `null` (caller uses existing highlight path)

**Recommendation:** include helper + tests in Phase 1 **only if** zero UI wiring; otherwise defer helper to Phase 2 to keep Phase 1 strictly schema/parser.

---

## Verification commands (Phase 1 PR)

```bash
pnpm exec vitest run \
  src/lib/agents/coach/block-blueprint-library.test.ts \
  src/lib/agents/coach/parse.test.ts \
  src/lib/workout-factory/sync-workout-metadata.test.ts

pnpm run check:agent-prompts   # if schema/prompt strings changed
pnpm run check
```

---

## Example payloads

### Legacy (unchanged)

```json
{
  "block_format": "emom",
  "format_params": {
    "interval_seconds": 60,
    "total_minutes": 16
  },
  "exercises": [{ "name": "KB Swing", "sets": 1, "reps": "15" }]
}
```

### Alternating A / B+C (new)

```json
{
  "block_format": "emom",
  "format_params": {
    "interval_seconds": 60,
    "total_minutes": 12,
    "is_alternating": true,
    "alternating_stations": [[0], [1, 2]]
  },
  "exercises": [
    { "name": "Deadlift", "sets": 1, "reps": "5" },
    { "name": "Push-up", "sets": 1, "reps": "10" },
    { "name": "Air Squat", "sets": 1, "reps": "15" }
  ]
}
```

---

## Follow-up phases (not Phase 1)

| Phase       | Scope                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Phase 2** | Player: per-minute multi-exercise highlight via `alternating_stations`; row counts per exercise from station frequency |
| **Phase 3** | Read surfaces: subtitle “Alternating EMOM · A / B+C”, `WorkoutLogReadSummary` minute labels                            |
| **Phase 4** | Coach prompt / Lane 1 `:emom` templates; block mention catalog defaults                                                |

---

## Execution protocol

> **Strict rule:** Phase 1 merges **schema + parser + tests + docs only**. No WorkoutPlayer or timer engine changes until this plan is reviewed and approved.

After review approval, implement in a single PR titled along the lines of: `feat(fitness): add alternating EMOM formatParams schema (Phase 1)`.
