# Parametric Block Architecture

> **Status:** blueprint **approved** (phases 11.1–11.5 + product sign-off in §11). Implementation not started in this doc.  
> **Depends on:** Step 10.5 (`proposed_workout_metadata.blocks` declared in Coach schema + rail prompts + `instructions[]` parse passthrough).  
> **Goal:** Replace “AI invents structure” with **Blueprint selection + hydration** — the model picks a format from a fixed library and fills exercises/reps/timers; the server validates and maps into the canonical `workout_set` tree the UI already reads.

---

## 1. Problem statement

Today Coach can emit polymorphic `blocks[]`, but:

| Layer       | Current behavior                                                                                                                                                                                           | Gap                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Schema**  | `blocks[]` has `name`, `exercises[]`, `instructions[]` only ([`src/lib/agents/coach/schema.ts`](../../../src/lib/agents/coach/schema.ts) L120–151).                                                        | No discriminator for AMRAP vs EMOM vs superset; no format-specific parameters.  |
| **Parser**  | Already passes `type`, `rounds`, `duration_min`, `coach_notes` on blocks ([`src/lib/agents/coach/parse.ts`](../../../src/lib/agents/coach/parse.ts) L182–194) — **not** declared in Vertex schema.         | Ad-hoc `type` strings (e.g. `"AMRAP"`) are unvalidated and dropped later.       |
| **Merge**   | [`mergeCoachProposedIntoTaskMetadata`](../../../src/lib/agents/_shared/workout-metadata/merge-coach-proposed-into-task-metadata.ts) routes by **block name regex** only; `newBlock = { name, exercises }`. | Format metadata never reaches `exerciseBlocks`.                                 |
| **UI**      | [`RichWorkoutReadView`](../../../src/components/fitness/workout-viewer-dialog.tsx) section title = `block.name` only.                                                                                      | Cannot render “AMRAP · 12 min” or “EMOM · 60s / 10 min” from structured fields. |
| **Factory** | [`HiitProtocolFormat`](../../../src/lib/workout-factory/types/ai-workout.ts) (`emom`, `tabata`, `amrap`, …) exists for **Kanban generate-workout-chain**, not Coach `blocks`.                              | Two vocabularies; Coach rail does not reuse factory protocol types yet.         |

**Observed failure mode (production):** Coach writes a full narrative in `updated_task_description` while structured `workout_set` stays unchanged, or flat `exercises` append to **Main** instead of a named Finisher block. Parametric blocks address the **structured** half: once formats are constrained, hydration + merge can place finishers and intervals in the right UI sections without prose duplication.

---

## 2. Design principles

1. **Blueprints are closed-world.** The LLM may not invent `block_format` values outside the enum.
2. **Hydration, not invention.** The model selects `block_format` + fills `format_params` + populates `exercises[]` within biomechanical guardrails (existing profile, readiness, equipment).
3. **Validate on the server.** Parser normalizes; merge maps; optional **hydration validator** rejects impossible combos (e.g. EMOM without `interval_seconds`) before RPC persist.
4. **One canonical tree.** Rich cards still persist through `mergeCoachProposedIntoTaskMetadata` → `ai_workout_factory.workout_set` (see [`docs/refactor/workout-metadata-merge/README.md`](../workout-metadata-merge/README.md)).
5. **Backward compatible.** Blocks with no `block_format` infer `straight_sets` and behave like Step 10.5.

---

## 3. Target data model (Coach → persist → UI)

### 3.1 Discriminator: `block_format`

Add to each item in `proposed_workout_metadata.blocks[]`:

| Field           | Type     | Required                    | Notes                                                                         |
| --------------- | -------- | --------------------------- | ----------------------------------------------------------------------------- |
| `name`          | string   | yes                         | Section label (free text): `Warm-up`, `Main`, `Strength A`, `Finisher`, …     |
| `block_format`  | enum     | yes when changing structure | See §3.2. **Prefer over legacy `type`.**                                      |
| `format_params` | object   | conditional                 | Shape depends on `block_format`; omit only for `straight_sets` with defaults. |
| `exercises`     | array    | conditional                 | Exercise-shaped formats; see per-format rules.                                |
| `instructions`  | string[] | conditional                 | Instruction-shaped warm-up / mobility (unchanged from 10.5).                  |

**Legacy:** Parser today copies `blk.type` → `row.type`. Plan: deprecate `type` in prompts; map `type` → `block_format` in parser when `block_format` is absent (single release window).

### 3.2 `block_format` enum (v1)

Align naming with factory HIIT vocabulary where possible; add strength-specific formats the factory does not model at block level.

| `block_format`  | Purpose                                | Hydration role                                                                                                   |
| --------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `straight_sets` | Default strength / hypertrophy         | Sets × reps per exercise; optional `rest_between_sets_seconds` on block.                                         |
| `superset`      | Paired/antagonist work                 | **Exactly 2** exercises; `rest_between_rounds_seconds` after each pair; `rounds` required. Use `circuit` for 3+. |
| `circuit`       | Round-robin stations                   | `rounds` + optional `rest_between_rounds_seconds`; exercises performed in sequence per round.                    |
| `amrap`         | As-many-rounds-as-possible in time cap | `time_cap_minutes`; exercises repeated in order until cap.                                                       |
| `emom`          | Every minute on the minute             | `interval_seconds` (usually 60), `total_minutes` or `total_rounds`.                                              |
| `tabata`        | 20s work / 10s rest style              | `work_seconds`, `rest_seconds`, `rounds` (default 8).                                                            |

**Reserved (v2):** `chipper`, `ladder` (factory already lists these under `HiitProtocolFormat`).

### 3.3 `format_params` per format

Use a **single object** with nullable fields in Vertex schema (simplest for Gemini structured output). Server strips irrelevant keys per format.

| `block_format`  | Required params                                                 | Optional params                                                 |
| --------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| `straight_sets` | —                                                               | `rest_between_sets_seconds`, `target_rpe` (block-level default) |
| `superset`      | `rounds`, **exactly 2** `exercises`                             | `rest_between_rounds_seconds`, `pairing_notes`                  |
| `circuit`       | `rounds`                                                        | `rest_between_rounds_seconds`, `rest_between_exercises_seconds` |
| `amrap`         | `time_cap_minutes`                                              | `target_rounds` (soft goal), `rest_between_rounds_seconds`      |
| `emom`          | `interval_seconds`, and (`total_minutes` **or** `total_rounds`) | `rest_in_interval_seconds` (unused portion of minute)           |
| `tabata`        | `rounds`                                                        | `work_seconds` (default 20), `rest_seconds` (default 10)        |

**Biomechanics / safety (validator, not schema):** cap `time_cap_minutes` vs session `duration_min`; cap EMOM `total_minutes`; ensure superset `exercises.length >= 2`.

### 3.4 Persisted shape (`ExerciseBlock` extension)

Extend [`ExerciseBlock`](../../../src/lib/workout-factory/types/workout-contract.ts) (and `ai-program` mirror) — **after merge**, not in Coach output:

```ts
export interface ExerciseBlock {
  order?: number;
  name?: string;
  exercises: Exercise[];
  id?: string;
  /** Parametric hydration (v1). */
  blockFormat?: BlockFormat;
  formatParams?: BlockFormatParams;
}
```

`BlockFormatParams` is a discriminated union in TypeScript; stored as JSON on the block in `workout_set`. Flat `metadata.exercises` remains derived via `flattenSessionExercisesForMetadata` (unchanged), optionally prefixing block label for non-Main blocks.

---

## 4. Schema changes (Vertex + mirror)

**Files (canonical + Deno mirror, byte parity):**

- [`src/lib/agents/coach/schema.ts`](../../../src/lib/agents/coach/schema.ts)
- [`supabase/functions/agents/coach/schema.ts`](../../../supabase/functions/agents/coach/schema.ts)

### 4.1 Add to `blocks[].properties`

```ts
block_format: {
  type: 'STRING',
  description:
    'Blueprint discriminator. MUST be one of: straight_sets, superset, circuit, amrap, emom, tabata. Do not invent other values.',
  // Vertex: enum if supported; else document allowed list in description + server validate.
},
format_params: {
  type: 'OBJECT',
  nullable: true,
  description: 'Format-specific parameters. Required fields depend on block_format; see BLUEPRINT LIBRARY in system prompt.',
  properties: {
    time_cap_minutes: { type: 'INTEGER', nullable: true },
    interval_seconds: { type: 'INTEGER', nullable: true },
    total_minutes: { type: 'INTEGER', nullable: true },
    total_rounds: { type: 'INTEGER', nullable: true },
    rounds: { type: 'INTEGER', nullable: true },
    work_seconds: { type: 'INTEGER', nullable: true },
    rest_seconds: { type: 'INTEGER', nullable: true },
    rest_between_sets_seconds: { type: 'INTEGER', nullable: true },
    rest_between_rounds_seconds: { type: 'INTEGER', nullable: true },
    rest_between_exercises_seconds: { type: 'INTEGER', nullable: true },
    target_rpe: { type: 'NUMBER', nullable: true },
    target_rounds: { type: 'INTEGER', nullable: true },
    pairing_notes: { type: 'STRING', nullable: true },
  },
},
```

Keep existing `exercises`, `instructions`, `name`. Update `blocks` description to: **must set `block_format` whenever emitting `blocks`; hydrate exercises inside the blueprint constraints.**

### 4.2 Top-level `workout_type`

Leave as session-level hint (`AMRAP`, `EMOM`, …). Do **not** overload `blocks[].type` (legacy) — migrate to `block_format`.

### 4.3 Drift / mirror

- Run `pnpm check:agent-mirror` after schema edits.
- Run `pnpm check:agent-prompts`; add `promptOnlyTokens` only if blueprint prose trips snake_case heuristic (e.g. `format_params` will be a real schema key).

---

## 5. Blueprint library (prompt injection)

**New module (recommended):**

- Canonical: `src/lib/agents/coach/block-blueprint-library.ts`
- Deno mirror: `supabase/functions/agents/coach/block-blueprint-library.ts`  
  (or `_shared` if we want merge + Coach to share constants — then mirror under `supabase/functions/_shared/workout-metadata/`)

Export:

```ts
export const BLOCK_FORMAT_ENUM = [
  /* ... */
] as const;
export function buildBlockBlueprintLibraryPrompt(): string;
```

### 5.1 Where to inject

| Call site                                  | When                                                                                                                                                                                                                                | Rationale                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **`buildBaseCoachPrompt`**                 | Append after JSON-keys contract sentence                                                                                                                                                                                            | All Coach turns see allowed formats; satisfies drift “prompt names schema keys.” |
| **`buildCurrentTaskContextBlock` (rail)**  | Append one sentence: “When emitting `proposed_workout_metadata.blocks`, every **exercise-shaped** block MUST include `block_format` + `format_params` per BLUEPRINT LIBRARY; instruction-only warm-up/cool-down blocks are exempt.” | Rail is where structured edits persist immediately.                              |
| **Not** in workout-open greeting preflight | Greeting uses `COACH_WORKOUT_GREETING_SCHEMA` — no `blocks`.                                                                                                                                                                        |

Assembly order today ([`strategy.ts`](../../../supabase/functions/agents/coach/strategy.ts) L369–399):  
`buildBaseCoachPrompt` → workout context → task context → intake blocks → user context.  
Insert **`buildBlockBlueprintLibraryPrompt()`** immediately after `buildBaseCoachPrompt` (or as its final segment) so blueprints sit **before** live JSON context.

### 5.2 Prompt content (outline)

For each `block_format`, document in **imperative** form:

1. When to select it (fatigue, time budget, user ask).
2. Required `format_params` keys.
3. How to fill `exercises[]` (e.g. EMOM: one movement per minute slot, or alternating A/B).
4. **Forbidden:** inventing new formats; putting format timing only in `reply_content`; duplicating full workout in `updated_task_description` when `blocks` is present (cross-link 10.5 rail sentence).

Include **one compact JSON example per format** (see §8).

### 5.3 Relationship to `updated_task_description`

**Signed-off rule (§11.3):** When `proposed_workout_metadata.blocks` is non-empty, the server **hard-nulls** `updated_task_description` in `applyCoachServerGuards` (or equivalent guard before RPC). Prompts should still tell the model to leave it null; the guard is the source of truth. Structured JSON is the prescription; prose must not duplicate or contradict rep ranges or timers.

---

## 6. Parser updates

**Files:**

- [`src/lib/agents/coach/parse.ts`](../../../src/lib/agents/coach/parse.ts) L176–207
- Deno mirror: [`supabase/functions/agents/coach/parse.ts`](../../../supabase/functions/agents/coach/parse.ts)

### 6.1 New helpers (pure)

```ts
const BLOCK_FORMATS = new Set([
  /* ... */
]);

function normalizeBlockFormat(raw: unknown, legacyType: unknown): BlockFormat;
function normalizeFormatParams(format: BlockFormat, raw: unknown): Record<string, unknown>;
function validateBlockShape(format: BlockFormat, block: Record<string, unknown>): string | null; // error reason or null
```

### 6.2 `parseProposedWorkoutMetadata` loop changes

For each block:

1. **Instruction-only exemption (§11.2):** If `instructions[]` is non-empty and `exercises` is absent/empty, skip `block_format` validation; pass through for name-based merge routing only.
2. Otherwise resolve `block_format` from `blk.block_format` ?? mapLegacyType(blk.type) ?? `'straight_sets'`.
3. If unknown format → **drop block** (fail closed) + log `{ field, reason: 'unknown_block_format' }` in merge/parse drops (§11.1). Never coerce to `straight_sets`.
4. Normalize `format_params` (integers rounded, positive caps).
5. **`validateBlockShape`:** e.g. `superset` requires exactly 2 exercises; `circuit` requires ≥3; EMOM requires interval + duration fields.
6. Attach `block_format` + `format_params` on `row` passed to merge.

### 6.3 Tests

Extend [`src/lib/agents/coach/parse.test.ts`](../../../src/lib/agents/coach/parse.test.ts):

- EMOM block with valid params passes.
- Unknown `block_format` dropped (not coerced).
- `superset` with 3 exercises fails validation / block dropped.
- Legacy `type: 'AMRAP'` maps to `block_format: 'amrap'`.

---

## 7. Merge module (hydration mapping)

**Files:**

- [`src/lib/agents/_shared/workout-metadata/merge-coach-proposed-into-task-metadata.ts`](../../../src/lib/agents/_shared/workout-metadata/merge-coach-proposed-into-task-metadata.ts)
- Deno mirror under `supabase/functions/_shared/workout-metadata/`

### 7.1 `mergeRichBlocks` extension

When building `newBlock` for exercise-shaped blocks:

```ts
const newBlock: Record<string, unknown> = {
  name: blockName,
  exercises: mappedInner,
  blockFormat: block_format, // camelCase in factory tree
  formatParams: normalizedParams,
};
```

### 7.2 Format-specific exercise mapping

| Format          | Merge behavior                                                                                                                                                                                                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `straight_sets` | Map exercises as today; apply block `rest_between_sets_seconds` to each exercise `restSeconds` when exercise omits rest.                                                                                                                                                                                 |
| `superset`      | **Exactly 2** exercises (§11.4); reject/drop otherwise. Set each exercise `sets = rounds` (or 1 set per “round” with `rounds` on block); shared `rest_between_rounds_seconds`.                                                                                                                           |
| `circuit`       | Require **≥3** exercises; set each exercise `rounds` from `format_params.rounds`; optional rest between exercises.                                                                                                                                                                                       |
| `amrap`         | Set block subtitle via `formatParams.time_cap_minutes`; exercises typically `sets: 1`, reps as target; optional `coachNotes` “repeat for time”.                                                                                                                                                          |
| `emom`          | **Exercise-level timers (§11.5):** Within each `interval_seconds` window, map per-exercise `workSeconds` and `restSeconds` so work + rest ≤ interval (e.g. 15s deadlifts + 45s rest in a 60s minute). Block `format_params` supply budget; merge writes exercise fields for accurate time-under-tension. |
| `tabata`        | Apply `work_seconds` / `rest_seconds` / `rounds` to each exercise (factory already uses exercise-level timer fields).                                                                                                                                                                                    |

**Name routing (`classifyBlockRole`)** stays for warm-up/finisher/cool-down; `block_format` does not override role. A **Finisher** block can be `block_format: 'amrap'` with `time_cap_minutes: 5`.

### 7.3 Merge log

Extend `MergeLog.touched` with optional `'blockFormat'` or per-format tokens for observability.

### 7.4 Guards

`validate-hydrated-block.ts` (or extensions to `applyCoachServerGuards`):

- Reject/drop blocks with unknown `block_format` or invalid shape (fail closed).
- **Hard-null `updated_task_description`** when non-empty `proposed_workout_metadata.blocks` is present (§11.3).
- **Flat card guard (§11.6):** If `hasRichWorkoutSet(base) === false` and any proposed block has a parametric `block_format` other than instruction-only exemption, **do not merge** parametric fields — log drop `parametric_requires_rich_workout_set` and omit those blocks from persist (or reject entire proposed metadata; prefer dropping parametric blocks only so title/scalar edits can still apply).

### 7.5 Flat cards without `workout_set`

**Signed off (§11.6):** Do **not** flatten `format_params` into `coach_notes`. Time-domain protocols need `RichWorkoutReadView` subtitles and exercise-level timers. Flat cards may still receive legacy flat `exercises` / instruction blocks via existing merge Branch B; parametric formats require a rich card (`ai_workout_factory.workout_set`).

---

## 8. Sample Coach payloads (Vertex output)

### 8.1 EMOM — main strength primer

```json
{
  "update_existing_task": true,
  "updated_task_title": null,
  "updated_task_description": null,
  "proposed_workout_metadata": {
    "workout_type": "EMOM",
    "duration_min": 20,
    "blocks": [
      {
        "name": "Warm-up",
        "instructions": ["5 min easy bike", "Dynamic hip openers x 8 each"]
      },
      {
        "name": "Main",
        "block_format": "emom",
        "format_params": {
          "interval_seconds": 60,
          "total_minutes": 16,
          "rest_in_interval_seconds": 20
        },
        "exercises": [
          { "name": "Kettlebell Swing", "reps": "12", "coach_notes": "Start at 0:00 each minute" },
          { "name": "Push-up", "reps": "10", "coach_notes": "Alternate each minute" }
        ]
      },
      {
        "name": "Finisher",
        "block_format": "tabata",
        "format_params": {
          "work_seconds": 20,
          "rest_seconds": 10,
          "rounds": 4
        },
        "exercises": [{ "name": "Mountain Climbers", "reps": "max", "coach_notes": "Hard effort" }]
      }
    ]
  },
  "reply_content": "Added a 16-minute EMOM main and a 4-round Tabata finisher."
}
```

**Expected UI (after merge):**  
`RichWorkoutReadView` section **MAIN** heading displays as `Main · EMOM · 16 min` (new subtitle); exercises as `ExerciseReadRow` with meta including work/rest when mapped to `workSeconds` / `restSeconds`.

### 8.2 Superset — upper body

```json
{
  "update_existing_task": true,
  "updated_task_description": null,
  "proposed_workout_metadata": {
    "blocks": [
      {
        "name": "Strength A",
        "block_format": "superset",
        "format_params": {
          "rounds": 4,
          "rest_between_rounds_seconds": 90,
          "pairing_notes": "Antagonist pair"
        },
        "exercises": [
          { "name": "Dumbbell Bench Press", "sets": 4, "reps": "8", "rpe": 8 },
          { "name": "Bent-over Row", "sets": 4, "reps": "10", "rpe": 8 }
        ]
      },
      {
        "name": "Strength B",
        "block_format": "straight_sets",
        "format_params": {
          "rest_between_sets_seconds": 120
        },
        "exercises": [{ "name": "Romanian Deadlift", "sets": 3, "reps": "10", "rpe": 7 }]
      }
    ]
  },
  "reply_content": "Strength A is now a 4-round superset pair; Strength B stays straight sets with 2 min rest."
}
```

**Expected UI:** Section **STRENGTH A** subtitle `Superset · 4 rounds · 90s between rounds`; two `ExerciseReadRow` cards under that heading.

---

## 9. Frontend audit

**Primary file:** [`src/components/fitness/workout-viewer-dialog.tsx`](../../../src/components/fitness/workout-viewer-dialog.tsx)

### 9.1 `RichWorkoutReadView`

- Section heading today: `block.name` only (L263–264).
- **Minimal extension:** compute `blockSubtitle(block)` from `block.blockFormat` + `block.formatParams`:

  | Format     | Subtitle example              |
  | ---------- | ----------------------------- |
  | `amrap`    | `AMRAP · 12 min`              |
  | `emom`     | `EMOM · 60s · 16 min`         |
  | `tabata`   | `Tabata · 20s/10s · 8 rounds` |
  | `superset` | `Superset · 4 rounds`         |
  | `circuit`  | `Circuit · 3 rounds`          |

- Render subtitle next to heading (muted, `text-xs`), not a second prose block.

### 9.2 `ExerciseReadRow` / `ExerciseDetail`

Already surface per-exercise: `sets`, `reps`, `rpe`, `restSeconds`, `workSeconds`, `rounds` (L145–151). **No row redesign required** if merge maps timer fields correctly.

### 9.3 `InstructionBlockSection`

Unchanged for instruction-only warm-up/cool-down. Do not force `block_format` on instruction blocks in UI.

### 9.4 Types

Extend [`workout-contract.ts`](../../../src/lib/workout-factory/types/workout-contract.ts) `ExerciseBlock` as §3.4. `normalizeWorkoutForEditor` should preserve unknown keys on blocks (verify it does not strip).

### 9.5 Out of scope (v1 UI)

- WorkoutPlayer EMOM/AMRAP timers (live video wrappers exist under `src/features/amrap`, `src/features/live-video`) — separate wiring from Coach blocks.
- `WorkoutExercisesEditor` edit mode — may show flat list only until editor understands `blockFormat`.

---

## 10. Implementation phases (**approved**)

| Phase                       | Scope                                                                                           | Files (indicative)                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **11.1 Blueprint contract** | `block_format` + `format_params` in schema; blueprint prompt module; parse normalize; Vitest    | `coach/schema.ts`, `coach/block-blueprint-library.ts`, `coach/parse.ts`, `coach/prompts.ts`, tests |
| **11.2 Hydration merge**    | Map format → `ExerciseBlock`; validator; merge tests; guards per §11                            | `merge-coach-proposed-into-task-metadata.ts`, `server-guards.ts`                                   |
| **11.3 UI subtitles**       | `RichWorkoutReadView` block subtitle; type extensions                                           | `workout-viewer-dialog.tsx`, `workout-contract.ts`                                                 |
| **11.4 Factory alignment**  | Optional: share `HiitProtocolFormat` type import in blueprint library                           | `ai-workout.ts`                                                                                    |
| **11.5 Integration**        | Deno integration: rail persist asserts `blockFormat` on rich card; flat-card parametric refusal | `agent-dispatch/index.integration.test.ts`                                                         |

**Feature flag:** Continue gating full merge behind `COACH_MERGE_WORKOUT_METADATA=1` ([`secrets-matrix.md`](../vertex-agent-dispatch-consolidation/secrets-matrix.md)). Parametric validation should run **only when merge is enabled**.

---

## 11. Product decisions (**signed off**)

Clinical and architectural sign-off recorded May 2026. Implementation must follow these rules; do not re-open without explicit product review.

### 11.1 Unknown `block_format`

|                    |                                                                                                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**       | **Drop the block** (fail closed) and log the error.                                                                                                                                                                                    |
| **Rationale**      | Coercing a time-domain format (e.g. AMRAP) into `straight_sets` changes the metabolic stimulus and work-to-rest ratio, risking inappropriate CNS fatigue or volume. Violated blueprints are rejected to protect programming integrity. |
| **Implementation** | Parser or merge `drops[]` with `reason: 'unknown_block_format'`; block omitted from persisted metadata.                                                                                                                                |

### 11.2 Instruction-only blocks

|                    |                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Decision**       | **Exempt** from `block_format`.                                                                                                                  |
| **Rationale**      | Warm-up, movement prep, and cool-down are qualitative (tissue temperature, joint lubrication, motor control)—not parametric loading.             |
| **Implementation** | Blocks with non-empty `instructions[]` and no `exercises[]` skip format validation; existing name-based routing (`classifyBlockRole`) unchanged. |

### 11.3 `updated_task_description` when `blocks` present

|                    |                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**       | **Hard-null via server guard.**                                                                                                                                                       |
| **Rationale**      | Structured JSON is the source of truth; redundant prose risks hallucination contradicting reps or timers.                                                                             |
| **Implementation** | In `applyCoachServerGuards` (or pre-persist): if `proposed_workout_metadata.blocks` has length > 0, force `updated_task_description = null` before RPC. Prompts align but guard wins. |

### 11.4 Superset cardinality

|                    |                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Decision**       | **Exactly 2 exercises** per `superset` block.                                                                            |
| **Rationale**      | S&C taxonomy: superset = two movements back-to-back (ideally antagonist). Three or more is a **circuit** or **complex**. |
| **Implementation** | `validateBlockShape`: `superset` + `exercises.length !== 2` → drop block; blueprint prompt instructs `circuit` for 3+.   |

### 11.5 EMOM timer mapping

|                    |                                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**       | **Exercise-level** `workSeconds` / `restSeconds` within the minute budget.                                                                                                 |
| **Rationale**      | Elite programming micro-manages the minute (e.g. 3 heavy deadlifts ~15s work + 45s rest/mobility in the same 60s window).                                                  |
| **Implementation** | Merge maps `format_params.interval_seconds` as cap; distributes or honors per-exercise work/rest so sum ≤ interval; persists on factory `Exercise` rows for UI and player. |

### 11.6 Flat cards without `workout_set`

|                    |                                                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decision**       | **Refuse parametric blocks** until the card is rich.                                                                                                                          |
| **Rationale**      | Flattening interval parameters into `coach_notes` degrades UX and pacing; EMOM/Tabata need native subtitles and timers in `RichWorkoutReadView`.                              |
| **Implementation** | When `hasRichWorkoutSet === false`, strip or reject blocks that declare `block_format` (instruction-only blocks still allowed). Do not synthesize `ai_workout_factory` in v1. |

---

## 12. Verification checklist (post-implementation)

```bash
pnpm check:agent-mirror
pnpm check:agent-prompts
pnpm vitest run src/lib/agents/coach src/lib/agents/_shared/workout-metadata
pnpm run test:deno-integration
```

Manual: rail “add 12 min AMRAP finisher” → `workout_set.workouts[0].exerciseBlocks` contains finisher block with `blockFormat: 'amrap'`, UI subtitle visible, **no** full-workout prose in `tasks.description`.

---

## 13. References

- Step 10.5 schema/prompts: [`src/lib/agents/coach/schema.ts`](../../../src/lib/agents/coach/schema.ts), [`src/lib/agents/coach/prompts.ts`](../../../src/lib/agents/coach/prompts.ts)
- Merge reconciler: [`docs/refactor/workout-metadata-merge/README.md`](../workout-metadata-merge/README.md)
- UI read path: [`useTaskWorkoutAi`](../../../src/components/modals/task-modal/hooks/useTaskWorkoutAi.ts) → `WorkoutViewerContent` → `RichWorkoutReadView`
- Factory protocols: [`src/lib/workout-factory/types/ai-workout.ts`](../../../src/lib/workout-factory/types/ai-workout.ts)

---

**Next step:** Implement phases 11.1–11.5 per this document. Pre-PR checks on any in-flight work (e.g. Step 10.5) are separate from parametric implementation.
