# Outline block `name` hallucination fix

Runbook for MAX_TOKENS / runaway prose in `outline_draft_patch.blocks[].name` during Workout Builder outline co-pilot.

## Root cause

Gemini may encode duration, round counts, and exercise counts inside `name` instead of `format_params` and `exercises[]`. Long strings burn the 12288 output token budget and trigger `finishReason: MAX_TOKENS`.

## Three-layer fix

### 1. Vertex schema + prompts (generation hints)

- [`src/lib/agents/coach/schema.ts`](../../src/lib/agents/coach/schema.ts): `name` `maxLength` 40; routing descriptions on `exercises`, `format_params`, `outline_draft_patch.blocks`. Do **not** add `maxItems` on nested `exercises[]` — Vertex returns 400 “too many states”; cap length in parse (`MAX_OUTLINE_EXERCISES_PER_BLOCK`).
- [`src/lib/agents/coach/prompts.ts`](../../src/lib/agents/coach/prompts.ts): `buildOutlineCoPilotModeCoachBlock` includes GOOD/BAD few-shot routing examples.
- [`src/lib/agents/coach/build-outline-draft-context.ts`](../../src/lib/agents/coach/build-outline-draft-context.ts): draft context reminds model to echo revision and route timing to `format_params`.

### 2. Parse + guards (hard boundaries)

- [`src/lib/agents/coach/outline-block-name-sanitize.ts`](../../src/lib/agents/coach/outline-block-name-sanitize.ts): clamp names (40 chars), drop `block_name_too_verbose`, telemetry `block_name_clamped`.
- [`src/lib/agents/coach/parse.ts`](../../src/lib/agents/coach/parse.ts): `normalizeBlocksFromGeminiArray` applies sanitize; caps exercises (12) and instruction lines.
- [`src/lib/agents/coach/server-guards.ts`](../../src/lib/agents/coach/server-guards.ts): second pass on `outline_draft_patch.blocks` when outline co-pilot active.

### 3. Dispatch fallback

- [`src/lib/agents/coach/config.ts`](../../src/lib/agents/coach/config.ts): `COACH_OUTLINE_TRUNCATED_SAFE_REPLY` when `truncated` + `extras.coach.outlineCoPilotActive`.
- [`supabase/functions/agent-dispatch/handler.ts`](../../supabase/functions/agent-dispatch/handler.ts): selects outline-specific safe reply.

## Correct field routing

| Member request  | Use                                                           |
| --------------- | ------------------------------------------------------------- |
| 15-minute AMRAP | `block_format: "amrap"`, `format_params.time_cap_minutes: 15` |
| 4 exercises     | `exercises[]` with four short placeholders (`Station 1` …)    |
| Section label   | `name` ≤ 5 words, e.g. `"Main AMRAP"`                         |

## Verification checklist

- [ ] `pnpm check:agent-mirror`
- [ ] `pnpm check:agent-prompts`
- [ ] Unit: `outline-block-name-sanitize.test.ts`, `parse.test.ts` (outline patch), `server-guards.test.ts`, `prompts.test.ts`
- [ ] Manual E2E: Builder → “Add Main AMRAP 15 min with 4 stations” → Edge log `coach outline draft patch applied` with short `block_names`; no MAX_TOKENS
- [ ] Deploy `agent-dispatch` (do **not** change `AGENT_WEBHOOK_SECRET`)

## Observability

- `coach outline_draft_patch name sanitize` — parse-time drops (`block_name_too_verbose`, `block_name_clamped`)
- `coach outline draft patch applied` — includes `block_names`, `drop_count`
- `coach outline draft patch stale` — revision gate (unchanged)
