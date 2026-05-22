# Parametric Workout Blocks — Step 9 (EMOM Taxonomy & Deterministic Alternating Matrix)

**Status:** Shipped  
**Prerequisites:** [parametric-emom-alternating-phase1-plan.md](./parametric-emom-alternating-phase1-plan.md) (schema shipped) · [parametric-emom-alternating-phase2-plan.md](./parametric-emom-alternating-phase2-plan.md) (player UI shipped) · [parametric-emom-alternating-phase3-plan.md](./parametric-emom-alternating-phase3-plan.md) (subtitles shipped) · Coach `emom_alternating_guide` in workout context (M6.2 extension)

**Related:** [block-blueprint-catalog.ts](../../../src/lib/agents/coach/block-blueprint-catalog.ts) · [block-blueprint-library.ts](../../../src/lib/agents/coach/block-blueprint-library.ts) · [parse.ts](../../../src/lib/agents/coach/parse.ts) · [rail-composer-tokens.md](../../agents/coach/rail-composer-tokens.md)

---

## Executive summary

Athletes and coaches need EMOM picker tags that match **clinical intent** (alternating vs straight vs density), and the server must stop relying on the LLM to emit a correct `alternating_stations` matrix. Phase 1 already fail-closes when `is_alternating: true` but stations are missing (`emom_alternating_invalid_stations`). Step 9 closes the loop:

1. **Rename catalog focus tokens** so `:…/emom/…` tags explicitly encode EMOM mode in `format_params`.
2. **Deterministic matrix hydration** — when `is_alternating === true` and `alternating_stations` is absent/empty, the server builds `[[0], [1], …, [n-1]]` from exercise count **before** `validateBlockShape`.

**Hybrid contract:** LLM picks exercises, loads, and reps; code owns zero-based modulo math.

```mermaid
flowchart LR
  Tag["`:main/emom/alternating` mention"]
  LLM["Coach JSON blocks[]"]
  Norm[normalizeFormatParams]
  Hydrate[hydrateEmomAlternatingStations]
  Val[validateBlockShape]
  Merge[mergeCoachProposedIntoTaskMetadata]
  Player[WorkoutPlayer Phase 2 UI]

  Tag --> LLM
  LLM --> Norm --> Hydrate --> Val --> Merge --> Player
```

---

## Review of the proposed fix

### What is correct

| Proposal                                                                               | Verdict                                                                         |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Rename UX focus from `pacing` → `alternating`, `threshold` → `density`, add `straight` | **Agree** — aligns picker language with Phase 1–3 semantics                     |
| Catalog `format_params` includes `is_alternating: true` for alternating presets        | **Agree** — must also widen mention + catalog types to allow **boolean** params |
| Auto-generate `[[0], [1], …, [n-1]]` when flag is set and matrix missing               | **Agree** — matches default A/B/C one-station-per-minute alternating            |
| Intercept **before** strict validation                                                 | **Agree** — today blocks are **dropped**, not repaired                          |

### Corrections (important)

1. **There is no `AreaFilesNormalizer.ts` or Zod `EmomFormatParamsSchema`.**  
   Phase 1 uses [`normalizeFormatParams`](../../../src/lib/agents/coach/block-blueprint-library.ts) + [`validateBlockShape`](../../../src/lib/agents/coach/block-blueprint-library.ts) in [`parse.ts`](../../../src/lib/agents/coach/parse.ts). The interceptor belongs in **`block-blueprint-library.ts`** (exported helper) and is invoked from every path that calls `validateBlockShape` with a known exercise count.

2. **Token shape is 3-segment, not `:emom/alternating`.**  
   Catalog uses `catalogToken(phase, structure, focus)` → `:phase/structure/focus ` (e.g. `:main/emom/pacing ` today). Step 9 should rename **focus** (and labels), not collapse to two segments:
   - `:main/emom/alternating `
   - `:main/emom/straight `
   - `:metcon/emom/density ` (was `:metcon/emom/threshold `)

   Optional follow-up: a dedicated `:emom/…` two-segment scheme requires refactoring `catalogToken` and all composer tests — **out of scope for M9.1**.

3. **`normalizeFormatParams` does not receive exercise count today.**  
   Hydration must run in the **caller** (parse / lane preflight / merge-adjacent paths), not inside normalize alone:

   ```ts
   let params = normalizeFormatParams('emom', raw);
   params = hydrateEmomAlternatingStations(exerciseCount, params);
   validateBlockShape('emom', exerciseCount, params);
   ```

4. **Default matrix is not universal alternating.**  
   `[[0], [1], [2], [3]]` is **one station per minute, cycling A→B→C→D**. It does **not** express A / B+C combined minutes. Complex cycles still require an explicit `alternating_stations` from the model or a **future** catalog preset (e.g. `:main/emom/alternating-combo` with `[[0],[1,2]]` baked in). Document this limit in the blueprint library prose.

5. **“Straight” vs “density” clinical mapping**

   | Tag focus     | `is_alternating`       | Player behavior (Phase 2)                                                              |
   | ------------- | ---------------------- | -------------------------------------------------------------------------------------- |
   | `alternating` | `true` (+ auto matrix) | One station active per minute; uneven row counts                                       |
   | `straight`    | `false` (explicit)     | Legacy EMOM — typically **one exercise** in block; all minutes same movement           |
   | `density`     | `false`                | Legacy multi-exercise EMOM — each exercise gets `total_rounds` rows (parallel columns) |

   “Density” here means **every exercise every minute** (high simultaneous volume), not AMRAP-for-time.

6. **Multiple code paths must hydrate**, not only Lane 3 parse:
   - [`parseProposedWorkoutMetadataWithDrops`](../../../src/lib/agents/coach/parse.ts) (full Coach schema)
   - [`block-blueprint-lane-preflight.ts`](../../../supabase/functions/agents/coach/block-blueprint-lane-preflight.ts) `blocksMeetCardinality` (Lane 1 deterministic append)
   - Optionally [`synthesizeProposedBlocksFromMentions`](../../../src/lib/agents/coach/block-blueprint-synthesize.ts) once exercise cardinality is known

7. **DB storage unchanged.**  
   Tags remain ephemeral on `messages.metadata.block_blueprint_mentions`. Persisted shape is still `blockFormat: 'emom'` + `formatParams` on `tasks.metadata` — no string `:emom/alternating` on blocks.

---

## Milestones

### M9.1 — Catalog taxonomy & mention contract

**Goal:** Picker tokens and default `format_params` encode EMOM mode without LLM guesswork.

| Current id / token                                 | New focus                                | `format_params` delta                                                           |
| -------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| `main-emom-pacing` → `:main/emom/pacing`           | `alternating` → `:main/emom/alternating` | Add `is_alternating: true` (no matrix in catalog)                               |
| `finisher-emom-pacing`                             | `alternating`                            | Same                                                                            |
| `metcon-emom-threshold` → `:metcon/emom/threshold` | `density` → `:metcon/emom/density`       | `is_alternating: false` (explicit)                                              |
| _(new)_ `main-emom-straight`                       | `straight`                               | `is_alternating: false`; defaults `{ interval_seconds: 60, total_minutes: 10 }` |

**Also update:**

- Labels / `searchAliases` (keep `pacing`, `threshold`, `interval` as **search-only** aliases where helpful)
- [`BlockBlueprintCatalogEntry.format_params`](../../../src/lib/agents/coach/block-blueprint-catalog.ts) type: `Record<string, number | string | boolean>`
- [`parseBlockBlueprintMentionsFromMetadata`](../../../src/lib/agents/coach/block-blueprint-mentions.ts) — accept boolean values
- [`docs/agents/coach/rail-composer-tokens.md`](../../agents/coach/rail-composer-tokens.md) — token table

**Out of scope:** Renaming `:cardio/hiit/threshold` (structure is `hiit`, not `emom`).

**Acceptance:**

- Searching “pacing” in `:` picker still finds alternating EMOM presets
- Sending `:main/emom/alternating` produces mention payload with `is_alternating: true` and no `alternating_stations`

---

### M9.2 — Deterministic matrix hydrator

**Goal:** Repair incomplete alternating EMOM params before validation; mirror to Deno.

**New export** in [`block-blueprint-library.ts`](../../../src/lib/agents/coach/block-blueprint-library.ts):

```ts
/**
 * When is_alternating is true and alternating_stations is missing/empty,
 * inject [[0], [1], ..., [n-1]] for n exercises. Otherwise return params unchanged.
 * Does not overwrite a non-empty matrix (LLM or catalog may supply A/B+C).
 */
export function hydrateEmomAlternatingStations(
  exerciseCount: number,
  params: Record<string, unknown>,
): Record<string, unknown>;
```

**Wire before `validateBlockShape`:**

| File                                                                                                                                              | When                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| [`src/lib/agents/coach/parse.ts`](../../../src/lib/agents/coach/parse.ts)                                                                         | Each block in `parseProposedWorkoutMetadataWithDrops` |
| [`supabase/functions/agents/coach/parse.ts`](../../../supabase/functions/agents/coach/parse.ts)                                                   | Mirror                                                |
| [`supabase/functions/agents/coach/block-blueprint-lane-preflight.ts`](../../../supabase/functions/agents/coach/block-blueprint-lane-preflight.ts) | `blocksMeetCardinality`                               |

**Rules:**

- Only when `block_format === 'emom'` and `params.is_alternating === true`
- Only when `alternating_stations` missing or `[]`
- Require `exerciseCount >= 1`; if `0`, skip hydration (validation still drops)
- If `exerciseCount === 1`, hydrate `[[0]]` (degenerate but valid)

**Acceptance:**

- Payload `{ is_alternating: true, interval_seconds: 60, total_minutes: 12 }` + 3 exercises → passes validation with `[[0],[1],[2]]`
- Payload with explicit `[[0],[1,2]]` → **unchanged** (hydrator does not overwrite)
- Payload `{ is_alternating: true }` + 0 exercises → still `emom_alternating_invalid_stations` or block skip

---

### M9.3 — Tests & prompt alignment

**Goal:** Lock behavior; reduce LLM matrix hallucination in prompts.

**Tests:**

| File                                                                                                 | Cases                                                                                     |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [`block-blueprint-library.test.ts`](../../../src/lib/agents/coach/block-blueprint-library.test.ts)   | `hydrateEmomAlternatingStations` unit tests (0, 1, 4 exercises; preserve explicit matrix) |
| [`block-blueprint-catalog.test.ts`](../../../src/lib/agents/coach/block-blueprint-catalog.test.ts)   | Token strings + `is_alternating` on alternating presets                                   |
| [`parse.test.ts`](../../../src/lib/agents/coach/parse.test.ts)                                       | End-to-end: Gemini block JSON without `alternating_stations` → not in `drops`             |
| [`block-blueprint-mentions.test.ts`](../../../src/lib/agents/coach/block-blueprint-mentions.test.ts) | Boolean `format_params` round-trip                                                        |

**Prompt / schema (light touch):**

- [`block-blueprint-library.ts`](../../../src/lib/agents/coach/block-blueprint-library.ts) `buildBlockBlueprintLibraryPrompt` — one line: _“For alternating EMOM, set `is_alternating: true`; omit `alternating_stations` for simple A/B/C rotation — server auto-builds the matrix.”_
- [`schema.ts`](../../../src/lib/agents/coach/schema.ts) `alternating_stations` description — same guidance (mirror Deno)

**Do not** add long new directives to `ACTIVE_WORKOUT_EXECUTION_STATE_DIRECTIVE` (execution_patch path is separate).

**Acceptance:**

- `pnpm exec vitest run` on files above green
- `pnpm check:agent-mirror` green

---

### M9.4 — Integration smoke (manual)

1. Task Modal rail: pick `:main/emom/alternating`, tag 3 exercises, send → card block has `is_alternating: true` + `alternating_stations: [[0],[1],[2]]`.
2. Open WorkoutPlayer → row counts 4/3/3 or even split per cycle length; Coach context includes `emom_alternating_guide`.
3. Lane 1 deterministic append (if enabled): same matrix without full Coach schema call.

---

## File checklist

| File                                                                | M9.1   | M9.2     | M9.3     |
| ------------------------------------------------------------------- | ------ | -------- | -------- |
| `src/lib/agents/coach/block-blueprint-catalog.ts`                   | ✓      |          | ✓        |
| `src/lib/agents/coach/block-blueprint-mentions.ts`                  | ✓      |          | ✓        |
| `src/lib/agents/coach/block-blueprint-library.ts`                   |        | ✓        | ✓        |
| `src/lib/agents/coach/parse.ts`                                     |        | ✓        | ✓        |
| `supabase/functions/agents/coach/block-blueprint-library.ts`        |        | ✓ mirror |          |
| `supabase/functions/agents/coach/parse.ts`                          |        | ✓ mirror |          |
| `supabase/functions/agents/coach/block-blueprint-lane-preflight.ts` |        | ✓        |          |
| `supabase/functions/agents/coach/schema.ts`                         |        |          | ✓ mirror |
| `docs/agents/coach/rail-composer-tokens.md`                         | ✓      |          |          |
| `docs/fitness/views/README.md`                                      | ✓ link |          |          |

---

## Out of scope (Step 9)

- Two-segment `:emom/alternating` token refactor (keep `:phase/emom/focus`)
- Auto-hydrating **combined-minute** matrices (A / B+C) without explicit `alternating_stations`
- WorkoutPlayer / timer changes (Phase 2 already consumes hydrated params)
- `execution_patch` / live logging changes
- Postgres schema migrations

---

## Verification commands

```bash
pnpm exec vitest run \
  src/lib/agents/coach/block-blueprint-library.test.ts \
  src/lib/agents/coach/block-blueprint-catalog.test.ts \
  src/lib/agents/coach/block-blueprint-mentions.test.ts \
  src/lib/agents/coach/parse.test.ts

pnpm check:agent-mirror
pnpm run test:deno-integration
```

---

## Follow-up (Step 10 candidate)

- Catalog preset `:main/emom/alternating-combo` with fixed `alternating_stations: [[0],[1,2]]` for whiteboard A / B+C without LLM matrix
- Lane 1 template: when mention is alternating + N exercises, inject matrix in `synthesizeProposedBlocksFromMentions` before cardinality check (avoid Lane 2 round-trip)
