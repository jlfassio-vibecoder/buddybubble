# Workout Metadata Merge — Single Reconciliation Layer

> **Status:** blueprint (not started). Single design document defining the
> **one** place that reconciles Coach `proposed_workout_metadata` into
> `tasks.metadata` so polymorphic workout layouts (warm-up, cardio, strength,
> finisher, mobility, cool-down) write to **one canonical tree** and the rich
> View, flat editor, and downstream consumers stay consistent.
>
> **Surgical-edit rule.** No new RPC, no new table, no new column on `tasks`,
> no new column on `messages`, no new agent. We add **one shared module** and
> wire existing call sites to it. The merge contract from
> [`docs/refactor/coach-live-copilot/README.md`](../coach-live-copilot/README.md)
> remains in force: rail auto-apply still flows through
> `agent_update_task_and_reply` with `p_new_metadata`.

---

## 1. Why we need one merge place

Today the same workout is represented three different ways inside
`tasks.metadata`, and three different layers know how to "edit" it:

| Representation                                                                                                                        | Read by                                                                              | Written by                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `metadata.ai_workout_factory.workout_set` (rich `WorkoutInSet`: `exerciseBlocks`, `warmupBlocks`, `finisherBlocks`, `cooldownBlocks`) | `useTaskWorkoutAi.viewerWorkoutSet` → `WorkoutViewerContent` → `RichWorkoutReadView` | `/api/ai/generate-workout-chain` (Kanban factory)                        |
| `metadata.exercises` (flat `WorkoutExercise[]`)                                                                                       | `metadataFieldsFromParsed` → `TaskModalWorkoutFields` → `WorkoutExercisesEditor`     | Task modal Save (`buildTaskMetadataPayload`), `handleWorkoutViewerApply` |
| `metadata.blocks` (Coach polymorphic blocks)                                                                                          | `parseProposedWorkoutMetadata` (Coach parser) — **not** consumed by any UI today     | Coach rail auto-apply (`agent_update_task_and_reply` shallow-merge)      |

Net result observed in production: the chat says **"I added a finisher"**,
the JSONB row gains a `blocks` array, and the rich View pane still shows the
unchanged `workout_set`. The flat editor likewise ignores `blocks`. Without a
**single reconciliation step**, every polymorphic addition has to teach Edge,
RPC, the React viewer, and the React editor about the new shape independently.

This document defines that single step.

---

## 2. Goal in one sentence

After every successful rail auto-apply, `tasks.metadata` reflects **one
reconciled workout**: Coach edits land in the **same canonical tree** the rich
View reads (`ai_workout_factory.workout_set` when the card has one), and the
derived flat `exercises` array stays in lock-step so `metadataFieldsFromParsed`
and Task Modal Save do not fight the viewer.

Out of scope for this blueprint:

- Live `WorkoutPlayer` execution patches (separate path,
  `messages.metadata.workout_execution_patch_v1`).
- Personal cues (`personal_cues_resolved`) — separate RPC, separate JSON.
- Task Modal intake wizard patches (`task_modal_intake_patch_v1`) — separate
  flow.
- Buddy / Organizer agents — non-workout item types must not gain a fitness
  coupling.

---

## 3. Verified failure mode (production transcript)

Captured May 15, 2026 against deployed Step 3 (rail auto-apply):

| Turn | Author | Content                                                                                                                                                                                                    |
| ---- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1   | User   | "Can you write the finisher into the workout please?"                                                                                                                                                      |
| T2   | Coach  | "I experienced a technical hiccup calculating your workout. Could you repeat that?" _(Edge `fallback insertion`, `error_kind: timeout`)_                                                                   |
| T3   | User   | "Try adding the finisher one more time"                                                                                                                                                                    |
| T4   | Coach  | "I've added Kettlebell Thrusters as a finisher to your workout, placed after the Kettlebell Sumo Deadlifts and before the Deep Squat Hold. It's set for 3 sets of 10-12 reps to give you a strong finish!" |

Card after T4: **unchanged.** MAIN still ends at Kettlebell Sumo Deadlift,
COOL DOWN still starts at Deep Squat Hold, no Kettlebell Thrusters anywhere.

Two independent failures stacked:

1. **T2** — Vertex exceeded `LLM_TIMEOUT_MS` (operational; tracked separately
   in [`docs/agents/vertex-setup.md`](../../agents/vertex-setup.md) /
   secrets matrix).
2. **T4** — Even if persist had run, Coach output (`blocks: [{ name: 'Finisher', exercises: [...] }]`)
   would have been shallow-merged into a key the rich View **does not read**.
   The merge target is wrong. **This document fixes #2.**

---

## 4. Root cause — three independent stores, no reconciler

### 4.1 Rich `workout_set` is the View's source of truth

```src/components/modals/task-modal/hooks/useTaskWorkoutAi.ts
const viewerWorkoutSet = useMemo((): WorkoutSetTemplate | null => {
  const o = parseTaskMetadata(metadata) as Record<string, unknown>;
  const ai = o.ai_workout_factory;
  if (!ai || typeof ai !== 'object') return null;
  const ws = (ai as { workout_set?: unknown }).workout_set;
  if (!ws || typeof ws !== 'object') return null;
  return ws as WorkoutSetTemplate;
}, [metadata]);
```

When this returns non-null, `WorkoutViewerContent` renders
`RichWorkoutReadView`, which iterates **`workout_set.workouts[0]`** through
`normalizeWorkoutForEditor` and labels sections as **Warm-up**, **(named
exercise blocks)**, **Finisher**, **Cool down**.

### 4.2 Flat `exercises` is the editor's source of truth

```src/lib/item-metadata.ts
workoutExercises: asWorkoutExercises(o.exercises),
```

`metadataFieldsFromParsed` only reads `metadata.exercises`. The Task Modal
"Edit" toggle and `WorkoutExercisesEditor` write back via
`buildTaskMetadataPayload`, which **strips** any other workout keys it does
not manage.

### 4.3 Coach `blocks` parser exists but has no consumer

```src/lib/agents/coach/parse.ts
if (Array.isArray(o.blocks)) {
  const blocks: Record<string, unknown>[] = [];
  // …normalize…
  if (blocks.length > 0) out.blocks = blocks;
}
```

`parseProposedWorkoutMetadata` already passes `blocks` through. The Coach
strategy hands the full object to `agent_update_task_and_reply` as
`p_new_metadata`. The migration does an **object shallow-merge** with
`tasks.metadata`. So `metadata.blocks` exists in the row — but no UI reads
it. Net effect: silent write.

### 4.4 Polymorphism semantics are split across two shapes

`WorkoutInSet` already encodes the polymorphism users want:

```src/lib/workout-factory/types/workout-contract.ts
export interface WorkoutInSet {
  title: string;
  description: string;
  warmupBlocks?: WarmupBlock[];     // instruction-shaped (name + instructions[])
  blocks?: Exercise[];               // legacy flat
  exerciseBlocks?: ExerciseBlock[];  // strength/cardio/core: name + Exercise[]
  finisherBlocks?: WarmupBlock[];    // instruction-shaped, separate section
  cooldownBlocks?: WarmupBlock[];    // instruction-shaped, separate section
}
```

`WarmupBlock` ≠ `Exercise`. A Coach "finisher" expressed as
`blocks: [{ name: 'Finisher', exercises: [{ sets, reps, rpe }] }]` is
**exercise-shaped** — it belongs in `exerciseBlocks`, not `finisherBlocks`,
unless we also let Coach emit instruction-shaped finishers. The merge module
must decide this routing, not the UI.

---

## 5. Design — one shared module

### 5.1 Module identity

**Add canonical:** `src/lib/agents/_shared/workout-metadata/merge-coach-proposed-into-task-metadata.ts`

**Why under `src/lib/agents/_shared/`:** `pnpm check:agent-mirror` only discovers mirror pairs for files under `src/lib/agents/**` (see [`scripts/check-agent-mirror-parity.ts`](../../../scripts/check-agent-mirror-parity.ts)). Placing the module there enforces byte-for-byte parity with the Edge mirror without extending the parity script.

**Deno mirror:** `supabase/functions/_shared/workout-metadata/merge-coach-proposed-into-task-metadata.ts`

The Deno mirror is **byte-for-byte** the canonical body with `.ts` extensions
on imports (same pattern as Coach `schema.ts` / `parse.ts` /
`server-guards.ts`). Parity enforced by `pnpm check:agent-mirror`.

### 5.2 Public surface

```ts
export type MergeInput = {
  /** Current `tasks.metadata`. Treated as Json object; non-object → {}. */
  base: unknown;
  /** Post-parse, post-guard Coach `proposed_workout_metadata`. */
  proposed: Record<string, unknown> | null;
};

export type MergeResult = {
  /** Next `tasks.metadata` to persist (Json object). */
  metadata: Json;
  /** Structured trace for Edge logging — never user-visible. */
  mergeLog: {
    /** 'rich' when ai_workout_factory.workout_set present, else 'flat'. */
    target: 'rich' | 'flat';
    /** Sections touched in workout_set.workouts[0], if rich. */
    touched: Array<'warmup' | 'exerciseBlocks' | 'finisher' | 'cooldown'>;
    /** Number of exercises after merge (flat derived list). */
    exerciseCount: number;
    /** Reasons individual Coach pieces were dropped (size, shape, role). */
    drops: Array<{ field: string; reason: string }>;
  };
};

export function mergeCoachProposedIntoTaskMetadata(input: MergeInput): MergeResult;
```

### 5.3 Algorithm (deterministic, no I/O)

1. **Normalize `base`.** If not a plain object, treat as `{}`. Clone shallowly;
   never mutate the input.

2. **Short-circuit empty proposed.** If `proposed` is `null` or has no
   keys, return `{ metadata: base, mergeLog: target='flat', touched=[], … }`.

3. **Detect target shape.**
   - `hasRichSet = isPlainObject(base.ai_workout_factory?.workout_set)
&& Array.isArray(base.ai_workout_factory.workout_set.workouts)
&& base.ai_workout_factory.workout_set.workouts.length > 0`.

4. **Branch A — rich card (`hasRichSet === true`).**

   a. Clone `workout_set` and `workout_set.workouts[0]` (call it `session`).

   b. **Top-level scalars on `session`.** If `proposed.workout_type` is a
   non-empty string, set `session.title` only when product opts in
   (default: leave `session.title` unchanged, do not overwrite user titles).
   If `proposed.duration_min` is a finite integer, store it in
   `session.duration_min` **and** `base.duration_min` (the editor key).

   c. **`proposed.blocks` routing.** For each block `b` in
   `proposed.blocks`:
   - Compute `role = classifyBlockRole(b)`:
     - `'warmup'` if `/warm[\s-]?up/i.test(b.name)`.
     - `'finisher'` if `/finisher|burnout|amrap finisher/i.test(b.name)`.
     - `'cooldown'` if `/cool[\s-]?down|mobility|flexibility|stretch/i.test(b.name)`.
     - Else `'main'`.
   - For each role, the merge decides **shape**:
     - `'main'` → append/replace into `session.exerciseBlocks` as a new
       `ExerciseBlock` with `name = b.name`, `exercises = b.exercises`
       (mapped through `coachExerciseToFactoryExercise`, see 5.4).
     - `'warmup'` / `'finisher'` / `'cooldown'` →
       - If `b.exercises` length === 0 and `b.instructions` exists →
         append to `session.{warmup,finisher,cooldown}Blocks` as
         instruction-shaped (`WarmupBlock` with `instructions[]`).
       - Else → treat as **exercise-shaped** finisher / warm-up and append
         to `session.exerciseBlocks` with `name = b.name` (this is the
         current Coach output shape; product can later widen
         instruction-shaped finishers without breaking this path).
   - Default merge mode is **append unless Coach explicitly replaces**.
     Coach can opt into replacement by sending the **full revised block
     list** (signaled by a future `proposed.merge_mode = 'replace'` field;
     not in v1, document as reserved key).

   d. **`proposed.exercises` (flat) when `proposed.blocks` is absent.**
   Append to the **last** `session.exerciseBlocks` entry whose name is
   `'Main'` (case-insensitive) or `''`. If none exists, create a new block
   named `'Main'`. Same exercise mapping as 5.4.

   e. **Preserve `ai_workout_factory` siblings.** Carry over `generated_at`,
   `model`, `chain_metadata` unchanged. Only `workout_set` is touched.

   f. **Derive flat `exercises`.** Run
   `getExercisesFromWorkout(session)` → flatten to `WorkoutExercise[]` via
   `factoryExerciseToWorkoutExercise` (inverse of 5.4). Write to
   `next.exercises` so `metadataFieldsFromParsed` and Save stay aligned.

5. **Branch B — flat card (`hasRichSet === false`).**

   a. **Do not synthesize `ai_workout_factory`.** A flat card stays flat; if
   product later wants Coach to upgrade flat → rich, that is a separate
   ticket (open question 9.3).

   b. **`proposed.exercises`** → write into `next.exercises` (mapped through
   `proposedExerciseToWorkoutExercise`).

   c. **`proposed.blocks`** → flatten to a single `next.exercises` array in
   block order (warm-up first, then exercise blocks in order, then
   finisher, then cool-down), prefixing each exercise `name` with its
   block name when the block name is non-`'Main'` (UX choice; documented).

   d. **`workout_type` / `duration_min`** → write at top level
   (`buildTaskMetadataPayload` key names).

6. **Preserve unrelated keys.** Top-level keys that the merge does not own
   (e.g. `card_cover_path`, `linked_program_task_id`, `program_session_key`,
   future ungovered keys) must be carried through untouched. Equivalent to
   `Object.assign({}, base, patch)` where `patch` only contains keys defined
   above.

7. **Return** `{ metadata: next, mergeLog }`.

### 5.4 Exercise shape adapter

The factory `Exercise` (`order`, `exerciseName`, `sets`, `reps`, `rpe`,
`restSeconds`, `coachNotes`, `workSeconds`, `rounds`) and the editor
`WorkoutExercise` (`name`, `sets?`, `reps?`, `weight?`, `duration_min?`,
`rpe?`, `work_seconds?`, `rest_seconds?`, `rounds?`, `coach_notes?`,
`equipment?`, …) overlap heavily but use **different field names**. The
merge module owns the only adapter:

- `proposedExerciseToFactoryExercise({ name, sets, reps, coach_notes, equipment })`
  → `{ order, exerciseName: name, sets, reps: String(reps ?? ''), coachNotes: coach_notes }`.
- `factoryExerciseToWorkoutExercise({ exerciseName, sets, reps, rpe, restSeconds, coachNotes, workSeconds, rounds })`
  → `{ name: exerciseName, sets, reps, rpe, rest_seconds: restSeconds, coach_notes: coachNotes, work_seconds: workSeconds, rounds }`.

These adapters live **inside** the merge module and are not exported. If
another caller needs them later, lift to `src/lib/agents/_shared/workout-metadata/` or a shared package.

### 5.5 What the merge module **does not** do

- It does **not** read from Supabase. It is a pure function of
  `(base, proposed)`.
- It does **not** validate Coach output structurally — that is
  `parseProposedWorkoutMetadata` + `applyCoachServerGuards`.
- It does **not** decide whether to persist (rail vs draft path is still
  `strategy.persist`'s decision).
- It does **not** know about `messages.metadata` (live grid, intake
  wizard) — those have their own pipelines.

---

## 6. Wiring — minimal edits at each call site

### 6.1 Edge (Coach strategy)

`supabase/functions/agents/coach/strategy.ts` — in `persist`'s
`shouldDirectUpdate` branch:

```ts
const { metadata: mergedMetadata, mergeLog } = mergeCoachProposedIntoTaskMetadata({
  base: extras.taskMetadataForContext ?? {},
  proposed: hasProposedMeta ? parsed.proposed_workout_metadata : null,
});

log('info', 'coach merge workout metadata', {
  request_id: ctx.requestId,
  slug: COACH_SLUG,
  target: mergeLog.target,
  touched: mergeLog.touched,
  exercise_count: mergeLog.exerciseCount,
  drops: mergeLog.drops,
});

const upd = await agentUpdateTaskAndReply(supabase, {
  // …existing args…
  p_new_metadata: hasProposedMeta ? mergedMetadata : null,
});
```

`extras.taskMetadataForContext` is already loaded for prompt building in
`buildSystemPrompt` (it is how Coach sees `CURRENT TASK CONTEXT`). No new
DB read.

### 6.2 RPC wrapper

`supabase/functions/_shared/dispatch/rpc.ts` — **no change.** Continues to
forward `p_new_metadata` verbatim.

### 6.3 SQL migration

`supabase/migrations/20260825120000_agent_update_task_and_reply_metadata.sql`
— **no change.** RPC still shallow-merges `p_new_metadata` into
`tasks.metadata`. Because the merge module already returns the **full
reconciled object** (including unchanged sibling keys), the shallow merge in
SQL is a no-op for keys the module did not touch.

### 6.4 React — viewer

`src/components/modals/task-modal/hooks/useTaskWorkoutAi.ts` — **no change.**
`viewerWorkoutSet` continues to read `ai_workout_factory.workout_set`. The
merge module guarantees that path is the one Coach updates.

### 6.5 React — editor / save

`src/lib/item-metadata.ts` — **no change** to `metadataFieldsFromParsed`
(continues to read `metadata.exercises`). Optionally extend
`buildTaskMetadataPayload` to preserve `metadata.ai_workout_factory` on
Save (today it strips `MANAGED_METADATA_KEYS` only — verify `ai_workout_factory`
is **not** in that list before shipping).

`src/components/modals/TaskModal.tsx` — **no change.** `applyRow` already
rehydrates from `metadata` on realtime updates.

### 6.6 Coach contract

`src/lib/agents/coach/schema.ts` (+ Deno mirror) — extend
`proposed_workout_metadata.properties` with `blocks` (object array, same
shape `parseProposedWorkoutMetadata` already accepts) so Vertex emits it
**reliably** rather than as undocumented passthrough.

`src/lib/agents/coach/prompts.ts` (+ Deno mirror) — append one paragraph
under `LIVE CO-PILOT MODE`:

> _Polymorphic workout blocks._ When the user's open card already has a
> structured workout, prefer emitting `proposed_workout_metadata.blocks` as
> a full revised list of named sections (e.g. `Warm-up`, `Strength`,
> `Finisher`, `Cool down`). The server maps section names to the rich
> workout layout. Do not emit duplicate top-level `exercises` when `blocks`
> is present.

`src/lib/agents/coach/parse.ts` (+ Deno mirror) — **no change**; blocks
passthrough already exists.

`src/lib/agents/coach/server-guards.ts` — **no change**; merge happens
after guards.

---

## 7. Data contract — write surface summary

After merge, `tasks.metadata` is guaranteed to satisfy:

- `ai_workout_factory.workout_set.workouts[0]` exists **iff** it existed in
  `base`. Merge never invents a rich set.
- `exercises` is a `WorkoutExercise[]` whose order matches a depth-first
  flatten of `workout_set.workouts[0]` when rich, or Coach order when flat.
- `workout_type` / `duration_min` are the most recent non-null values from
  Coach (or unchanged from `base`).
- Every other top-level key in `base` is preserved unchanged.

Invariants for tests:

1. `mergeCoachProposedIntoTaskMetadata({ base, proposed: null }).metadata === base` (referentially equal **or** structurally identical).
2. Idempotent: `merge(merge(base, p).metadata, p).metadata` structurally equals `merge(base, p).metadata`.
3. Section preservation: any `exerciseBlocks` / `warmupBlocks` / `finisherBlocks` / `cooldownBlocks` entries in `base.ai_workout_factory.workout_set.workouts[0]` that Coach did not name in `proposed.blocks` survive verbatim.
4. Flat sync: `exercises.length === getExercisesFromWorkout(session).length` when rich.

---

## 8. Test plan

### 8.1 Unit tests — Vitest

`src/lib/agents/_shared/workout-metadata/merge-coach-proposed-into-task-metadata.test.ts`:

| #   | Scenario                                                                  | Assertion                                                                                       |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | rich base + Coach `blocks: [{ name: 'Finisher', exercises: [Thruster] }]` | `session.exerciseBlocks` gains a `Finisher` block; MAIN/COOL DOWN untouched; `exercises` grows. |
| 2   | rich base + Coach flat `exercises` only                                   | Appended to `Main` block; rich sections preserved.                                              |
| 3   | rich base + Coach `blocks: [{ name: 'Cool down', instructions: [...] }]`  | Appended to `session.cooldownBlocks` as `WarmupBlock`.                                          |
| 4   | flat base (`exercises` only) + Coach `blocks`                             | Flattened into `next.exercises`, no `ai_workout_factory` created.                               |
| 5   | empty proposed (`{}` or `null`)                                           | `metadata === base`, `touched === []`.                                                          |
| 6   | base has `card_cover_path`, `linked_program_task_id`                      | Both preserved post-merge.                                                                      |
| 7   | base.ai_workout_factory has `chain_metadata`                              | Siblings preserved; only `workout_set` mutated.                                                 |
| 8   | proposed exercise with `reps: 10` (number) and `reps: '8-10'` (string)    | Both round-trip through factory adapter.                                                        |
| 9   | proposed block named `'Mobility flow'`                                    | Routed to `cooldownBlocks` (mobility synonym) per regex table.                                  |
| 10  | Idempotency: apply same `proposed` twice                                  | Second merge equals first (no duplicate blocks).                                                |

### 8.2 Deno integration test

`supabase/functions/agent-dispatch/index.integration.test.ts` — extend Step 3
scenario:

- Fixture `taskMetadataForContext`: rich `workout_set` with MAIN +
  COOL DOWN (mirrors the production transcript card).
- Coach response: `proposed_workout_metadata.blocks` containing the existing
  MAIN sections + a new `Finisher` exercise block + the COOL DOWN.
- Assertion: `agent_update_task_and_reply` is called with
  `p_new_metadata.ai_workout_factory.workout_set.workouts[0].exerciseBlocks`
  containing **three** blocks (MAIN, FINISHER, plus the original — exact
  count depends on Coach's revised list), and
  `p_new_metadata.exercises` reflects the flatten.

### 8.3 Manual smoke

1. Open a workout task with a generated `ai_workout_factory.workout_set`.
2. Rail message: "add a kettlebell thruster finisher (3×10) after the
   sumo deadlift".
3. Within Vertex budget, the View pane must show **Finisher → Kettlebell
   Thruster** below MAIN and above Cool down — without manual refresh
   beyond the existing realtime path.

---

## 9. Open questions (resolve before implementation)

1. **Replace vs append semantics.** Default is **append**. Do we want a
   `proposed.merge_mode = 'replace'` opt-in for full rewrites in v1, or wait
   until users complain? Resolution: **wait**; document as reserved.
2. **Instruction-shaped finishers.** Coach can emit `instructions[]` finishers
   (no sets/reps). v1 routes them correctly. Should the prompt actively
   encourage that for "mobility" / "stretching" blocks? Resolution: **yes**,
   add one sentence to prompts; covered in §6.6.
3. **Flat → rich upgrade.** When a card has no `ai_workout_factory` and
   Coach proposes complex `blocks`, do we upgrade the card to rich shape?
   Resolution: **no** in v1 (keeps blast radius small); revisit if users
   request it.
4. **Title overwrite policy.** Default leaves user title untouched. Confirm
   with product before flipping.
5. **`task_modal_intake_patch` interaction.** Out of scope — different RPC,
   different message-metadata field. No coupling needed.

---

## 10. Rollout plan (non-binding)

1. Land merge module + Vitest suite (no wiring) — green CI, no behavior change (**done**).
2. Wire `strategy.persist` to merge module behind Edge secret **`COACH_MERGE_WORKOUT_METADATA`**: set to **`1`** to enable; omit or leave unset for legacy raw `p_new_metadata`. Implemented in `readDispatcherEnv` → `buildDispatchContext` → Coach `persist`.
3. Add Deno integration test asserting rich-card behavior.
4. Flip flag on in staging; observe `coach merge workout metadata` logs for
   `target` distribution and `drops`.
5. Update Coach schema + prompts to declare `blocks` officially (§6.6).
6. Production flag-on; close out
   [`docs/refactor/coach-live-copilot/README.md`](../coach-live-copilot/README.md)
   Step 3 follow-up.
7. Delete the env flag once stable.

---

## 11. Files touched (cheat sheet)

| File                                                                                              | Change                                                                                          |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/lib/agents/_shared/workout-metadata/merge-coach-proposed-into-task-metadata.ts` _(new)_      | Canonical merge module.                                                                         |
| `supabase/functions/_shared/workout-metadata/merge-coach-proposed-into-task-metadata.ts` _(new)_  | Byte-for-byte Deno mirror.                                                                      |
| `src/lib/agents/_shared/workout-metadata/merge-coach-proposed-into-task-metadata.test.ts` _(new)_ | Vitest invariants + table cases.                                                                |
| `supabase/functions/_shared/env.ts`                                                               | `COACH_MERGE_WORKOUT_METADATA` on `DispatcherEnv`; strict `=== '1'`.                            |
| `supabase/functions/_shared/dispatch/types.ts` (+ Vitest mirror)                                  | `coachMergeWorkoutMetadata` on `DispatchContext`.                                               |
| `supabase/functions/agent-dispatch/build-context.ts`                                              | Plumb flag from input to `ctx`.                                                                 |
| `supabase/functions/agent-dispatch/handler.ts`                                                    | Pass `env.COACH_MERGE_WORKOUT_METADATA` into `buildDispatchContext`.                            |
| `supabase/functions/agents/coach/strategy.ts`                                                     | Call merge module before `agent_update_task_and_reply` direct branch.                           |
| `supabase/functions/agent-dispatch/index.integration.test.ts`                                     | Clear `COACH_MERGE_WORKOUT_METADATA` in harness; rich-card merge scenario (step 10.3) optional. |
| `src/lib/agents/coach/schema.ts` (+ Deno mirror)                                                  | Declare `proposed_workout_metadata.blocks`.                                                     |
| `src/lib/agents/coach/prompts.ts` (+ Deno mirror)                                                 | One paragraph on polymorphic blocks (LIVE CO-PILOT MODE).                                       |
| `supabase/functions/_shared/dispatch/rpc.ts`                                                      | **No change.**                                                                                  |
| `supabase/migrations/20260825120000_agent_update_task_and_reply_metadata.sql`                     | **No change.**                                                                                  |
| `src/components/modals/task-modal/hooks/useTaskWorkoutAi.ts`                                      | **No change.**                                                                                  |
| `src/components/fitness/workout-viewer-dialog.tsx`                                                | **No change.**                                                                                  |
| `src/components/modals/TaskModal.tsx`                                                             | **No change.**                                                                                  |
| `src/lib/item-metadata.ts`                                                                        | Verify `ai_workout_factory` not in `MANAGED_METADATA_KEYS` (probably no change).                |

One merge module. One env flag. Zero new RPCs, zero new tables, zero new
columns. Polymorphism evolves in **one file**; every other layer reads the
canonical shape it already knows.
