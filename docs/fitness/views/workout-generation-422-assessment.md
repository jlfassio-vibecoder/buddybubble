# Workout Generation Workflow — 422 Root Cause, Architectural Assessment & Gap Analysis

_Scope: `POST /api/ai/generate-workout-chain` (parametric outline-fill pipeline) and its supporting modules._

_Status: P0–P2 fixes implemented (§4). P3 deterministic fill fallback implemented (§4.11)._

---

## 1. Executive summary

The production errors

```
/api/ai/generate-workout-chain:1  Failed to load resource: the server responded with a status of 422 ()
```

are **not** a transport/auth/routing problem. The endpoint historically emitted `422` when the Vertex _Stage‑1 outline fill_ output failed server-side validation after **both** repair attempts were exhausted. **P3** adds a deterministic preflight fallback (200) by default; `422` is opt-in via `OUTLINE_FILL_DETERMINISTIC_FALLBACK=false`.

Historically, the workflow failed “frequently and inconsistently” because it paired a **strict, exact-match validation contract** with a **single, non-deterministic, small-model LLM call** and **no semantic retry**. P0 fixes (§4) add numeric-rep tolerance and a bounded 2-attempt repair loop with error feedback. Remaining triggers (renamed blocks, time-domain prescription strictness, truncation) are P1/P2.

---

## 2. The workflow (as built)

```
Coach / Apex Architect outline  ──►  tasks.metadata.coach_workout_outline
        │ (Phase B, separate endpoint: /api/ai/generate-workout-outline)
        ▼
Client (useTaskWorkoutAi) ──► preflightOutlineBlocks (client) ──► postGenerateWorkoutChain
        ▼
route.ts  /api/ai/generate-workout-chain
  • auth + body validation                          → 401 / 400
  • OUTLINE_REQUIRED_FOR_FACTORY if no outline       → 400
  • load fitness_profiles                            → 500 on db error
  • buildBuddyWorkoutPersona()
  • runGenerateWorkoutChain()
        ▼
prepareWorkoutChainRequest()  (persona/mode validation, zone/equipment)  → 400 on bad persona
        ▼
preflightOutlineBlocks()  (Coach parse boundary → normalized blocks)
        ▼
runGenerateWorkoutOutlineFill()
  • callVertexAI attempt 1 (gemini-3.1-flash-lite-preview, temp 0.2, 12288 tok)
  • parseJSONWithRepair()                            → retry on parse fail
  • graftFillBlocksOntoPreflight()                   → server owns name/format/params (P1)
  • validateFillParametricOutlineOutput()            → retry on validation fail
  • callVertexAI attempt 2 (prompt includes prior validation_error)
  • parse + graft + validate again                   → deterministic fallback or ★ 422 if disabled ★
  • hydrateAndValidateOutlineBlocks()                → 500 on post-fill drops
  • buildWorkoutInSetFromOutlineFill() + assemble    → 200
```

The 422 site when deterministic fallback is disabled (`OUTLINE_FILL_DETERMINISTIC_FALLBACK=false`):

```typescript
// generate-workout-outline-fill-runner.ts — after fill_exhausted, if fallback disabled
return {
  ok: false,
  response: new Response(
    JSON.stringify({
      error: 'OUTLINE_FILL_VALIDATION_FAILED',
      failure_kind: lastFailureKind,
      validation_reason: validationReason,
      message: `Outline fill (Stage 1) failed: ${lastError}`,
      validation_error: lastError,
    }),
    { status: 422, headers: { 'Content-Type': 'application/json' } },
  ),
};
```

---

## 3. Root cause of the 422s

`validateFillParametricOutlineOutput` enforces two classes of rules against the **grafted** model output (P1: structural fields come from preflight, not the model):

1. **Structural cardinality** (`graftFillBlocksOntoPreflight`): equal block count, equal exercise count per block, instruction-only blocks must not gain exercises.
2. **Per-exercise prescription**: for formats other than EMOM/Tabata with complete `format_params`, every exercise must carry `sets > 0`, a non-empty string or numeric `reps`, or `work_seconds > 0`. EMOM/Tabata with timing in `format_params` require only a non-empty movement name (P1).

Both run against the output of up to **two** calls to `gemini-3.1-flash-lite-preview` (a small preview model) at `temperature: 0.2`, with repair retry on parse/validation failure (§4.3). Remaining triggers after P0:

| #   | Trigger                                                       | Why it fires                                                                                                                                                                                                                                    | Severity           |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| A   | **Numeric `reps`** (`"reps": 12` instead of `"12"`)           | `exerciseHasPrescription` only accepted _string_ reps; circuit/AMRAP exercises that have reps-but-no-sets failed. The downstream mapper happily coerces numeric reps with `String()`, so validation was stricter than the rest of the pipeline. | **High** (fixed)   |
| B   | **Per-exercise prescription required for time-domain blocks** | EMOM/Tabata derive work/rest/rounds from `format_params`. A model that lists movement names only is now accepted when timing params are present (P1).                                                                                           | **High** (fixed)   |
| C   | **Block name reworded**                                       | Server grafts preflight structure; model block renames are ignored (P1).                                                                                                                                                                        | **Medium** (fixed) |
| D   | **Truncated / malformed JSON**                                | Cap raised to 12288 (P2); truncation detected via finish_reason + near-cap tokens; factory events in `workspace_ai_events` (P2). Fill-only schema mitigates token pressure (P1).                                                                | Medium (mitigated) |
| E   | **`format_params` echoed imperfectly**                        | Server grafts authoritative `format_params`; model drift is ignored (P1).                                                                                                                                                                       | **Low** (fixed)    |

A/B/C/D are non-deterministic; before P3 the endpoint succeeded sometimes and 422'd other times for the _same_ outline. **P3:** after two failed attempts the server assembles from preflight with default prescriptions (200); user-facing 422 on fill exhaustion is **debug-only** when `OUTLINE_FILL_DETERMINISTIC_FALLBACK=false`.

### Secondary aggravator — misleading UX (fixed in P1)

Previously, on any 422 the task modal showed a generic “edit your structure” message even when client preflight had passed. P1 adds `failure_kind` / `validation_reason` on the 422 payload and maps them to accurate toasts with a Sonner **Regenerate** action in `useTaskWorkoutAi`.

---

## 4. Fixes applied in this pass

Surgical, additive changes that align validation with the rest of the pipeline and add resilience. No existing behavior on the success path is changed.

### 4.1 Accept numeric `reps` in prescription check (Trigger A)

`src/lib/workout-factory/prompt-chain/fill-parametric-outline.ts` — `exerciseHasPrescription` now treats a finite positive numeric `reps` as a valid prescription, matching the downstream mapper which already does `String(reps)`.

### 4.2 Preserve numeric `reps` in the validated output (Trigger A, silent data loss)

Same file, output builder: numeric `reps` are now coerced to string instead of being dropped. Previously a `straight_sets` block with `sets` + numeric `reps` _passed_ validation but lost the rep target, collapsing it to the `"1"` default in `buildWorkoutInSetFromOutlineFill`. This was a latent data-quality bug independent of the 422.

### 4.3 Bounded repair retry before surfacing 422 (Triggers A–D)

`src/lib/workout-factory/generate-workout-outline-fill-runner.ts` — the Vertex call + parse + validate is now wrapped in a 2-attempt loop. On a failed attempt the validation error (or parse error) is fed back into the prompt (`=== PREVIOUS ATTEMPT REJECTED ===`) and the model is asked to correct it. Parse failures are also retried (previously a parse throw became a 500 with no second chance). After the final attempt fails, **P3** assembles from preflight (200) unless fallback is disabled, in which case the endpoint returns 422.

### 4.4 Production logging for fill failures

`generate-workout-outline-fill-runner.ts` — unconditional structured `console.warn` on each failed attempt (`fill_attempt_failed`) and on final 422 (`fill_exhausted`), including `attempt`, `maxAttempts`, and `validation_error`.

### 4.5 Test coverage

- `fill-parametric-outline.test.ts` — numeric-rep acceptance and string coercion
- `generate-workout-outline-fill-runner.test.ts` — single-shot success, validation retry, parse retry, exhausted 422

> Trade-off: a true failure now costs up to two model calls (added latency/cost on the failure path only). The success path is unchanged.

### 4.6 Structural grafting (P1 — Triggers C/E)

`outline-block-preflight.ts` — `graftFillBlocksOntoPreflight` overlays model `exercises[]` / `instructions[]` onto authoritative preflight blocks by index. The fill prompt asks for fill-only JSON (no echo of `name`, `block_format`, or `format_params`).

### 4.7 Time-domain prescription relaxation (P1 — Trigger B)

`exercisePrescriptionRequired` — EMOM/Tabata blocks with complete timing in `format_params` accept name-only exercises, matching assembler hydration behavior.

### 4.8 Differentiated 422 UX (P1)

- Server: 422 payload includes `failure_kind` and `validation_reason`; parse exhaustion returns 422 instead of 500.
- Client: `WorkoutFactoryError` + `workoutFactoryErrorMessage` in `api-client.ts`; `useTaskWorkoutAi` shows accurate toasts with **Regenerate**.

### 4.9 Outline-fill token cap (P2 — Trigger D)

- `OUTLINE_FILL_MAX_OUTPUT_TOKENS = 12288` in `outline-fill-config.ts` (aligned with Coach outline-only cap).
- `callVertexAIWithMetadata()` returns finish_reason and token usage; runner detects truncation and adds compact-output retry hint.

### 4.10 Factory System Analytics telemetry (P2)

- `record-workspace-ai-event.ts` writes best-effort rows to `workspace_ai_events` from `generate-workout-chain` route.
- `agent_slug: workout_factory`, `surface: generate_workout_chain`; optional `task_id` forwarded from task modal.
- Fill failure logs enriched with `validation_reason`, block/exercise counts, token usage, and `request_id`.

### 4.11 Deterministic fill fallback (P3)

- After exhausted Vertex fill attempts, `buildDeterministicOutlineFillFromPreflight` assembles workouts from authoritative preflight blocks with format-aware default prescriptions (returns **200** instead of 422).
- Kill switch: `OUTLINE_FILL_DETERMINISTIC_FALLBACK=false` restores 422 for debugging.
- `chain_metadata.fill_fallback` + differentiated success toast when fallback used.

---

## 5. Architectural assessment

**Strengths**

- Clear separation of concerns: Coach “Phase B” owns _structure_; the factory owns _fill_. The outline is a read-only contract, which is a sound design for determinism and safety.
- Strong deterministic post-processing (`hydrateAndValidateOutlineBlocks`, EMOM matrix hydration, format normalization) keeps the stored workout shape canonical.
- Validation is well unit-tested and the block blueprint library is mirrored byte-for-byte between app and Supabase edge.

**Core architectural tension**
The pipeline asks a **probabilistic** component (an LLM, specifically a _lite preview_ model) to satisfy a **deterministic, exact-match** contract in **one shot**, then treats any deviation as a terminal error visible to the end user. Robust LLM pipelines instead: (a) make the server authoritative for anything it already knows, (b) validate leniently then _repair_, and (c) retry/fallback before failing. This workflow did none of these on the fill stage.

**Specific design gaps**

1. **The server re-validates data it owns.** ✅ P1: `graftFillBlocksOntoPreflight` grafts model fill onto authoritative preflight blocks; structural echo no longer required.

2. **Validation is stricter than consumption (Trigger B).** ✅ P1: EMOM/Tabata with timing in `format_params` accept name-only exercises.

3. **No retry/fallback ladder on the fill stage.** ✅ P3: 2-attempt repair retry (§4.3) plus deterministic preflight fallback (§4.11) before optional 422.

4. **Output token cap risk (Trigger D).** ✅ P2: cap raised to 12288; truncation detection + compact retry hint; fill-only schema (P1).

5. **Error taxonomy is coarse and partly misleading.** ✅ P1: `failure_kind` / `validation_reason` on 422; client toasts + Regenerate.

6. **Observability.** ✅ P2: factory fill outcomes recorded in `workspace_ai_events`; structured logs include validation_reason and token usage. Edge agent-dispatch metrics unchanged.

---

## 6. Gap analysis & prioritized recommendations

| Priority | Gap                                                      | Recommendation                                                                                                   | Status                         |
| -------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| P0       | Numeric reps rejected / dropped                          | Accept + preserve numeric reps                                                                                   | ✅ Done (§4.1–4.2)             |
| P0       | Single-shot fill, no semantic retry                      | Repair retry with error feedback                                                                                 | ✅ Done (§4.3)                 |
| P1       | Server re-validates fields it owns (names/format)        | Graft model `exercises[]` onto authoritative preflight blocks by index; stop comparing/echoing structural fields | ✅ Done (§4.6)                 |
| P1       | Validator stricter than assembler for time-domain blocks | Relax per-exercise prescription for EMOM/Tabata when `format_params` carry timing; update the encoding test      | ✅ Done (§4.7)                 |
| P1       | Misleading client error on 422                           | Differentiate error codes; show accurate message + “Regenerate” affordance                                       | ✅ Done (§4.8)                 |
| P2       | Truncation under 8192-token cap                          | Raise cap and/or shrink output by not echoing structure                                                          | ✅ Done (§4.9; fill-only §4.6) |
| P2       | No production observability of failure reasons           | Log `validation_error` reason (and attempt count) unconditionally; add a metric                                  | ✅ Done (§4.10)                |
| P3       | Deterministic fallback absent                            | On final fill failure, assemble from preflight outline with default prescriptions instead of 422                 | ✅ Done (§4.11)                |

---

## 7. Verification performed

- `npx vitest run` on build-deterministic-outline-fill, outline-block-preflight, fill-parametric-outline, generate-workout-outline-fill-runner, generate-workout-chain-runner, vertex-ai-client, outline-fill-telemetry, record-workspace-ai-event, map-outline-fill-to-workout, and useTaskWorkoutAi tests → **65+ passed**.
- `npx tsc --noEmit` → clean.
- `npx eslint` on changed files → clean.

## 8. Files touched

**P0**

- `src/lib/workout-factory/prompt-chain/fill-parametric-outline.ts` — numeric reps accepted (prescription check) and preserved (output builder).
- `src/lib/workout-factory/prompt-chain/fill-parametric-outline.test.ts` — numeric-rep test case.
- `src/lib/workout-factory/generate-workout-outline-fill-runner.ts` — bounded repair retry, exported `MAX_FILL_ATTEMPTS`, production logging.
- `src/lib/workout-factory/generate-workout-outline-fill-runner.test.ts` — retry loop tests (new).

**P1**

- `src/lib/workout-factory/outline-block-preflight.ts` — `graftFillBlocksOntoPreflight`, `exercisePrescriptionRequired`, `classifyOutlineFillValidationReason`.
- `src/lib/workout-factory/outline-block-preflight.test.ts` — graft unit tests.
- `src/lib/workout-factory/prompt-chain/fill-parametric-outline.ts` — graft integration, fill-only prompt, relaxed EMOM/Tabata validation.
- `src/lib/workout-factory/prompt-chain/fill-parametric-outline.test.ts` — graft + time-domain tests.
- `src/lib/workout-factory/generate-workout-outline-fill-runner.ts` — richer 422 payload, updated retry prompt, parse exhaustion → 422.
- `src/lib/workout-factory/generate-workout-outline-fill-runner.test.ts` — failure_kind / validation_reason assertions.
- `src/lib/workout-factory/api-client.ts` — `WorkoutFactoryError` fields, `workoutFactoryErrorMessage`.
- `src/components/modals/task-modal/hooks/useTaskWorkoutAi.ts` — differentiated toasts + Regenerate action.
- `src/components/modals/task-modal/hooks/__tests__/useTaskWorkoutAi.test.ts` — 422 UX tests.

**P2**

- `src/lib/workout-factory/outline-fill-config.ts` — `OUTLINE_FILL_MAX_OUTPUT_TOKENS`, model constant.
- `src/lib/workout-factory/vertex-ai-client.ts` — `callVertexAIWithMetadata`, `parseVertexChatCompletionResponse`.
- `src/lib/workout-factory/outline-fill-telemetry.ts` — telemetry struct + truncation helper.
- `src/lib/workout-factory/generate-workout-outline-fill-runner.ts` — metadata API, truncation-aware retry, telemetry return.
- `src/lib/analytics/record-workspace-ai-event.ts` — `workspace_ai_events` writer for factory.
- `src/app/api/ai/generate-workout-chain/route.ts` — telemetry recording, optional `task_id`.
- `src/lib/workout-factory/api-client.ts` + `useTaskWorkoutAi.ts` — forward `task_id`.
- `src/features/analytics/system/system-analytics-labels.ts` — `generate_workout_chain` surface label.

**P3**

- `src/lib/workout-factory/build-deterministic-outline-fill.ts` — preflight → default prescription assembler.
- `src/lib/workout-factory/build-deterministic-outline-fill.test.ts` — format default tests.
- `src/lib/workout-factory/generate-workout-outline-fill-runner.ts` — fallback path + `fill_fallback` metadata.
- `src/lib/workout-factory/types/ai-workout.ts` — `fill_fallback` chain metadata fields.
- `src/components/modals/task-modal/hooks/useTaskWorkoutAi.ts` — fallback success toast.
