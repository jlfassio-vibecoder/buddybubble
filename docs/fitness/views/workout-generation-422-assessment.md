# Workout Generation Workflow — 422 Root Cause, Architectural Assessment & Gap Analysis

_Scope: `POST /api/ai/generate-workout-chain` (parametric outline-fill pipeline) and its supporting modules._

_Status: P0 fixes shipped (§4); test coverage and production logging added (§7). P1+ remain recommendations._

---

## 1. Executive summary

The production errors

```
/api/ai/generate-workout-chain:1  Failed to load resource: the server responded with a status of 422 ()
```

are **not** a transport/auth/routing problem. The endpoint emits `422` from exactly **one** place: the Vertex _Stage‑1 outline fill_ output failed server-side validation (`OUTLINE_FILL_VALIDATION_FAILED`) after **both** repair attempts are exhausted.

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
  • callVertexAI attempt 1 (gemini-3.1-flash-lite-preview, temp 0.2, 8192 tok)
  • parseJSONWithRepair()                            → retry on parse fail
  • validateFillParametricOutlineOutput()            → retry on validation fail
  • callVertexAI attempt 2 (prompt includes prior validation_error)
  • parse + validate again                           → ★ 422 if still failing ★
  • hydrateAndValidateOutlineBlocks()                → 500 on post-fill drops
  • buildWorkoutInSetFromOutlineFill() + assemble    → 200
```

The 422 site (after `MAX_FILL_ATTEMPTS = 2`):

```136:147:src/lib/workout-factory/generate-workout-outline-fill-runner.ts
  if (!fillValidation || !fillValidation.valid) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: 'OUTLINE_FILL_VALIDATION_FAILED',
          message: `Outline fill (Stage 1) failed: ${lastError}`,
          validation_error: lastError,
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      ),
    };
  }
```

---

## 3. Root cause of the 422s

`validateFillParametricOutlineOutput` enforces two classes of rules against the model output:

1. **Structure preservation** (`assertFillPreservesStructure`): identical block count, exact (trimmed) block names, identical `block_format`, byte-stable normalized `format_params`, and unchanged instruction-only vs exercise-shaped “shape”.
2. **Per-exercise prescription**: every exercise in every exercise-shaped block must carry `sets > 0`, a non-empty string or numeric `reps`, or `work_seconds > 0`.

Both run against the output of up to **two** calls to `gemini-3.1-flash-lite-preview` (a small preview model) at `temperature: 0.2`, with repair retry on parse/validation failure (§4.3). Remaining triggers after P0:

| #   | Trigger                                                       | Why it fires                                                                                                                                                                                                                                    | Severity                 |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| A   | **Numeric `reps`** (`"reps": 12` instead of `"12"`)           | `exerciseHasPrescription` only accepted _string_ reps; circuit/AMRAP exercises that have reps-but-no-sets failed. The downstream mapper happily coerces numeric reps with `String()`, so validation was stricter than the rest of the pipeline. | **High** (fixed)         |
| B   | **Per-exercise prescription required for time-domain blocks** | EMOM/Tabata derive work/rest/rounds from `format_params` (see `hydrateEmom*`/`hydrateTabata*`). A model that lists movement names only (legitimate for those formats) is rejected, even though the assembler would have hydrated them.          | High (design — see §5)   |
| C   | **Block name reworded**                                       | LLM emits `"Main EMOM (Conditioning)"` vs outline’s `"Main EMOM"`; exact-match → reject. The server already holds the authoritative names from preflight and does not need the model to echo them.                                              | Medium (design — see §5) |
| D   | **Truncated / malformed JSON**                                | 8192-token cap + verbose fills → cut-off JSON; `parseJSONWithRepair` patches some cases but a structurally broken tail yields wrong block count / dropped fields → reject (or a thrown parse error → **500**, not 422).                         | Medium                   |
| E   | **`format_params` echoed imperfectly**                        | Model nudges a value (e.g. `interval_seconds` 60→90). Caught by the byte-stable comparison. This one is _correct_ to reject.                                                                                                                    | Low                      |

A/B/C/D are non-deterministic, so the endpoint succeeds sometimes and 422s other times for the _same_ outline — exactly the “inconsistent, fails frequently” symptom reported.

### Secondary aggravator — misleading UX

On any 422 the task modal shows:

```183:185:src/components/modals/task-modal/hooks/useTaskWorkoutAi.ts
          toast.error(
            'Generation failed: The workout structure is missing data (like sets/reps). Please edit the structure and try again.',
          );
```

This tells the user to edit a structure that is usually valid (it passed client-side `preflightOutlineBlocks`). The real failure is the model fill, so the suggested remedy does not help and erodes trust.

---

## 4. Fixes applied in this pass

Surgical, additive changes that align validation with the rest of the pipeline and add resilience. No existing behavior on the success path is changed.

### 4.1 Accept numeric `reps` in prescription check (Trigger A)

`src/lib/workout-factory/prompt-chain/fill-parametric-outline.ts` — `exerciseHasPrescription` now treats a finite positive numeric `reps` as a valid prescription, matching the downstream mapper which already does `String(reps)`.

### 4.2 Preserve numeric `reps` in the validated output (Trigger A, silent data loss)

Same file, output builder: numeric `reps` are now coerced to string instead of being dropped. Previously a `straight_sets` block with `sets` + numeric `reps` _passed_ validation but lost the rep target, collapsing it to the `"1"` default in `buildWorkoutInSetFromOutlineFill`. This was a latent data-quality bug independent of the 422.

### 4.3 Bounded repair retry before surfacing 422 (Triggers A–D)

`src/lib/workout-factory/generate-workout-outline-fill-runner.ts` — the Vertex call + parse + validate is now wrapped in a 2-attempt loop. On a failed attempt the validation error (or parse error) is fed back into the prompt (`=== PREVIOUS ATTEMPT REJECTED ===`) and the model is asked to correct it. Parse failures are also retried (previously a parse throw became a 500 with no second chance). Only after the final attempt fails does the endpoint return the 422. This converts the most common one-off drifts from hard failures into transparent self-corrections.

### 4.4 Production logging for fill failures

`generate-workout-outline-fill-runner.ts` — unconditional structured `console.warn` on each failed attempt (`fill_attempt_failed`) and on final 422 (`fill_exhausted`), including `attempt`, `maxAttempts`, and `validation_error`.

### 4.5 Test coverage

- `fill-parametric-outline.test.ts` — numeric-rep acceptance and string coercion
- `generate-workout-outline-fill-runner.test.ts` — single-shot success, validation retry, parse retry, exhausted 422

> Trade-off: a true failure now costs up to two model calls (added latency/cost on the failure path only). The success path is unchanged.

---

## 5. Architectural assessment

**Strengths**

- Clear separation of concerns: Coach “Phase B” owns _structure_; the factory owns _fill_. The outline is a read-only contract, which is a sound design for determinism and safety.
- Strong deterministic post-processing (`hydrateAndValidateOutlineBlocks`, EMOM matrix hydration, format normalization) keeps the stored workout shape canonical.
- Validation is well unit-tested and the block blueprint library is mirrored byte-for-byte between app and Supabase edge.

**Core architectural tension**
The pipeline asks a **probabilistic** component (an LLM, specifically a _lite preview_ model) to satisfy a **deterministic, exact-match** contract in **one shot**, then treats any deviation as a terminal error visible to the end user. Robust LLM pipelines instead: (a) make the server authoritative for anything it already knows, (b) validate leniently then _repair_, and (c) retry/fallback before failing. This workflow did none of these on the fill stage.

**Specific design gaps**

1. **The server re-validates data it owns.** Block `name`, `block_format`, and `format_params` come from the preflight outline the server already holds. Requiring the model to echo them perfectly — and rejecting on mismatch — adds failure modes for zero benefit. The server could **graft** the model’s `exercises[]` onto the authoritative preflight blocks by index and ignore model-supplied structural fields entirely. This would eliminate Triggers C and E as failure causes outright.

2. **Validation is stricter than consumption (Trigger B).** The assembler hydrates EMOM/Tabata prescriptions from `format_params`, yet the validator demands per-exercise prescriptions for those same blocks. Validation should mirror what the assembler can actually produce: for time-domain formats whose timing lives in `format_params`, a named exercise should be sufficient. (The existing test `rejects exercises without prescription fields` encodes the current strict behavior, so this change must be made deliberately with the test updated — hence it is flagged as a recommendation, not auto-applied.)

3. **No retry/fallback ladder on the fill stage.** Addressed by the 2-attempt repair retry in §4.3. A fuller design would add a deterministic fallback: if both attempts fail, assemble the workout from the preflight outline with default prescriptions rather than returning nothing.

4. **Output token cap risk (Trigger D).** `maxTokens: 8192` for a fill that echoes the entire outline plus exercises is tight for multi-block sessions. Truncation manifests as opaque validation/parse errors. Consider raising the cap, or — better — not requiring the model to echo the structure at all (see gap #1), which drastically shrinks the output.

5. **Error taxonomy is coarse and partly misleading.** `OUTLINE_FILL_VALIDATION_FAILED` is reused for “renamed a block”, “numeric reps”, and “truncated JSON” — very different operational causes. The client then maps _all_ 422s to a single “edit your structure” message that is usually wrong. Distinct error codes + an accurate user message (and a one-click “Regenerate”) would improve both diagnosis and UX.

6. **Observability.** P0 adds structured `console.warn` for fill attempt failures and exhausted retries (§4.4). Metrics/dashboard remain P2.

---

## 6. Gap analysis & prioritized recommendations

| Priority | Gap                                                      | Recommendation                                                                                                   | Status                                       |
| -------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| P0       | Numeric reps rejected / dropped                          | Accept + preserve numeric reps                                                                                   | ✅ Done (§4.1–4.2)                           |
| P0       | Single-shot fill, no semantic retry                      | Repair retry with error feedback                                                                                 | ✅ Done (§4.3)                               |
| P1       | Server re-validates fields it owns (names/format)        | Graft model `exercises[]` onto authoritative preflight blocks by index; stop comparing/echoing structural fields | Recommended                                  |
| P1       | Validator stricter than assembler for time-domain blocks | Relax per-exercise prescription for EMOM/Tabata when `format_params` carry timing; update the encoding test      | Recommended                                  |
| P1       | Misleading client error on 422                           | Differentiate error codes; show accurate message + “Regenerate” affordance                                       | Recommended                                  |
| P2       | Truncation under 8192-token cap                          | Raise cap and/or shrink output by not echoing structure                                                          | Recommended                                  |
| P2       | No production observability of failure reasons           | Log `validation_error` reason (and attempt count) unconditionally; add a metric                                  | Partial (§4.4 logging done; metrics pending) |
| P3       | Deterministic fallback absent                            | On final fill failure, assemble from preflight outline with default prescriptions instead of 422                 | Optional                                     |

---

## 7. Verification performed

- `npx vitest run` on `fill-parametric-outline.test.ts`, `generate-workout-outline-fill-runner.test.ts`, and `generate-workout-chain-runner.test.ts` → **18 passed**.
- `npx tsc --noEmit` → clean.
- `npx eslint` on changed files → clean.

## 8. Files touched

- `src/lib/workout-factory/prompt-chain/fill-parametric-outline.ts` — numeric reps accepted (prescription check) and preserved (output builder).
- `src/lib/workout-factory/prompt-chain/fill-parametric-outline.test.ts` — numeric-rep test case.
- `src/lib/workout-factory/generate-workout-outline-fill-runner.ts` — bounded repair retry, exported `MAX_FILL_ATTEMPTS`, production logging.
- `src/lib/workout-factory/generate-workout-outline-fill-runner.test.ts` — retry loop tests (new).
