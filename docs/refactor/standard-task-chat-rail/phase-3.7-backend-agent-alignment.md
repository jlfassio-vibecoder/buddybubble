# Phase 3.7 — Backend Agent Alignment (Read context + Write guards, polymorphic-safe)

> **Bridge phase.** Inserted between Phase 3.6B (frontend remediation) and Phase 4
> (deprecate `TaskModalCommentsPanel`). Closes the architectural gap between the
> data-driven `StandardTaskChatRail` UI and the Coach LLM, which today is
> "blindfolded" (cannot see the modal's React state) and "gagged" (server guards
> null its structured writes during planning).
>
> **Surgical-edit rule.** No new agents, no new mention handles, no new
> `messages` columns, no new RPC overloads. We extend the existing
> `messages.metadata` channel, the existing `task_modal_intake_patch` channel,
> and the existing `applyCoachServerGuards`. Both `StandardTaskChatRail` and
> `TaskModal` remain polymorphic; **non-workout item types must not gain a
> fitness coupling**.
>
> **Feature flag.** All client-visible behavior rides the existing
> `NEXT_PUBLIC_STANDARD_TASK_CHAT_RAIL` flag (the rail is the only host today).
> The Edge Function changes are backward-compatible: if the trigger row does
> not carry the new metadata key, prompt assembly is identical to today.

---

## Why this phase exists

Phase 3.5–3.6 made the rail and the wizard data-driven and gold-standard on the
client. End-to-end testing showed two distinct failure modes that combine to
make the Coach look "broken":

1. **The Read Gap ("blindfold").** The Coach system prompt receives the task
   row's `title` / `description` and (when present) `workoutContext` JSON. It
   does **not** receive the **live** Task Modal wizard state
   (`readiness`, `sleep_quality`, `wizard_step`, `duration_minutes`,
   `target_intensity`, `soreness`, `equipment`). That state lives only in React
   (`useWorkoutIntakeWizardState`) until the user saves. Coach answers based on
   chat text alone and therefore has no anchor for "what does the user already
   see on the card?".

2. **The Write Gap ("gag").** Even when the Coach emits a valid
   `task_modal_intake_patch`, `applyCoachServerGuards` Guard 3 nulls it whenever
   `currentWorkoutContextJson` is non-null:

   ```
   supabase/functions/agents/coach/server-guards.ts:107-118
   ```

   `resolveCurrentWorkoutContextJsonFromThread` (in `coach/context.ts`) treats
   the task row's metadata as a fallback source of workout JSON, so a `workout`
   card that has been planned (but not yet started in the player) lights up
   Guard 3 and silently strips the patch. Net effect: the wizard never moves on
   its own; the user thinks the LLM is dumb.

3. **Schema vs parser drift on `duration_minutes`.** `COACH_RESPONSE_SCHEMA`
   declares `duration_minutes` as `STRING`, but the canonical parser
   (`parseDurationWithDrops` in
   [`src/lib/agents/coach/task-modal-intake-patch.ts`](../../../src/lib/agents/coach/task-modal-intake-patch.ts))
   accepts both number (`15`/`30`/`45`/`60`) and string forms. When the model
   honors the schema literally and emits `"30"`, the parser still accepts it,
   but the prompt's worked examples show bare numbers — the inconsistency is
   silent and confusing in logs.

4. **Polymorphism is currently implicit.** `TaskModal` is polymorphic
   (`workout`, `workout_log`, `event`, `experience`, `idea`, `memory`, `task`,
   `program`, `class`). Any new "context injection" hook must default to **no
   intake fitness data** for non-workout item types, or it will pollute Buddy /
   Organizer threads on every send.

---

## Locked decisions (do not revisit without amending this doc)

1. **Single new client→server channel: `messages.metadata.task_modal_live_state`.**
   The composer attaches a small, **versioned**, **per-item-type** JSON snapshot
   alongside the message insert. No new column. No new RPC. The Edge Function
   reads it only from the **trigger** row's metadata; history rows are ignored
   for live-state injection (they describe earlier snapshots, not "now"). The
   key is namespaced to avoid colliding with any existing metadata used by
   `useMessageThread` / agent routing. Decision-locked.

2. **Polymorphism by host callback, not by rail logic.** `StandardTaskChatRail`
   does **not** import any workout / intake types. It exposes a single
   host-supplied composer hook (working name
   `buildOutgoingMessageMetadata?: (args: { content: string; files: File[] }) =>
Record<string, Json> | null`) which is merged into the `metadata` payload it
   already sends to `useMessageThread.sendMessage`. The rail stays polymorphic;
   any fitness specificity lives in `TaskModal`. Decision-locked.

3. **Item-type gate is owned by `TaskModal`.** Only when `itemType` is
   `'workout'` or `'workout_log'` does `TaskModal` populate
   `task_modal_live_state`. All other item types pass `null` / return
   `undefined` from the callback. The `task_modal_live_state` block is **never**
   present on `event`, `experience`, `idea`, `memory`, `program`, `class`, or
   plain `task` messages. Decision-locked.

4. **Guard 3 split, not deletion.** `applyCoachServerGuards` Guard 3 stays
   intact for `execution_patch` (live player) and for card writes, but the
   `task_modal_intake_patch` clamp is moved behind a **stricter "active
   workout"** condition than "any workout JSON in the thread/task." Concretely:
   only clamp the intake patch when the **trigger row** carries an
   `active_workout_session` signal (existing workout-player sentinel metadata
   keys), not when the task row merely contains structured workout metadata.
   Decision-locked.

5. **Schema/parser alignment on `duration_minutes`.** Change the Gemini schema
   from `type: 'STRING'` to a permissive union represented as `STRING` **with
   the prompt examples updated to always quote** (`"30"`, `"45"`, …,
   `"Optimized for Goals"`). The parser already accepts both; we lock the
   wire format to **string** so the schema is the truth and logs are
   uniform. No parser changes. Decision-locked.

6. **No mirror drift.** Both `src/lib/agents/coach/*` (Vitest-side canonical)
   and `supabase/functions/agents/coach/*` (Deno-side mirrors) must change in
   the same PR; `pnpm check:agent-mirror` must pass. Decision-locked.

7. **Telemetry-only enforcement on self-attestation.** We do **not** raise
   `assertCoachReplySelfAttestation` to error for intake-only claims (the rail
   still inserts a reply; users would otherwise see hard failures). Instead we
   emit a `warn` log `coach reply_content claims intake update without patch`
   so we can measure prompt regressions over time. Decision-locked.

---

## Architecture diagram

```mermaid
flowchart LR
  Wizard[useWorkoutIntakeWizardState]
  TM[TaskModal<br/>(polymorphic host)]
  Rail[StandardTaskChatRail]
  Hook[useMessageThread.sendMessage]
  DB[(messages.metadata)]
  EF[agent-dispatch + CoachStrategy.buildSystemPrompt]
  LLM[Vertex Gemini<br/>responseSchema]
  Parse[parseCoachJson]
  Guards[applyCoachServerGuards<br/>(narrowed Guard 3)]
  RPC[(agent_create_card_and_reply /<br/>agent_insert_coach_workout_draft_reply)]
  Sweep[useAgentEffectSweep]
  Apply[applyTaskModalIntakePatchFromMessage]

  Wizard -- buildWizardPayload() --> TM
  TM -- buildOutgoingMessageMetadata --> Rail
  Rail -- metadata.task_modal_live_state (only when itemType in workout/workout_log) --> Hook
  Hook --> DB
  DB -- DB webhook trigger row --> EF
  EF -- TASK MODAL LIVE STATE block --> LLM
  LLM -- task_modal_intake_patch (STRING duration) --> Parse
  Parse --> Guards
  Guards -- patch preserved unless active_workout --> RPC
  RPC -- messages.metadata.task_modal_intake_patch --> DB
  DB --> Sweep --> Apply --> Wizard
```

The closed loop only activates for workout / workout_log; every other item type
hits the rail with `metadata.task_modal_live_state` absent and the Coach prompt
behaves exactly as it does today.

---

## Change inventory (by file)

### 1. UI — rail callback (polymorphism-safe)

**File:** [`src/components/chat/StandardTaskChatRail.tsx`](../../../src/components/chat/StandardTaskChatRail.tsx)

- Add an optional prop:

  ```ts
  /**
   * Polymorphic host hook. Called once per send before insert; the returned object
   * is shallow-merged into `messages.metadata`. The rail itself adds no fitness/
   * workout keys — hosts decide what (if anything) to attach.
   *
   * Return `null` / `undefined` to attach nothing. Reserved keys the rail already
   * writes (e.g. `default_agent_slug`) take precedence on key collision.
   */
  buildOutgoingMessageMetadata?: (args: {
    content: string;
    files: File[];
  }) => Record<string, Json> | null | undefined;
  ```

- In `handleSubmit`, after computing the existing
  `metadata = slug ? { default_agent_slug: slug } : undefined`, call
  `buildOutgoingMessageMetadata?.({ text, files })` and **shallow-merge** the
  return value under the rail-owned keys. Existing keys (`default_agent_slug`)
  must win on collision.
- **No imports** from `@/lib/agents/coach/*` or `@/components/modals/task-modal/*`
  in the rail — Phase 0 principle #4 (no domain-specific data on rail props).

**Tests** (new): unit assert that

- when `buildOutgoingMessageMetadata` returns `null`, `sendMessage` is called
  with the same metadata as today;
- when it returns `{ task_modal_live_state: {...} }`, the metadata reaches
  `sendMessage` exactly once and `default_agent_slug` is still present.

### 2. UI — `TaskModal` wires the polymorphic callback

**File:** [`src/components/modals/TaskModal.tsx`](../../../src/components/modals/TaskModal.tsx)

- Reuse the existing wizard state (`workoutIntake` from
  `useWorkoutIntakeWizardState`) and `itemType`.
- Build a stable `buildOutgoingMessageMetadata` callback that returns
  **`null`** unless `itemType === 'workout' || itemType === 'workout_log'`. For
  workout-ish types, return:

  ```ts
  {
    task_modal_live_state: {
      v: 1,
      item_type: itemType,
      wizard_step: workoutIntake.step,
      readiness: workoutIntake.readiness,
      sleep_quality: workoutIntake.sleepQuality,
      duration_minutes: workoutIntake.durationMinutes, // already string|number, leave as-is
      target_intensity: workoutIntake.targetIntensity,
      soreness: workoutIntake.sorenessArray,
      equipment: workoutIntake.equipmentArray,
    }
  }
  ```

  Bytes are bounded (≤ ~512 bytes); no PII; nothing the user did not type.

- Pass the callback to **all three** `StandardTaskChatRail` mount points
  (single-pane, split-pane, narrow). Wrapped in `useCallback` keyed on the
  wizard values + `itemType` to avoid unnecessary rail re-renders.
- **Do not** wire this for `class`, `event`, `experience`, `idea`, `memory`,
  `program`, `task`. The callback returns `null` and the rail attaches no
  intake metadata.

**Tests** (new):

- `TaskModalChatRailMount.branches.test.tsx` extension: render with each
  `ItemType`, simulate `sendMessage`, assert `task_modal_live_state` is
  present **only** for `workout` and `workout_log`.
- `TaskModalIntakePatchDedup.test.tsx` extension: typing in the composer with
  `itemType='workout'` and changing a slider updates the snapshot read by the
  next send (callback is fresh, not stale-closured).

### 3. Edge Function — read the new key into the system prompt

**File (canonical):** [`src/lib/agents/coach/prompts.ts`](../../../src/lib/agents/coach/prompts.ts)
**File (mirror):** [`supabase/functions/agents/coach/prompts.ts`](../../../supabase/functions/agents/coach/prompts.ts)

- Add a new pure builder
  `buildTaskModalLiveStateBlock(snapshot: TaskModalLiveStateV1): string` with
  a stable header:

  ```text
  --- TASK MODAL LIVE STATE (v1) ---
  This is what the user currently sees on the Task Modal intake wizard (NOT yet
  saved to the database). Treat it as ground truth for "current" values. If the
  user is about to change one of these, mirror the change in
  task_modal_intake_patch.
  wizard_step: <n>
  readiness: <1–10>
  sleep_quality: <1–10>
  duration_minutes: "<value>"
  target_intensity: "<value>"
  soreness: [<csv>]
  equipment: [<csv>]
  ```

- Add a typed reader `readTaskModalLiveStateFromMessageMetadata(meta: unknown):
TaskModalLiveStateV1 | null` that:
  - returns `null` unless `meta?.task_modal_live_state?.v === 1`;
  - validates each field with the **same constants** already imported from
    [`./task-modal-intake-patch`](../../../src/lib/agents/coach/task-modal-intake-patch.ts)
    (`WORKOUT_INTAKE_DURATION_CHOICES`, etc.);
  - silently drops invalid fields (no throw); logs bounded telemetry from the
    strategy when drops occur (mirrors the existing intake-drop logger).

**File:** [`supabase/functions/agents/coach/strategy.ts`](../../../supabase/functions/agents/coach/strategy.ts)
(no mirror — Deno-only)

- In `buildSystemPrompt`, after the existing `buildTaskModalIntakeUiCoachBlock()`
  append:
  ```ts
  const liveState = readTaskModalLiveStateFromMessageMetadata(ctx.message.metadata);
  if (showTaskModalIntakeUi && liveState) {
    parts.push(buildTaskModalLiveStateBlock(liveState));
  }
  ```
  Order matters: **CONTRACT** block (`buildTaskModalIntakeUiCoachBlock`) first,
  then **STATE** block (`buildTaskModalLiveStateBlock`). Contract teaches what
  the keys mean; state shows current values.
- Item-type gate is the existing `showTaskModalIntakeUi` boolean
  (`workout` / `workout_log` / `taskMetadataLooksWorkoutShaped`). This is the
  same gate that decides whether to append the intake contract today, so the
  state block is structurally impossible on non-workout-ish tasks.

### 4. Edge Function — narrow Guard 3

**File (canonical):** [`src/lib/agents/coach/server-guards.ts`](../../../src/lib/agents/coach/server-guards.ts)
**File (mirror):** [`supabase/functions/agents/coach/server-guards.ts`](../../../supabase/functions/agents/coach/server-guards.ts)

- Introduce a new fragment field
  `isActiveWorkoutSession: boolean` on `CoachGuardsFragment`. The strategy
  computes it from the **trigger row only**:

  ```ts
  // In strategy.ts applyServerGuards():
  const meta = ctx.message.metadata as Record<string, unknown> | null;
  const isActiveWorkoutSession =
    isWorkoutContextSentinel(ctx.message) ||
    (meta != null &&
      typeof meta === 'object' &&
      (typeof meta['workoutContext'] === 'object' || typeof meta['workout_context'] === 'object'));
  ```

  Static task metadata (`tasks.metadata`) does **not** flip the flag — that was
  the bug. Only the **trigger message** carrying an active-session payload
  (workout player sentinel, live-player message metadata) counts.

- Change Guard 3's behavior:
  - When `fragment.isActiveWorkoutSession === true`: clear card fields,
    `execution_patch` stays (it is the live-player channel), and continue to
    clear `task_modal_intake_patch` and `proposed_workout_metadata` — there is
    no Task Modal intake wizard mid-workout.
  - When `fragment.isActiveWorkoutSession === false` but
    `fragment.currentWorkoutContextJson` is set (planning-time context from
    `tasks.metadata`): **do not** clear `task_modal_intake_patch`. Preserve
    `update_existing_task` / `proposed_workout_metadata` exactly as today (no
    behavior change for the card-write path).

- Tests:
  - `server-guards.test.ts` (canonical) — three cases:
    1. trigger has `metadata.workoutContext` → intake patch cleared (active);
    2. trigger has no workout meta, but `currentWorkoutContextJson` derived from
       `tasks.metadata` → intake patch **preserved** (planning);
    3. workout sentinel trigger → intake patch cleared (active).

### 5. Edge Function — schema/parser alignment + telemetry

**File (canonical):** [`src/lib/agents/coach/schema.ts`](../../../src/lib/agents/coach/schema.ts)
**File (mirror):** [`supabase/functions/agents/coach/schema.ts`](../../../supabase/functions/agents/coach/schema.ts)

- `task_modal_intake_patch.duration_minutes` — keep `type: 'STRING'` (already
  the case), but tighten the `description` to **explicitly enumerate the four
  numeric strings + verbatim "Optimized for Goals"**:

  ```text
  Session length: exactly one of the strings "15", "30", "45", "60", or
  "Optimized for Goals". Never emit a bare integer; always quote.
  ```

- `task_modal_intake_patch.wizard_step` — keep `INTEGER` 1–4 (matches parser).
- No other schema changes.

**File (canonical):** [`src/lib/agents/coach/prompts.ts`](../../../src/lib/agents/coach/prompts.ts)
**File (mirror):** [`supabase/functions/agents/coach/prompts.ts`](../../../supabase/functions/agents/coach/prompts.ts)

- Update the worked-examples block in `buildTaskModalIntakeUiCoachBlock()`:
  - replace `{"duration_minutes": 30}` (if any) with `{"duration_minutes": "30"}`;
  - add a `BAD` example: `{"duration_minutes": 30}` — "must be a string,
    e.g. \"30\"".

- Update the **truthfulness** sentence in `buildBaseCoachPrompt()` to include
  the new live-state block name (purely informational; no behavior change):
  `… If reply_content claims you changed a slider or step shown under TASK
MODAL LIVE STATE, you MUST emit the same change in task_modal_intake_patch.`

**File:** [`supabase/functions/agents/coach/strategy.ts`](../../../supabase/functions/agents/coach/strategy.ts)

- After parse, before guards, if `reply_content` contains slider/wizard
  phrasing (cheap regex, e.g. `/\b(readiness|sleep|wizard|step|duration|intensity|soreness|equipment)\b/i`)
  and `parsed.task_modal_intake_patch == null`, emit:
  ```ts
  log('warn', 'coach reply_content claims intake update without patch', {
    request_id: ctx.requestId,
    slug: COACH_SLUG,
    item_type: taskItemType,
  });
  ```
  Telemetry only; no behavior change. (Phase 4+ may promote to a guard.)

### 6. Tests — integration

**File:** [`supabase/functions/agent-dispatch/index.integration.test.ts`](../../../supabase/functions/agent-dispatch/index.integration.test.ts)

- New scenario: trigger row carries `metadata.task_modal_live_state` with
  `readiness: 4, sleep_quality: 5`, and Vertex returns
  `task_modal_intake_patch: { readiness: 7 }`. Assert:
  - the reply row's `metadata.task_modal_intake_patch.readiness === 7`;
  - Guard 3 did **not** clear the patch (no `workoutContext` on trigger);
  - the `TASK MODAL LIVE STATE (v1)` header appears in the captured system
    prompt;
  - the regex telemetry warning does **not** fire (patch present).
- Negative scenario: same trigger but Vertex omits the patch and says
  _"I’ve updated your readiness slider."_ — assert the warn log fires once.

### 7. Docs

- Update [`README.md`](./README.md) status table: add row `3.7 — Backend agent
alignment (Read + Write) — in progress`.
- Cross-link Phase 3.6A/B → 3.7 → 4.

---

## Polymorphism contract (explicit)

| `tasks.item_type` | rail attaches `task_modal_live_state`? | prompt block? | Guard 3 intake clamp?          |
| ----------------- | -------------------------------------- | ------------- | ------------------------------ |
| `workout`         | **yes** (TaskModal)                    | yes           | only if active workout session |
| `workout_log`     | **yes** (TaskModal)                    | yes           | only if active workout session |
| `event`           | no                                     | no            | n/a (no patch on the wire)     |
| `experience`      | no                                     | no            | n/a                            |
| `idea`            | no                                     | no            | n/a                            |
| `memory`          | no                                     | no            | n/a                            |
| `program`         | no                                     | no            | n/a                            |
| `task` (generic)  | no                                     | no            | n/a                            |
| `class`           | no (and `defaultAgentSlug` is `null`)  | no            | n/a                            |

This table is the acceptance contract for Phase 3.7 polymorphism. If any future
phase wants to inject live state for another item type, it must add an entry
here and a host-side builder — the rail itself stays domain-free.

---

## Acceptance criteria

1. **Read closed.** With `itemType='workout'` and the wizard at
   `readiness: 4, sleep_quality: 5, wizard_step: 2`, sending "I’m tired today"
   produces an `agent-dispatch` request whose composed system prompt (asserted
   by the integration test) contains a `TASK MODAL LIVE STATE (v1)` block with
   those exact values.

2. **Write unblocked.** With the same setup and Vertex returning
   `task_modal_intake_patch: { readiness: 7 }`, the reply row's
   `messages.metadata.task_modal_intake_patch.readiness` is `7`, and the React
   wizard slider moves to `7` via `useAgentEffectSweep` →
   `applyTaskModalIntakePatchFromMessage`. The user-touch policy still wins for
   stale messages older than the most recent user touch (existing behavior).

3. **Non-workout neutrality.** With `itemType='idea'` (or any non-workout
   type), the message insert metadata contains **no** `task_modal_live_state`
   key, and the system prompt contains **no** `TASK MODAL LIVE STATE` header,
   regardless of what the user types. Verified by extending
   `TaskModalChatRailMount.branches.test.tsx`.

4. **Active-workout still clamps.** Trigger row with
   `metadata.workoutContext` (workout player) and Vertex emitting
   `task_modal_intake_patch: { readiness: 9 }` → reply row has **no**
   `task_modal_intake_patch` (Guard 3 active-workout branch).

5. **Schema/parser uniformity.** All four numeric duration choices are emitted
   as quoted strings (`"15"`, `"30"`, `"45"`, `"60"`); the parser accepts both
   forms (unchanged); logs show no `duration_minutes invalid_enum` drops in the
   new integration tests.

6. **Mirror parity.** `pnpm check:agent-mirror` passes; the Vitest-side prompt
   and schema files match the Deno-side `.ts` mirrors byte-for-byte (excluding
   the mirror-file header).

7. **No domain leakage in the rail.** A grep over
   `src/components/chat/StandardTaskChatRail.tsx` shows zero new imports from
   `@/lib/agents/coach/*`, `@/components/modals/*`, or `@/components/fitness/*`.

---

## Test plan summary

- **Vitest (canonical)**
  - `task-modal-intake-patch` — unchanged; existing parse tests cover the
    duration-string emphasis.
  - `prompts` — new test:
    `buildTaskModalLiveStateBlock` formats numbers, arrays, and quoted strings
    deterministically; `readTaskModalLiveStateFromMessageMetadata` returns
    `null` for missing / `v!==1` / non-object metadata; drops invalid fields.
  - `server-guards` — three new cases above.
- **Vitest (UI)**
  - `StandardTaskChatRail` — new test: `buildOutgoingMessageMetadata` shallow
    merge, key precedence, `null` / `undefined` short-circuit.
  - `TaskModalChatRailMount.branches.test.tsx` — extended polymorphism matrix.
  - `TaskModalIntakePatchDedup.test.tsx` — extended freshness test.
- **Deno integration**
  - `agent-dispatch/index.integration.test.ts` — two new scenarios above.

---

## Manual smoke (post-merge)

Run in a staging workspace with `NEXT_PUBLIC_STANDARD_TASK_CHAT_RAIL=true`:

1. Open a `workout` task, set wizard `readiness=4`, `sleep_quality=5`,
   `wizard_step=2`. Send "I’m exhausted; bump readiness to 7 and move me to
   step 3." → Coach reply applies `readiness: 7, wizard_step: 3` on the
   sliders within ~2 s; chat row renders the reply normally.
2. Open an `idea` task in the same bubble. Send the same message. → Coach
   replies in prose; no slider movement (no wizard rendered); message
   `metadata.task_modal_live_state` is absent in DB.
3. Start the workout player on the same task; send "bump set 1 to 60lb." →
   `execution_patch` applies on the live grid; `task_modal_intake_patch` from
   the reply is empty / cleared by Guard 3 (active workout branch).
4. Edge logs: `coach task_modal_intake_patch drops` warns only on bad model
   output, not on the happy paths above; the new "claims intake update
   without patch" warn fires only when prose contradicts emitted JSON.

---

## Rollback policy

- **Client.** `NEXT_PUBLIC_STANDARD_TASK_CHAT_RAIL=false` reverts to
  `TaskModalCommentsPanel`; the rail (and the new callback) is no longer
  mounted. No code revert needed.
- **Edge.** The new live-state block is a pure additive prompt branch gated on
  `task_modal_live_state` being present. If the rail is off, trigger rows do
  not carry the key and the prompt is byte-identical to today. Revert by
  reverting the Edge Function PR; no DB rollback required (no migrations in
  3.7).
- **Guards.** If the narrowed Guard 3 causes a regression (model spamming
  intake patches mid-workout), the strategy can flip a one-line
  `forceActiveWorkout = true` constant to restore the old clamp while keeping
  the prompt block. Documented as a hot-fix knob, not a long-term mode.

---

## Cross-references

- Diagnosis source chat: this Plan-mode review.
- Existing UI write contract:
  [`src/components/chat/StandardTaskChatRail.tsx`](../../../src/components/chat/StandardTaskChatRail.tsx),
  [`src/components/chat/agent-effects/useAgentEffectSweep.ts`](../../../src/components/chat/agent-effects/useAgentEffectSweep.ts),
  [`src/components/modals/task-modal/hooks/useWorkoutIntakeWizardState.ts`](../../../src/components/modals/task-modal/hooks/useWorkoutIntakeWizardState.ts),
  [`src/lib/agents/coach/task-modal-intake-patch.ts`](../../../src/lib/agents/coach/task-modal-intake-patch.ts).
- Existing backend pipeline:
  [`supabase/functions/agents/coach/strategy.ts`](../../../supabase/functions/agents/coach/strategy.ts),
  [`supabase/functions/agents/coach/context.ts`](../../../supabase/functions/agents/coach/context.ts),
  [`supabase/functions/agents/coach/server-guards.ts`](../../../supabase/functions/agents/coach/server-guards.ts),
  [`supabase/functions/agents/coach/prompts.ts`](../../../supabase/functions/agents/coach/prompts.ts),
  [`supabase/functions/agents/coach/schema.ts`](../../../supabase/functions/agents/coach/schema.ts),
  [`supabase/functions/_shared/dispatch/rpc.ts`](../../../supabase/functions/_shared/dispatch/rpc.ts).
- Migration baseline (unchanged in 3.7):
  [`supabase/migrations/20260823120000_agent_rpcs_drop_legacy_overloads.sql`](../../../supabase/migrations/20260823120000_agent_rpcs_drop_legacy_overloads.sql).
- Polymorphism boundary:
  [`src/lib/agents/defaultSlugForItemType.ts`](../../../src/lib/agents/defaultSlugForItemType.ts).
- Webhook secret rule (do not touch):
  [`.cursor/rules/supabase-agent-dispatch-webhook-secret.mdc`](../../../.cursor/rules/supabase-agent-dispatch-webhook-secret.mdc).
