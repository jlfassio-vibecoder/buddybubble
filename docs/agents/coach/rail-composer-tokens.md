# Coach rail composer tokens (`#` exercises and block blueprints)

> **Status:** draft (May 2026).  
> **Scope:** Task-scoped rails — primarily [`StandardTaskChatRail`](../../../src/components/chat/StandardTaskChatRail.tsx) in TaskModal — aligned with main [`ChatArea`](../../../src/components/chat/ChatArea.tsx) and [`WorkoutCoachRail`](../../../src/components/chat/WorkoutCoachRail.tsx).  
> **Guided by:** [PCC manifesto](../../architecture/pcc-manifesto.md) (Rail = pipe; Canvas = parametric state) and [parametric workout blocks](../../refactor/parametric-workout-blocks/README.md).

---

## 1. Problem

Users need **deterministic, typed intent** in the rail so Coach does not guess structure:

1. **`#` exercise tags** — pick a movement from the open workout + exercise dictionary (already shipped in bubble chat and WorkoutCoachRail).
2. **Block blueprint tags (new)** — declare _how_ a section should be prescribed (AMRAP finisher, superset pair, straight sets, etc.) so the server can validate and merge a single append-only block instead of rewriting the workout in prose.

**Plan 1 (shipped):** Workout TaskModal enables `#` on `StandardTaskChatRail` and sends `metadata.exercise_mentions` → Coach `TAGGED_EXERCISE_REFS`.

**Plan 3 (shipped):** Same rail enables `:` block blueprint picker and sends `metadata.block_blueprint_mentions` → Coach `BLOCK_BLUEPRINT_REFS`.

**Three-lane router (shipped):** When `block_blueprint_mentions` is present on the rail, `agent-dispatch` **preflight** routes before the full `COACH_RESPONSE_SCHEMA`:

| Lane       | When                                                              | Server behavior                                                                                 | LLM                                                                              |
| ---------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Lane 1** | `:` + `#` tags meet block cardinality (e.g. Tabata + ≥1 exercise) | Deterministic `blocks[]` + `mergeCoachProposedIntoTaskMetadata` + `agent_update_task_and_reply` | None (template reply); optional `COACH_BLOCK_APPEND_MICRO_REPLY=1` polishes copy |
| **Lane 2** | `:` present but exercises missing / under cardinality             | Fixed shells + exercise-fill micro-schema only                                                  | One small JSON call (`blocks[].exercises[]` only)                                |
| **Lane 3** | No `:` metadata, or gate fails (no rich workout, merge off)       | Full Coach co-pilot path                                                                        | Full schema                                                                      |

**Required Edge secret:** `COACH_MERGE_WORKOUT_METADATA=1` for Lane 1/2 card writes.

Implementation: [`block-blueprint-lane-preflight.ts`](../../../supabase/functions/agents/coach/block-blueprint-lane-preflight.ts), [`block-blueprint-router.ts`](../../../src/lib/agents/coach/block-blueprint-router.ts).

### Main Rail Diet (main bubble / `non_rail`)

Main workspace chat (`ChatArea`, no `surface: standard_task_chat_rail`) must stay inside the **~28s** effective Vertex budget. The full **BLOCK BLUEPRINT LIBRARY** taxonomy is **not** injected unless the trigger is on the task rail or carries `block_blueprint_mentions`.

| Signal                                                                            | Block library in system prompt | `thinkingBudget`              |
| --------------------------------------------------------------------------------- | ------------------------------ | ----------------------------- |
| Task rail (`standard_task_chat_rail`)                                             | Included                       | 2048 (default)                |
| Any surface with `block_blueprint_mentions`                                       | Included                       | 2048 unless intake-only below |
| Main bubble, no workout context (`coach workout context source` → `source: none`) | **Excluded**                   | **512**                       |
| Main bubble with live/workout JSON in context                                     | Excluded                       | 2048                          |

Structured log: `coach main rail diet` with `{ surface, block_library_included, thinking_budget }`.  
Implementation: [`buildBaseCoachPrompt`](../../../src/lib/agents/coach/prompts.ts) (slim base) + conditional inject in [`strategy.ts`](../../../supabase/functions/agents/coach/strategy.ts) via [`shouldInjectBlockBlueprintLibrary`](../../../src/lib/agents/coach/block-blueprint-library.ts) and [`resolveCoachThinkingBudget`](../../../src/lib/agents/coach/config.ts).

### Mention matching and Tabata hydration

**EOS-safe tokens:** Client send and server Lane 1 routing use [`composerMentionTokenInMessage`](../../../src/lib/agents/coach/exercise-mentions.ts) instead of naive `messageText.includes(token)`. A `#` tag at end-of-message without the picker’s trailing space still matches (e.g. `… #Jump Squats`). Same helper filters `:` block blueprint mentions on send.

**Tabata exercise rows:** Block subtitle comes from `format_params` on the block (`Tabata · 8 Rounds (20/10s)`). Merge also hydrates each exercise in a Tabata block via [`hydrateTabataExercisesFromFormatParams`](../../../src/lib/agents/_shared/workout-metadata/merge-coach-proposed-into-task-metadata.ts) (`rounds`, `workSeconds`, `restSeconds`; clears strength-style `sets`/`reps`). Applies to Lane 1, Lane 2, and Lane 3 so the viewer shows interval meta (e.g. `20s work · Rest 10s · 8 rounds`) on every movement card.

---

## 2. Current composer token inventory

| Token   | UI trigger                       | Composer flag                  | Metadata / effect                                                                           | Surfaces today                                                |
| ------- | -------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **`@`** | `@Coach`, `@Buddy`, team members | `enableAtMentions`             | Agent routing via mention handle; no extra metadata                                         | ChatArea, both rails                                          |
| **`/`** | `/Task title`                    | `enableSlashTaskLinks`         | Inserts link text; attaches task on send (bubble chat)                                      | ChatArea (not TaskModal rail — `slashConfig={{ tasks: [] }}`) |
| **`#`** | `#Bulgarian Split Squat`         | `enableExerciseHashMentions`   | `metadata.exercise_mentions[]` → Coach `TAGGED_EXERCISE_REFS`                               | ChatArea, WorkoutCoachRail, workout TaskModal rail            |
| **`:`** | `:finisher/amrap`                | `enableBlockBlueprintMentions` | `metadata.block_blueprint_mentions[]` → Lane 1/2 preflight or Lane 3 `BLOCK_BLUEPRINT_REFS` | Workout TaskModal rail                                        |

**Token resolution** lives in [`src/lib/chat-composer-tokens.ts`](../../../src/lib/chat-composer-tokens.ts): rightmost active `@`, `/`, or `#` wins (`resolveActiveComposerTrigger`).

**Exercise mention payload** ([`src/lib/agents/coach/exercise-mentions.ts`](../../../src/lib/agents/coach/exercise-mentions.ts)):

```ts
type ExerciseMentionClientPayload = {
  token: string; // e.g. "#Kettlebell Goblet Squat "
  name: string;
  source: 'workout' | 'dictionary';
  dictionary_id?: string;
  dictionary_slug?: string;
  workout_exercise_index?: number; // 0-based index on open canvas
};
```

---

## 3. Currently defined exercise _blocks_ (server contract)

Distinguish **section role** (where on the canvas) from **block format** (prescription blueprint).

### 3.1 Section roles — free-text `blocks[].name`

Merged by [`classifyBlockRole`](../../../src/lib/agents/_shared/workout-metadata/merge-coach-proposed-into-task-metadata.ts):

| Name pattern (examples)               | Role       | Persisted target                                            |
| ------------------------------------- | ---------- | ----------------------------------------------------------- |
| Warm-up, Warmup                       | `warmup`   | `workout_set.workouts[0].warmupBlocks` (instruction-shaped) |
| **Finisher**, Burnout, AMRAP finisher | `finisher` | `finisherBlocks` _or_ `exerciseBlocks` (see shape)          |
| Cool down, Mobility, Stretch          | `cooldown` | `cooldownBlocks`                                            |
| Main, Strength A, (default)           | `main`     | `exerciseBlocks`                                            |

Exercise-shaped blocks (sets/reps or parametric format) named **Finisher** land in **`exerciseBlocks`** with `name: "Finisher"` — this is what the viewer renders under the Finisher heading.

### 3.2 Block formats — closed-world `blocks[].block_format`

From [`block-blueprint-library.ts`](../../../src/lib/agents/coach/block-blueprint-library.ts) / Coach Vertex schema:

| `block_format`  | Typical use                    | Required `format_params`                                     |
| --------------- | ------------------------------ | ------------------------------------------------------------ |
| `straight_sets` | Default strength / hypertrophy | —                                                            |
| `superset`      | Exactly **2** exercises        | `rounds`                                                     |
| `circuit`       | 3+ exercises, round-robin      | `rounds`                                                     |
| `amrap`         | Time-capped rounds             | `time_cap_minutes`                                           |
| `emom`          | Every minute on the minute     | `interval_seconds` + (`total_minutes` **or** `total_rounds`) |
| `tabata`        | Work/rest intervals            | `rounds` (optional `work_seconds` / `rest_seconds`)          |

**Reserved v2 (not in schema yet):** `chipper`, `ladder` (listed in parametric-blocks doc; do not expose in composer until parser/merge support lands).

**Instruction-only blocks** (`instructions[]`, no `exercises[]`) may omit `block_format` — used for warm-up / mobility copy, not finishers with sets.

### 3.3 Additive merge (finisher-only turns)

Server merge **appends** new `blocks[]` entries; untouched sections on the canvas survive ([workout-metadata-merge §7](../../refactor/workout-metadata-merge/README.md)). The model _should_ send only the new block for “add a finisher”; the prompt currently over-emphasizes “full revised workout” — see [coach live co-pilot](../../refactor/coach-live-copilot/README.md) and follow-up prompt work.

**Example target JSON** for “5-minute bodyweight AMRAP finisher” (append-only):

```json
{
  "update_existing_task": true,
  "proposed_workout_metadata": {
    "blocks": [
      {
        "name": "Finisher",
        "block_format": "amrap",
        "format_params": { "time_cap_minutes": 5 },
        "exercises": [{ "name": "Mountain Climbers" }, { "name": "Push-ups" }]
      }
    ]
  }
}
```

---

## 4. Implementation plan — `#` on `StandardTaskChatRail`

**Reference implementation:** [`WorkoutCoachRail.tsx`](../../../src/components/chat/WorkoutCoachRail.tsx) (lines ~229–257 hash list, ~319–324 pending ref, ~439–457 picker callback, ~496–521 send metadata).

### Step 1 — Feature flag default (workout tasks only)

- Do **not** blindly set `enableExerciseHashMentions: true` in `RAIL_FEATURES_DEFAULT` for all item types.
- Prefer: host passes `composerOverrides.features.enableExerciseHashMentions` when `item_type` is `workout` or `workout_log`, **or** add rail prop `enableExerciseHashMentions?: boolean` defaulting from host.
- Keep `@` enabled; keep `/` disabled on TaskModal rail (task is already scoped).

### Step 2 — Seed `#` candidates from open canvas + dictionary

1. Import `useExerciseDictionaryAutocomplete` (same as WorkoutCoachRail / ChatArea).
2. Add optional rail prop, e.g. `workoutExerciseNames?: string[]`, supplied by TaskModal from `workoutExercises` / flattened `viewerWorkoutSet`.
3. Build `hashExercises: RichMessageComposerExercise[]`:
   - Workout rows first (`id: workout:${normalizedName}`, dedupe by lowercase name).
   - Dictionary rows second (skip duplicates).
4. Pass `hashConfig={{ exercises, isLoading, errorText }}` to `RichMessageComposer`.

### Step 3 — Pending mentions + picker callback

1. `exerciseMentionsPendingRef = useRef<ExerciseMentionClientPayload[]>([])`.
2. Clear ref on `taskId` change (WorkoutCoachRail pattern).
3. Wire `onExerciseHashInserted` on `RichMessageComposer`:
   - Insert token `#${name} ` in composer (composer already does this).
   - Push `{ token, name, source, dictionary_id?, workout_exercise_index? }` to pending ref.
   - Resolve `workout_exercise_index` from current canvas exercise order (copy `finalizeExerciseMentionsForSend` helper — consider extracting to `src/lib/agents/coach/exercise-mentions-client.ts` shared by both rails).

### Step 4 — Attach metadata on send

In `StandardTaskChatRailChrome` `handleSubmit`:

1. After building `mergedMeta`, if pending mentions exist and outgoing text still contains tokens:
   - Run `finalizeExerciseMentionsForSend(pending, text, workoutExerciseNames)`.
   - Set `mergedMeta.exercise_mentions = …` (JSON array).
2. Clear pending ref after successful `sendMessage`.
3. Only attach when Coach is the resolved/default agent (same gating as WorkoutCoachRail `activeAgent === 'coach'` — on Standard rail, `defaultAgentSlug === 'coach'` or `resolveTargetAgent` → coach).

**No Edge Function changes required** — [`strategy.ts`](../../../supabase/functions/agents/coach/strategy.ts) already parses mentions and injects `TAGGED_EXERCISE_REFS`.

### Step 5 — UX copy

- `composerOverrides.footerHint` or rail default hint:  
  `<b>#</b> to tag an exercise` (match ChatArea).
- Optional: show hint only when `enableExerciseHashMentions` is true.

### Step 6 — TaskModal wiring

In [`TaskModal.tsx`](../../../src/components/modals/TaskModal.tsx):

- Pass `workoutExerciseNames={workoutExercises.map(e => e.name)}` (and/or rich flatten from `viewerWorkoutSet`).
- Pass `composerOverrides={{ features: { enableExerciseHashMentions: isWorkoutItemType } }}`.

### Step 7 — Tests

| File                                                       | Case                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------- |
| `StandardTaskChatRail.test.tsx`                            | `#` popover opens when feature enabled; disabled by default |
| New unit test for shared `finalizeExerciseMentionsForSend` | Drops mentions removed from text; refreshes index           |
| Optional integration                                       | Send mock → metadata includes `exercise_mentions`           |

### Step 8 — Docs / mirror

- Update [`docs/rails/workout-coach-rail/README.md`](../../rails/workout-coach-rail/README.md) cross-link (parity note).
- No Deno mirror for UI-only work.

---

## 5. Block blueprint token — symbol recommendation

We need a **fourth trigger** that means: “insert a validated block prescription template,” distinct from:

- `@` — _who_ (persona / user)
- `/` — _which card_ (task link)
- `#` — _which movement_ (exercise)

### 5.1 Requirements

1. **Single-token starter** at word boundary (like `@` and `/`), or bounded multi-token search (like `#`).
2. **Closed-world menu** aligned with `block_format` enum (+ section names Finisher / Warm-up / Main / Cool down).
3. **Inserts canonical text + structured metadata** on send (mirror `exercise_mentions`).
4. **Hardcodes shape** so Coach JSON is constrained (section + format + default params), not free prose.
5. **Avoid URL/email collisions** (`:`, `@` in emails, etc.).

### 5.2 Candidates

| Symbol  | Example                           | Pros                                                                  | Cons                                                                                                           |
| ------- | --------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **`:`** | `:amrap` → `:amrap Finisher 5min` | Reads as “type/format”; unused in composer; familiar `:command` idiom | Rare clash with time `10:30` only when attached to digits without space — use “after whitespace” rule like `#` |
| **`!`** | `!block amrap`                    | Strong “command” semantics                                            | Users may read as emphasis; less fitness-native                                                                |
| **`*`** | `*amrap`                          | Visible                                                               | Markdown/bullet connotations                                                                                   |
| **`&`** | `&superset`                       | Suggests pairing                                                      | Poor fit for AMRAP/EMOM; confusing vs “and”                                                                    |
| **`%`** | `%amrap`                          | Unused                                                                | Non-obvious meaning                                                                                            |

### 5.3 Recommendation: **`:` (colon) block trigger**

**Primary syntax (v1):**

```text
:finisher/amrap          → section role + block_format
:amrap                   → block_format only (default section name "Finisher" when user says finisher in same message)
:superset                → opens 2-exercise template
:straight_sets           → default strength block
```

**Inserted composer text (illustrative):**

```text
:finisher/amrap{5} #Mountain Climbers #Push-ups
```

**Parallel metadata** (proposed — not implemented):

```ts
type BlockBlueprintMentionClientPayload = {
  token: string; // literal inserted substring
  section_role: 'warmup' | 'main' | 'finisher' | 'cooldown';
  section_name: string; // display name, e.g. "Finisher"
  block_format: BlockFormat;
  format_params: Record<string, number | string>; // pre-filled from picker
  exercise_mentions?: ExerciseMentionClientPayload[]; // optional # picks in same message
};
```

Persist on send as `metadata.block_blueprint_mentions[]` (name TBD). Coach prompt block `--- BLOCK_BLUEPRINT_REFS ---` would map tokens → required JSON shape for `proposed_workout_metadata.blocks[]` (append-only).

**Why not reuse `#`?** `#` resolves to **dictionary identity** and `exerciseIndex` for `execution_patch`. Block format is a **different dimension** (time domain, rounds, pairing rules). Mixing them in one popover confuses users and blurs server validation.

**Why not `/`?** Already reserved for **task/card links** in bubble chat; overloading would break mental model.

### 5.4 Picker UX (future)

1. Extend [`resolveActiveComposerTrigger`](../../../src/lib/chat-composer-tokens.ts) with `kind: 'block'` + `parseBlockTriggerQuery` (single-token enum filter, like `@`).
2. Extend [`RichMessageComposer`](../../../src/components/chat/RichMessageComposer.tsx):
   - `enableBlockBlueprintMentions`
   - `blockConfig: { formats: BlockFormat[]; sectionPresets: … }`
   - Popover grouped: **Formats** (amrap, emom, …) and **Sections** (Finisher, Warm-up, …).
3. On pick, insert template snippet + stash pending blueprint payload.
4. Coach server: new parser `parseBlockBlueprintMentionsFromMetadata` + prompt block instructing **append single block** when blueprint refs present (override “full workout” rail copy for additive edits).

### 5.5 `ladder` / HIIT

- **HIIT** is not a separate enum value — map to **`emom`**, **`tabata`**, or **`amrap`** in copy/examples.
- **`ladder`** stays **v2** until added to `BLOCK_FORMATS` in `block-blueprint-library.ts` and Coach schema enum.

---

## 6. Acceptance criteria (summary)

### `#` on StandardTaskChatRail

- [x] Workout TaskModal rail shows `#` popover with canvas exercises + dictionary.
- [x] Send attaches `metadata.exercise_mentions` when tokens present.
- [x] Coach dispatch prompt includes `TAGGED_EXERCISE_REFS` for those sends.
- [x] Non-workout tasks unchanged (no `#` UI).

### `:` block blueprint on StandardTaskChatRail

- [x] Colon trigger in `chat-composer-tokens.ts` + `RichMessageComposer` popover.
- [x] Closed-world picker presets match `block_format` enum.
- [x] Send attaches `metadata.block_blueprint_mentions`; Coach `BLOCK_BLUEPRINT_REFS` in system prompt.
- [x] Vitest for token parser + rail send; integration test for prompt injection.

---

## 7. Related files

| Area                     | Path                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------ |
| TaskModal rail           | `src/components/chat/StandardTaskChatRail.tsx`                                       |
| Reference `#` rail       | `src/components/chat/WorkoutCoachRail.tsx`                                           |
| Bubble chat              | `src/components/chat/ChatArea.tsx`                                                   |
| Composer                 | `src/components/chat/RichMessageComposer.tsx`                                        |
| Token parsing            | `src/lib/chat-composer-tokens.ts`                                                    |
| Mention types            | `src/lib/agents/coach/exercise-mentions.ts` (+ Deno mirror)                          |
| Block enums              | `src/lib/agents/coach/block-blueprint-library.ts`                                    |
| Merge / finisher routing | `src/lib/agents/_shared/workout-metadata/merge-coach-proposed-into-task-metadata.ts` |
| Parametric blocks epic   | `docs/refactor/parametric-workout-blocks/README.md`                                  |
| Merge epic               | `docs/refactor/workout-metadata-merge/README.md`                                     |
