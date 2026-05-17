# Coach Live Co-Pilot — Epic Blueprint

> **Status:** blueprint (not started). Single design document covering the entire
> overarching goal. Implementation is staged into **two strictly isolated steps**
> so each can be tested in isolation before the next is touched.
>
> **Surgical-edit rule.** No new agents, no new RPCs, no new tables, no new
> `messages` columns, no new mention handles. We extend existing modules only.
> Polymorphism contract from
> [`docs/refactor/standard-task-chat-rail/phase-3.7-backend-agent-alignment.md`](../standard-task-chat-rail/phase-3.7-backend-agent-alignment.md)
> remains in force: **non-workout item types must not gain a fitness coupling.**

---

## 1. The Live Co-Pilot goal

In the `StandardTaskChatRail` surface (Task Modal task-scoped rail) the Coach
agent must behave as a **live co-pilot** for the open task card:

1. On **every turn**, Coach sees the **current state of the open card**
   (title, description, **and the full structured workout metadata** when the
   card has been generated).
2. When the user has **already generated** the workout (i.e. `tasks.metadata`
   carries structured `exercises[]` / `workout_type` / `duration_min` /
   `blocks[]`), Coach treats that as the **authoritative baseline** for any
   further edits. Subsequent rail requests like "add a finisher", "swap squat
   for a hinge", "make the third block heavier" must produce **immediate
   structured writes** (`proposed_workout_metadata` or
   `updated_task_description`), not another consent-gated planning loop.
3. Title and description edits (clean text changes with no
   `proposed_workout_metadata`) continue to flow through
   `agent_update_task_and_reply` (already shipped — see
   `agent_update_task_and_reply` direct-write branch in
   [`supabase/functions/agents/coach/strategy.ts`](../../../supabase/functions/agents/coach/strategy.ts)).

This Epic does **not** alter live-player (`WorkoutPlayer`) traffic, the main
bubble chat, or Buddy / Organizer flows.

---

## 2. Verified failure mode (production transcript)

User flow (real session, rail surface, `item_type='workout'`):

| Turn | Author | Content                                                                                                                                      |
| ---- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| T1   | Coach  | (readiness/sleep intake done)                                                                                                                |
| T2   | User   | "I generated the workout, please review. I'd like to add a 'finisher' to the workout."                                                       |
| T3   | Coach  | "Understood. … what kind of finisher are you envisioning? high-intensity, core, or something else?"                                          |
| T4   | User   | "I already generated it, please review and add a finisher."                                                                                  |
| T5   | Coach  | "It sounds like you've already got a workout in mind! … could you please share the exercises and structure of the workout you've generated?" |

Expected behavior: at T3 Coach should **already see** the exercises Coach
itself drafted minutes earlier (now persisted on the card via the React-side
generate flow), and propose a finisher block **with structured JSON** in the
same turn.

Observed behavior: Coach acts as if the workout does not exist and asks the
user to retype the plan.

This is the **two-bug interaction** the rest of this doc dissects.

---

## 3. Root cause #1 — Data Shadowing (Read Path)

### What the model sees today

`CoachStrategy.buildSystemPrompt` (in
[`supabase/functions/agents/coach/strategy.ts`](../../../supabase/functions/agents/coach/strategy.ts))
composes the system prompt and calls

```ts
const currentWorkoutContextJson = resolveCurrentWorkoutContextJsonFromThread(
  ctx.history,
  { metadata: ctx.message.metadata },
  taskMetadataForContext,
);
```

The resolver
([`supabase/functions/agents/coach/context.ts`](../../../supabase/functions/agents/coach/context.ts):113–137)
applies this precedence:

```text
1. Walk history rows; last non-empty `metadata.workoutContext` / `workout_context` wins.
2. If trigger row carries non-empty `workoutContext` / `workout_context`, override.
3. ONLY IF `best == null`, fall back to `tasks.metadata` (when shaped like a workout).
```

### Why this shadows the generated workout on the rail surface

- `tasks.metadata` is the **canonical artifact** the UI writes to when the
  user clicks **Generate Workout** in the rail flow.
- History rows on the rail surface **frequently** carry **stale or partial**
  `workoutContext` payloads — wizard previews, intake snapshots, legacy
  workout-player traces — and `isNonEmptyWorkoutPayload` treats **any object
  with ≥ 1 key** as non-empty.
- Result: a stale message-level payload wins the precedence over the freshly
  generated `tasks.metadata`. Coach renders `CURRENT WORKOUT CONTEXT` from the
  shadow payload, or — if shadow + trigger are empty objects in a way that
  still passes `isNonEmptyWorkoutPayload` — sees garbage that does not contain
  the exercises the user is asking about.

In either case, the prompt block the LLM is supposed to anchor on
(`--- CURRENT WORKOUT CONTEXT ---`) **does not represent the open card**.
That is why "review my workout" reads to the LLM as "no workout exists yet".

### Where this lives

| File                                                                                                                          | Symbol                                         | Role                                |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------- |
| [`supabase/functions/agents/coach/context.ts`](../../../supabase/functions/agents/coach/context.ts)                           | `resolveCurrentWorkoutContextJsonFromThread`   | Precedence rule (the bug)           |
| [`supabase/functions/agents/coach/strategy.ts`](../../../supabase/functions/agents/coach/strategy.ts)                         | `buildSystemPrompt`                            | Calls the resolver and writes block |
| [`supabase/functions/agents/coach/prompts.ts`](../../../supabase/functions/agents/coach/prompts.ts) (mirror of `src/lib/...`) | `WORKOUT_CONTEXT_HEADER`, rail-surface helpers | Header injection + rail detection   |

---

## 4. Root cause #2 — Prompt Restraint (Write Path)

Even when **`CURRENT WORKOUT CONTEXT`** is present, the system prompt
**actively forbids** Coach from writing structured changes without a separate
consent turn.

### Where the restraint is encoded today

In [`src/lib/agents/coach/prompts.ts`](../../../src/lib/agents/coach/prompts.ts)
the base prompt at `buildBaseCoachPrompt(currentDate)` contains:

> _"PRE-DRAFT CONFIRMATION (critical human-in-the-loop step) … On the first
> turn where you would otherwise prescribe or draft, unless
> user_requested_immediate_card is true: (1) acknowledge what they shared,
> (2) say you are starting to design or are ready to draft (intent, not
> completion), (3) ask for a final green light…"_
>
> _"When the server includes CURRENT TASK CONTEXT, the user is discussing
> that existing task. Follow PRE-DRAFT CONFIRMATION before emitting
> structured proposed_workout_metadata: on the confirmation-only turn, set
> update_existing_task to false and leave proposed_workout_metadata null."_

And in `buildCurrentTaskContextBlock(title, description, { rail: true })`:

> _"PRE-DRAFT CONFIRMATION (live co-pilot): When the user requests title or
> description changes for this card, set update_existing_task to true and
> provide updated_task_title and/or updated_task_description with the full
> revised text. You are actively co-editing the card with the user. … **For
> structured `proposed_workout_metadata`, still require clear affirmative
> consent before drafting.**"_

The bolded sentence is the **restraint clause**. It is appropriate at
**first draft from scratch** but becomes a regression once the workout has
already been generated and the user is asking for **incremental edits to an
existing structure**.

### Behavioral consequence

Coach receives:

- `CURRENT TASK CONTEXT` block (always on rail)
- `CURRENT WORKOUT CONTEXT` JSON block (when Step 1 lands — today: often
  shadowed)
- A standing instruction to **gate structured writes behind an additional
  consent turn**

Even if Step 1 alone made the workout visible, the model would still
default to asking "what kind of finisher would you like?" rather than
emitting `proposed_workout_metadata` with the finisher block applied — and
would still avoid writing structured JSON without explicit user
re-confirmation.

---

## 5. Invariants (non-negotiable)

The two steps below must protect every one of these:

1. **Rail surface only.** All behavior changes are gated on
   `isCoachRailSurfaceFromMessageMetadata(ctx.message.metadata) === true`.
   Non-rail traffic (`WorkoutPlayer`, main bubble chat, deep-linked thread
   replies) sees **byte-identical** prompts and resolver behavior.
2. **Polymorphism contract held.** When `tasks.item_type` is anything other
   than `workout` / `workout_log` (or `taskMetadataLooksWorkoutShaped`
   returns true), neither Step 1 nor Step 2 changes the prompt. Non-workout
   item types remain fitness-free.
3. **Live-player (`WorkoutPlayer`) precedence preserved.** When the trigger
   message itself carries `metadata.workoutContext` /
   `metadata.workout_context` (i.e. an in-session player tick), that payload
   still **wins** over `tasks.metadata`. The fix only changes the
   `best == null` fallback — never the live-player override path.
4. **Single source of truth for "what changed" stays Coach JSON.** The
   restraint relaxation in Step 2 does NOT remove the rule
   `assertCoachReplySelfAttestation` (`server-guards.ts`): if Coach narrates
   a structured change, it must also emit the structured fields. That guard
   stays.
5. **Existing `agent_update_task_and_reply` direct-write branch unchanged.**
   Title/description-only edits continue to go through the direct-update
   RPC. No regression in the no-`proposed_workout_metadata` happy path.
6. **No mirror drift.** Every change in
   [`src/lib/agents/coach/*`](../../../src/lib/agents/coach) must land in the
   matching [`supabase/functions/agents/coach/*`](../../../supabase/functions/agents/coach)
   mirror in the same PR. `pnpm check:agent-mirror` must pass.
7. **Strict isolation between Step 1 and Step 2.** Step 1 changes the
   **Read Path** only (`context.ts`, plus a one-call-site touch in
   `strategy.ts` if needed). Step 2 changes the **Write Path** only
   (`prompts.ts`). Neither step depends on a code change in the other; they
   are sequenced for **verifiable testing**, not for compilation order.

---

## 6. Locked decisions

1. **Step 1 fixes the precedence rule, not `isNonEmptyWorkoutPayload`.** The
   shape check stays simple ("non-empty"); the **order** in which sources
   are considered is what becomes surface-aware. The function signature
   gains a single new option (e.g. `preferTaskMetadata: boolean`) so the
   non-rail path can be left literally untouched.
2. **The new precedence (rail surface, workout-shaped task) is:**
   ```text
   a) trigger row workoutContext / workout_context  ← live-player override (unchanged)
   b) tasks.metadata when shaped like a workout      ← NEW: anchors rail edits
   c) history rows workoutContext (last non-empty)   ← legacy / non-rail fallback
   ```
   On the non-rail path (and on the rail when `tasks.metadata` is empty /
   not workout-shaped) the **old order (a → c → b)** still applies, so
   `WorkoutPlayer` and pre-generate rail turns are unaffected.
3. **Surface detection lives where it already lives.** Strategy reads
   `isCoachRailSurfaceFromMessageMetadata(ctx.message.metadata)` and passes
   the boolean into the resolver via the new option. No new imports cross
   the rail / non-rail boundary.
4. **Step 2 relaxes the rail tail, not the global base prompt.** The
   "PRE-DRAFT CONFIRMATION" clause in `buildBaseCoachPrompt` stays
   word-for-word for non-rail surfaces. The relaxation is **scoped to the
   `opts.rail === true` branch** of `buildCurrentTaskContextBlock`, plus
   one surgical caveat sentence in the base prompt explicitly exempting the
   rail co-pilot from the gating sentence at base-prompt line 284 (the
   "CURRENT TASK CONTEXT … Follow PRE-DRAFT CONFIRMATION" instruction).
5. **No schema change.** `proposed_workout_metadata`, `update_existing_task`,
   and `task_modal_intake_patch` all keep their current Gemini
   `responseSchema` shape. The Epic relies on **prompt** changes only on
   the write side.
6. **No new debug log shapes.** The existing
   `[DEBUG] Coach Prompts: Injecting live co-pilot system instructions for rail surface.`
   log in `buildCurrentTaskContextBlock` is sufficient. Step 1 adds one
   new structured log (next item) so the resolver decision is auditable.
7. **One new structured log** (Step 1, telemetry only):
   `coach workout context source` with fields
   `{ request_id, slug, surface, source: 'trigger' | 'task_metadata' | 'history' | 'none', bytes }`.
   This is the **observability hook** that lets us verify Step 1 in
   isolation without running Step 2.

---

## 7. Step 1 — Fix Data Shadowing (Read Path)

> **Allowed scope:**
> [`supabase/functions/agents/coach/context.ts`](../../../supabase/functions/agents/coach/context.ts)
> (the only canonical file — there is no `src/lib` twin for this module),
> and **one** call-site touch in
> [`supabase/functions/agents/coach/strategy.ts`](../../../supabase/functions/agents/coach/strategy.ts)
> to pass the new option.
>
> **Forbidden in Step 1:**
>
> - Any edit to `prompts.ts` (canonical or mirror)
> - Any edit to `server-guards.ts`, `parse.ts`, `schema.ts`, RPC wrappers
> - Any UI / React change

### 7.1 Change inventory

**A.** `resolveCurrentWorkoutContextJsonFromThread` signature grows one
option:

```ts
export function resolveCurrentWorkoutContextJsonFromThread(
  rowsChronologicalOldestFirst: ReadonlyArray<{ metadata?: unknown }>,
  trigger: { metadata?: unknown },
  taskMetadataFallback: unknown | null,
  opts?: { preferTaskMetadata?: boolean },
): string | null;
```

Default (`opts?.preferTaskMetadata !== true`): **today's order**, byte-equivalent
to current `context.ts:113–137`.

When `opts.preferTaskMetadata === true`:

```text
1. fromTrigger = extractRawWorkoutContextFromMetadata(trigger.metadata)
   → if non-empty, return it (live-player override unchanged).
2. If `taskMetadataFallback` is a non-empty workout-shaped object,
   stringify and return it. STOP HERE.
3. Otherwise, walk history rows oldest → newest for the last non-empty
   `workoutContext` / `workout_context` (legacy behavior).
4. None → return null.
```

The function MUST also emit one structured log line on the resolved source
(see §6.7):

```ts
log('info', 'coach workout context source', {
  request_id: requestId,
  slug: COACH_SLUG,
  surface: opts?.preferTaskMetadata ? 'rail' : 'non_rail',
  source: 'trigger' | 'task_metadata' | 'history' | 'none',
  bytes: resolvedJson?.length ?? 0,
});
```

(Plumbing the `requestId` may require accepting it as an argument — the
current function has no logger access. If so, accept `requestId: string` as
an additional argument and propagate it from the strategy.)

**B.** `CoachStrategy.buildSystemPrompt` updates the one call site:

```ts
const isRailSurface = isCoachRailSurfaceFromMessageMetadata(ctx.message.metadata);
const currentWorkoutContextJson = resolveCurrentWorkoutContextJsonFromThread(
  ctx.history,
  { metadata: ctx.message.metadata },
  taskMetadataForContext,
  { preferTaskMetadata: isRailSurface },
);
```

Everything else in `buildSystemPrompt` stays as is. `isRailSurface` is
already computed at this point in the file (used by
`buildCurrentTaskContextBlock(..., { rail: true })`).

### 7.2 Acceptance criteria — Step 1 in isolation

1. **Logs prove the resolved source.** When the rail surface is talking
   about a task whose `tasks.metadata` contains structured exercises, the
   new `coach workout context source` log line records
   `source: 'task_metadata'` for that request.
2. **Block contents prove the read.** The captured system prompt for that
   same request contains a `--- CURRENT WORKOUT CONTEXT ---` block whose
   JSON body matches the **task row's** `metadata` (subject to the existing
   `WORKOUT_CONTEXT_JSON_PROMPT_CAP` truncation), not whatever stale
   `messages.metadata.workoutContext` happened to be in the last 15 rows.
3. **Live-player path byte-identical.** A trigger row carrying
   `metadata.workoutContext` (workout-player session) still resolves to
   `source: 'trigger'`. The block contents are exactly today's behavior.
4. **Non-rail path byte-identical.** A trigger with no rail surface marker
   (`messages.metadata.surface !== 'standard_task_chat_rail'`) resolves
   identically to today's order; the new log records
   `surface: 'non_rail'`.
5. **No prompt-level behavior change yet.** Coach replies under Step 1
   alone may still ask for confirmation (Root Cause #2 is unfixed). That
   is **expected and acceptable** at this checkpoint — the only thing we
   verify here is that the model has now been **shown** the workout.

### 7.3 Test plan — Step 1

- **Unit (Vitest, canonical resolver):** add cases that exercise
  - default mode (no opts) matches the pre-existing snapshot;
  - `preferTaskMetadata: true` + workout-shaped `taskMetadataFallback` +
    stale history `workoutContext` → returns task metadata JSON;
  - `preferTaskMetadata: true` + trigger `metadata.workoutContext` (live
    player on the rail — possible if a player message lands on a task
    rail) → still returns trigger (override unchanged);
  - `preferTaskMetadata: true` + empty `taskMetadataFallback` + history
    has non-empty `workoutContext` → returns history (graceful
    fallback).
  - The structured log emits the correct `source` value in each case
    (asserted via a captured logger).
- **Deno integration (`agent-dispatch/index.integration.test.ts`):** new
  scenario — trigger row carries `metadata.surface = 'standard_task_chat_rail'`,
  the mocked task row carries `metadata: { exercises: [...] }`, and one
  earlier history message carries `metadata.workoutContext: { partial: true }`
  (a stale shadow). Assert the captured system prompt contains the
  task-metadata JSON in the `CURRENT WORKOUT CONTEXT` block, and the
  history JSON does not appear there.
- **Manual smoke (staging).** Reproduce the production transcript: open a
  workout task, generate the workout, send "review and add a finisher".
  Inspect Edge logs for `coach workout context source` →
  `source: 'task_metadata', surface: 'rail'`. Conversation text may still
  loop on consent — that's the Step 2 problem.

### 7.4 Rollback — Step 1

Single-flag revert: if the new option produces a regression on rail
turns, callers can pass `preferTaskMetadata: false` (or simply revert the
strategy call-site one-liner). The resolver continues to behave exactly as
today.

---

## 8. Step 2 — Fix Prompt Restraint (Write Path)

> **Allowed scope:**
> [`src/lib/agents/coach/prompts.ts`](../../../src/lib/agents/coach/prompts.ts)
> **and** the byte-for-byte mirror
> [`supabase/functions/agents/coach/prompts.ts`](../../../supabase/functions/agents/coach/prompts.ts).
> Nothing else.
>
> **Forbidden in Step 2:**
>
> - Any edit to `context.ts`, `strategy.ts`, `server-guards.ts`,
>   `parse.ts`, `schema.ts`, RPC wrappers, or any test fixture beyond the
>   minimum required to update string-matching assertions.
> - Any UI / React change.

### 8.1 Change inventory

**A.** Rail tail in `buildCurrentTaskContextBlock(title, description, { rail: true })`
([`prompts.ts:356`](../../../src/lib/agents/coach/prompts.ts)):

Today's text (verbatim):

> _"PRE-DRAFT CONFIRMATION (live co-pilot): When the user requests title or
> description changes for this card, set update_existing_task to true and
> provide updated_task_title and/or updated_task_description with the full
> revised text. You are actively co-editing the card with the user. Your
> updates to the title and description will immediately appear on their
> screen. Do not tell them to finalize changes; simply confirm you have
> updated the card. **For structured proposed_workout_metadata, still
> require clear affirmative consent before drafting.**"_

Replacement (proposed; exact wording finalized in Step 2 PR):

> _"LIVE CO-PILOT MODE (Task Modal rail). You are actively co-editing this
> task with the user. **Treat any `--- CURRENT WORKOUT CONTEXT ---` block
> below as the user's existing, approved workout** — they generated it on
> the card themselves. When they ask for additions, swaps, or rewrites
> (e.g. "add a finisher", "make block 3 heavier", "swap squats for
> hinges"):_
>
> - _Set `update_existing_task: true`._
> - _Emit `proposed_workout_metadata` containing the **full revised
>   workout** (not a diff), preserving every block / exercise the user did
>   not ask to change, with the requested change applied._
> - _Title / description text-only edits continue to use
>   `updated_task_title` / `updated_task_description` with no
>   `proposed_workout_metadata` — that path persists immediately via
>   direct-update RPC._
>
> _Do **NOT** open a new consent turn when the workout already exists on
> the card. Confirm what you did in `reply_content`; the structured fields
> are the writes."_

This keeps the rail co-pilot policy crisp:

- **Workout already exists** (`CURRENT WORKOUT CONTEXT` present) →
  immediate structured edit.
- **Workout does not exist yet** (no `CURRENT WORKOUT CONTEXT`) → fall
  through to the normal global rule: consent before structured
  `proposed_workout_metadata`. The global rule lives in
  `buildBaseCoachPrompt` and is not removed.

**B.** Carve-out in `buildBaseCoachPrompt` at the "CURRENT TASK CONTEXT" line
([`prompts.ts:284`](../../../src/lib/agents/coach/prompts.ts)):

Today's text (verbatim):

> _"When the server includes CURRENT TASK CONTEXT, the user is discussing
> that existing task. **Follow PRE-DRAFT CONFIRMATION before emitting
> structured proposed_workout_metadata**: on the confirmation-only turn,
> set update_existing_task to false and leave proposed_workout_metadata
> null. …"_

Append, surgically (no edit to existing words; append-only):

> _"EXCEPTION (live co-pilot rail): when the prompt also contains the
> `LIVE CO-PILOT MODE` block AND a `--- CURRENT WORKOUT CONTEXT ---` block,
> the workout already exists and PRE-DRAFT CONFIRMATION does **not**
> apply for incremental edits to it — emit structured fields immediately
> as described under LIVE CO-PILOT MODE."_

This is the **single** carve-out the base prompt needs. All other base-prompt
clauses (TRUTHFULNESS, EXECUTION PATCH precedence, PERSONAL CUES, TASK
MODAL INTAKE PATCH, anti-loop, JSON output contract) stay verbatim.

**C.** No other prompt changes. In particular:

- `WORKOUT_CONTEXT_HEADER`, `TASK_MODAL_INTAKE_UI_HEADER`,
  `TASK_MODAL_LIVE_STATE_HEADER`, `USER_CONTEXT_TAIL`, the workout-open
  greeting prompt, `buildWorkoutOpenGreetingUserText`, and the
  EXERCISE_INDEX_MAP helpers are **untouched**.
- The non-rail branch of `buildCurrentTaskContextBlock` keeps its existing
  PRE-DRAFT CONFIRMATION tail unchanged.

### 8.2 Acceptance criteria — Step 2 (built on a green Step 1)

1. **Finisher flow works.** Rail surface, `item_type='workout'`,
   `tasks.metadata` populated. User: _"please add a HIIT finisher"_. Coach
   reply JSON:
   - `update_existing_task: true`
   - `proposed_workout_metadata` contains the full prior workout + the
     new finisher block
   - `reply_content` confirms what was added (no "what kind of finisher
     would you like?" loop)
2. **Swap flow works.** Same setup. User: _"swap the back squat for a
   hinge"_. Coach reply JSON replaces the matching exercise inside
   `proposed_workout_metadata`; everything else preserved.
3. **Title/description-only flow unchanged.** User: _"rename this to
   Kettlebell Endurance"_. Coach emits `updated_task_title` only, **no**
   `proposed_workout_metadata`. The existing `agent_update_task_and_reply`
   direct-write branch fires (zero `agent_insert_coach_workout_draft_reply`
   and zero `agent_create_card_and_reply`).
4. **No regression for first-draft turns.** Rail surface,
   `item_type='workout'`, `tasks.metadata` empty (no workout yet). User:
   _"design me a 45-min full-body session"_. Coach still runs PRE-DRAFT
   CONFIRMATION (asks for a final green light); does **not** emit
   `proposed_workout_metadata` on that turn. Behavior matches today.
5. **Non-rail surfaces unchanged.** Sending the same finisher request via
   the main bubble channel (`metadata.surface !== 'standard_task_chat_rail'`)
   continues to follow today's consent gate; no immediate structured
   write. Coach prompts are byte-identical to pre-Epic.
6. **Non-workout item types unchanged.** Rail surface, `item_type='idea'`.
   Coach replies in prose; no `proposed_workout_metadata` emitted; no
   `CURRENT WORKOUT CONTEXT` block in the system prompt; behavior matches
   today.
7. **Self-attestation guard still fires.** A model reply that **claims**
   "I added a finisher" but emits no structured fields still trips
   `assertCoachReplySelfAttestation` and falls back to the safe reply.
   That contract is untouched.
8. **Mirror parity.** `pnpm check:agent-mirror` passes.

### 8.3 Test plan — Step 2

- **Vitest, prompts.test.ts:** new cases asserting
  - rail tail (`opts.rail === true`) contains the `LIVE CO-PILOT MODE`
    string and does NOT contain the old "still require clear affirmative
    consent" sentence;
  - non-rail tail (no opts) is unchanged byte-for-byte vs the pre-Epic
    snapshot;
  - `buildBaseCoachPrompt(...)` contains the new "EXCEPTION (live
    co-pilot rail): …" string exactly once and the existing PRE-DRAFT
    CONFIRMATION sentence remains unchanged.
- **Deno integration:** add an end-to-end test that:
  - Sets up a rail surface trigger, workout-shaped `tasks.metadata`, mocks
    Vertex to return `update_existing_task: true` +
    `proposed_workout_metadata` for a "add a finisher" prompt.
  - Asserts the draft RPC (`agent_insert_coach_workout_draft_reply`) is
    called once with the full revised metadata.
  - Asserts `agent_update_task_and_reply` is NOT called (because
    `proposed_workout_metadata` is non-null).
- **Manual smoke (staging).** Reproduce the original production transcript.
  At T2 ("add a finisher"), Coach emits the structured edit on the same
  turn. At T1' (clean rename) the title-only direct-update path still
  fires. Logs show one `coach workout context source` →
  `source: 'task_metadata'` per request, no spurious self-attestation
  warnings.

### 8.4 Rollback — Step 2

Single-PR revert: restore the previous rail tail and remove the
base-prompt exception sentence. Step 1 remains in place (it is purely
read-path and benign on its own). No data migration required.

---

## 9. Polymorphism + scope guarantees (summary)

| Surface                       | `item_type`               | Step 1 read change?         | Step 2 prompt change?                                |
| ----------------------------- | ------------------------- | --------------------------- | ---------------------------------------------------- |
| `StandardTaskChatRail` (rail) | `workout` / `workout_log` | yes (`preferTaskMetadata`)  | yes (rail tail + base exception)                     |
| `StandardTaskChatRail` (rail) | non-workout               | no (no workout JSON anyway) | no (rail tail never wired by Coach for non-workout)¹ |
| Main bubble `ChatArea`        | any                       | no (no `surface` marker)    | no                                                   |
| `WorkoutPlayer`               | `workout`                 | no (trigger override wins)  | no                                                   |
| Buddy / Organizer             | any                       | n/a (different strategy)    | n/a                                                  |

¹ The `buildCurrentTaskContextBlock(..., { rail: true })` rail tail is only
composed by `CoachStrategy.buildSystemPrompt`, which only runs for the
Coach slug. Non-workout item types on the rail bind to other agents (or
to `null`) and never see this prompt.

---

## 10. Why this two-step split is safe to do sequentially

The user’s observed bug is the **product** of both root causes. We isolate
the fixes so each can be **independently verified** before the next is
touched:

1. **Step 1 in isolation.** Coach now **sees** the workout via
   `CURRENT WORKOUT CONTEXT` (verifiable in the captured system prompt and
   the new `coach workout context source` log). Conversation behavior may
   still ask for consent (Step 2 problem). That is acceptable — we have
   proved the data path.
2. **Step 2 on top of Step 1.** Coach now also **writes** structured
   metadata immediately for incremental edits to a workout it already
   sees. Conversation flow matches the goal in §1.

Step 1 alone never makes the agent "louder" (no new write license);
Step 2 alone without Step 1 would license writes the agent still cannot
ground in real data. The order **must** be Step 1 → Step 2.

---

## 11. Out of scope (explicit)

- **Coach history window.** The 15-message cap (`COACH_HISTORY_LIMIT`)
  stays. The Epic explicitly relies on `tasks.metadata` to carry the
  workout, not on history retention. Adjusting the cap is a separate
  future investigation.
- **`isNonEmptyWorkoutPayload` semantics.** We do not relax/tighten the
  shape check here. Step 1 fixes the precedence, not the shape predicate.
  A future hardening phase may require structural validation
  (`exercises[]` length, `workout_type` presence) — not in this Epic.
- **Server guards / RPC envelopes.** `applyCoachServerGuards`, the
  self-attestation guard, and all RPC wrappers (`agent_create_card_and_reply`,
  `agent_insert_coach_workout_draft_reply`, `agent_update_task_and_reply`)
  are unchanged.
- **`task_modal_intake_patch` flow.** Phase 3.7 stands as-is.
- **Buddy / Organizer prompts and strategies.** Unchanged.

---

## 12. Cross-references

- Production transcript: this Plan-mode review.
- Coach Read Path:
  [`supabase/functions/agents/coach/context.ts`](../../../supabase/functions/agents/coach/context.ts),
  [`supabase/functions/agents/coach/strategy.ts`](../../../supabase/functions/agents/coach/strategy.ts)
- Coach Write Path (prompts):
  [`src/lib/agents/coach/prompts.ts`](../../../src/lib/agents/coach/prompts.ts)
  with mirror at
  [`supabase/functions/agents/coach/prompts.ts`](../../../supabase/functions/agents/coach/prompts.ts)
- Coach server guards (unchanged in this Epic):
  [`src/lib/agents/coach/server-guards.ts`](../../../src/lib/agents/coach/server-guards.ts)
- Direct-update branch (already shipped) under
  `shouldDirectUpdate` in
  [`supabase/functions/agents/coach/strategy.ts`](../../../supabase/functions/agents/coach/strategy.ts)
- Standard rail epic (parent context):
  [`docs/refactor/standard-task-chat-rail/README.md`](../standard-task-chat-rail/README.md)
- Phase 3.7 polymorphism contract (still in force):
  [`docs/refactor/standard-task-chat-rail/phase-3.7-backend-agent-alignment.md`](../standard-task-chat-rail/phase-3.7-backend-agent-alignment.md)
- Phase 3.8 channel isolation (still in force):
  [`docs/refactor/standard-task-chat-rail/phase-3.8-strict-channel-isolation.md`](../standard-task-chat-rail/phase-3.8-strict-channel-isolation.md)
- Agent webhook secret rule (do not touch):
  [`.cursor/rules/supabase-agent-dispatch-webhook-secret.mdc`](../../../.cursor/rules/supabase-agent-dispatch-webhook-secret.mdc)
