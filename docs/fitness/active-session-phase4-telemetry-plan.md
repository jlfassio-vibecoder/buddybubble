# Active Session Phase 4 — Telemetry Loop (Execution Plan)

**Status:** **In progress** (C1–C2 shipped)  
**Parent plan:** [active-session-engine-plan.md](./active-session-engine-plan.md) (Phase 4)  
**Prerequisites:** Phases 0–3 shipped · `buildWorkoutCoachRailContext` + `live_set_counts` (Step 6 M6.2) · `draft_logs` / `buildWorkoutLogDraftMetadata` · `coach-sync` actor · `intervalRowSnapshots` on machine context  
**Related:** [parametric-step6-plan.md](./views/parametric-step6-plan.md) (Coach context / `live_set_counts`) · [rail-composer-tokens.md](../agents/coach/rail-composer-tokens.md)

**Goal:** Close the loop between _prescription_ (what the Coach planned) and _performance_ (what the athlete actually logged) so subsequent Coach turns can reason about progressive overload, missed sets, and interval outcomes without re-parsing raw `draft_logs`.

**Scope:** Active Session path first (XState context is the source of truth). V1 `WorkoutPlayer` parity is Sprint C6 (optional).

---

## Sprint overview

| Sprint | Theme                              | Status      |
| ------ | ---------------------------------- | ----------- |
| **C1** | Contract & pure builder            | **Shipped** |
| **C2** | Persist on autosave & finish       | **Shipped** |
| **C3** | Coach outbound (client)            | Not started |
| **C4** | Edge injection & prompt rules      | Not started |
| **C5** | Verification & docs                | Not started |
| **C6** | V1 WorkoutPlayer parity (optional) | Not started |

**Recommended first PR:** Sprint C1 only — pure contract + tests, zero runtime behavior change.

---

## Current state (codebase audit)

| Layer               | Today                                                                                                | Gap                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Machine context** | `draftLogs`, `ghostLogs`, `elapsedSec`, `intervalRowSnapshots`, `sessionVm`, `logTaskId`             | Compiled via `buildSessionTelemetrySnapshot()` at persist/finish time (not on context)                 |
| **Persistence**     | `persistence.actor.ts` → `buildWorkoutLogDraftMetadata()` + `session_telemetry` on autosave          | Coach still must read from `workout_log` row (C3/C4 outbound)                                          |
| **Finish**          | `finish-workout.actor.ts` → `buildWorkoutLogFinishMetadata()` + `session_telemetry`                  | `finish_insert` snapshot has `workout_log_task_id: null` until post-insert patch (if needed later)     |
| **Coach outbound**  | Sentinel sends `workoutContext` (prescription + `live_set_counts`) via `useActiveSessionCoachBridge` | No actual logged weights/reps in message metadata                                                      |
| **Edge inbound**    | `resolveCurrentWorkoutContextJsonFromThread()` → `--- CURRENT WORKOUT CONTEXT ---`                   | Reads prescription JSON from messages/task metadata; ignores `session_telemetry` on `workout_log` rows |
| **Prompt rules**    | `execution_patch` bounds use `live_set_counts`                                                       | No directive for reading _logged_ performance vs targets                                               |

### Integration flow (locked)

```
ActiveSessionContext
  └─ buildSessionTelemetrySnapshot(ctx)     ← pure, no I/O
       └─ merge into buildWorkoutLogDraftMetadata / buildWorkoutLogFinishMetadata
            └─ tasks.metadata.session_telemetry
                 └─ (optional) messages.metadata.session_telemetry on send/sentinel
                      └─ Edge: formatSessionTelemetryBlock() → prompt append
```

---

## 1. Data contract — `SessionTelemetrySnapshot` v1

**Primary module:** `src/lib/workout-factory/session-telemetry.ts`  
_(Shared pure module — usable by Active Session, tests, and eventually V1 WorkoutPlayer. Edge gets a formatter mirror, not the builder.)_

### Design principles

1. **Prescription stays separate** — Do not embed full `ai_workout_factory` in telemetry. Coach already receives prescription via `CURRENT WORKOUT CONTEXT`. Telemetry carries _performance + delta_ only.
2. **Index alignment** — All `exercise_index` / `set_index` values use the same flat index space as `live_set_counts` and `execution_patch`.
3. **Compact on wire** — Full snapshot in DB; compact text for prompts (Sprint C4).
4. **Versioned** — `schema_version: 1` for forward-compatible JSON migrations.

### TypeScript interface (v1)

```typescript
/** Stable subset hashed for Coach dedupe (skip re-sending identical telemetry). */
export type SessionTelemetryFingerprintInput = {
  schema_version: 1;
  session_id: string;
  workout_log_task_id: string | null;
  elapsed_sec: number;
  /** Done-set payload only — omit blank rows */
  set_logs: SessionTelemetrySetLogRow[];
  interval_performance: SessionTelemetryIntervalRow[];
};

export type SessionTelemetrySetLogRow = {
  exercise_index: number;
  set_index: number;
  weight: string | null;
  reps: string | null;
  rpe: string | null;
  done: boolean;
};

export type SessionTelemetryPlannedSet = {
  weight: string | null;
  reps: string | null;
  target_label?: string | null; // e.g. "135 lb × 8" from prescription row
};

export type SessionTelemetrySetDelta = {
  set_index: number;
  planned: SessionTelemetryPlannedSet | null;
  actual: Pick<SessionTelemetrySetLogRow, 'weight' | 'reps' | 'rpe' | 'done'>;
  /** Derived — not LLM-authored */
  status: 'done' | 'partial' | 'skipped' | 'not_started';
};

export type SessionTelemetryExerciseDelta = {
  exercise_index: number;
  name: string;
  planned_set_count: number;
  logged_set_count: number;
  completed_set_count: number;
  sets: SessionTelemetrySetDelta[];
};

export type SessionTelemetryIntervalRow = {
  block_id: string;
  format: 'tabata' | 'emom' | 'amrap' | 'straight';
  rounds_completed: number;
  rounds_target: number | null;
  last_phase: string;
  elapsed_in_block_sec: number;
};

export type SessionTelemetryPerformanceSummary = {
  total_sets_planned: number;
  total_sets_logged: number;
  total_sets_completed: number;
  total_volume_kg: number | null;
  skipped_exercise_indices: number[];
  elapsed_sec: number;
};

export type SessionTelemetrySnapshot = {
  schema_version: 1;
  captured_at: string; // ISO — time of compile
  session_id: string;
  workout_log_task_id: string | null;
  source_task_id: string;
  started_at: string;
  elapsed_sec: number;

  /** Raw grid — mirrors draftLogs shape flattened (includes undone rows for crash recovery) */
  set_logs: SessionTelemetrySetLogRow[];

  /** Planned vs actual — primary Coach-readable delta */
  exercise_deltas: SessionTelemetryExerciseDelta[];

  interval_performance: SessionTelemetryIntervalRow[];
  performance_summary: SessionTelemetryPerformanceSummary;

  /** Aligns with M6.2 / execution_patch bounds */
  live_set_counts: number[];

  /** sha256 hex of canonical JSON(fingerprint input) */
  fingerprint: string;
};
```

### Builder signature

```typescript
export function buildSessionTelemetrySnapshot(input: {
  context: Pick<
    ActiveSessionContext,
    | 'sessionId'
    | 'sourceTaskId'
    | 'logTaskId'
    | 'draftLogs'
    | 'ghostLogs'
    | 'elapsedSec'
    | 'startedAt'
    | 'intervalRowSnapshots'
    | 'sessionVm'
  >;
  sourceMetadata: Json | null;
  workoutTitle: string;
}): SessionTelemetrySnapshot;
```

### Delta logic (pure)

| Input                                                                  | Planned side                                            | Actual side                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| `sessionVm.flatExercises[i]`                                           | Target weight/reps from prescription row                | —                                                        |
| `draftLogs[i][j]`                                                      | Compare against exercise defaults + ghost (`ghostLogs`) | `weight`, `reps`, `rpe`, `done`                          |
| Undone sets with no edits                                              | `status: 'not_started'`                                 | —                                                        |
| Sets with values but `done: false`                                     | `status: 'partial'`                                     | —                                                        |
| Exercise with zero `done` sets                                         | add to `skipped_exercise_indices`                       | —                                                        |
| `intervalRowSnapshots[blockId]` + block config from `sessionVm.blocks` | `rounds_target`                                         | `rounds_completed`, `last_phase`, `elapsed_in_block_sec` |

**Reuse existing helpers:** `buildWorkoutLogExercisePayloadFromLogs` (done-set extraction), `validateLiveSetCounts`, `resolve-interval-block-input` for interval targets.

---

## 2. Client-side persistence

### Where to compile (not in the machine)

The XState machine should **not** own telemetry math. Keep it in a **pure builder** called from persistence/finish adapters — same pattern as `buildWorkoutLogDraftMetadata`.

| Event                        | Call site                                               | Metadata write                                           |
| ---------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| **Debounced autosave**       | `createProductionPersistenceAdapter` → `buildMeta(ctx)` | `buildWorkoutLogDraftMetadata({ …, sessionTelemetry })`  |
| **Flush (finish / abandon)** | Same adapter path via `FLUSH_AUTOSAVE` before finish    | Latest snapshot on draft row                             |
| **Finish**                   | `executeFinishWorkout` in `finish-workout.actor.ts`     | `buildWorkoutLogFinishMetadata({ …, sessionTelemetry })` |

### Hook in `persistence.actor.ts`

```typescript
// createProductionPersistenceAdapter.buildMeta(ctx)
const telemetry = buildSessionTelemetrySnapshot({
  context: ctx,
  sourceMetadata: deps.sourceMetadata,
  workoutTitle: deps.workoutTitle,
});
return buildWorkoutLogDraftMetadata({
  …existing params,
  sessionTelemetry: telemetry,
});
```

No changes to `persistenceActor` callback loop, guards, or `AUTOSAVE_*` events — only the metadata payload grows.

### Metadata shape on `workout_log`

```json
{
  "source_task_id": "…",
  "draft_logs": [ … ],
  "session_telemetry": { …SessionTelemetrySnapshot },
  "ai_workout_factory": { … }
}
```

On **finish**, retain final `session_telemetry` alongside `exercises` / `set_logs` so historical Coach turns can read last session performance from the completed log row.

### Extend builders (minimal)

**File:** `src/lib/workout-factory/build-workout-log-finish-metadata.ts`

- Add optional `sessionTelemetry?: SessionTelemetrySnapshot` to draft + finish param types.
- When present: `out.session_telemetry = sessionTelemetry` (store full object; prompt formatter compacts later).

### Coach outbound (client — Sprint C3)

| Surface               | File                                              | Change                                                                          |
| --------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| Workout-open sentinel | `useActiveSessionCoachBridge.ts` → `fireSentinel` | Add `session_telemetry` + `session_telemetry_fingerprint` to `sentinelMetadata` |
| User messages         | `WorkoutCoachRail.tsx` send path                  | Attach latest fingerprint + compact telemetry when `surface: active_session`    |
| Dedupe                | `coach-sync.actor.ts` or bridge                   | Skip sentinel re-fire if fingerprint unchanged (optional C3 stretch)            |

**Do not** add a new machine state for telemetry. Optional future event: `TELEMETRY_PUSH` only if Q4 silent push is approved.

---

## 3. Edge / context injection

### Read paths (priority order)

When assembling the Coach system prompt in `strategy.ts` → `buildSystemPrompt`:

1. **Live trigger** — `ctx.message.metadata.session_telemetry` (user just sent / sentinel with telemetry).
2. **Linked log row** — If `knownTargetTaskId` resolves to `item_type === 'workout_log'`, read `tasks.metadata.session_telemetry` via existing `loadCurrentTaskContext`.
3. **Source template** — When discussing a `workout` card mid-session, load the in-progress `workout_log` for `metadata.source_task_id` + `status = 'in_progress'` (scoped query in `context.ts`).

### New Edge helpers

**File:** `supabase/functions/agents/coach/session-telemetry-format.ts`  
**Mirror:** `src/lib/agents/coach/session-telemetry-format.ts`

```typescript
export const SESSION_TELEMETRY_HEADER = '--- SESSION TELEMETRY (live performance) ---';

export function parseSessionTelemetryFromMetadata(
  metadata: unknown,
): SessionTelemetrySnapshot | null;
export function formatSessionTelemetryForPrompt(snapshot: SessionTelemetrySnapshot): string;
export function summarizeTelemetryDeltas(
  snapshot: SessionTelemetrySnapshot,
  maxBytes?: number,
): string;
```

### Prompt assembly (`strategy.ts`)

After `CURRENT WORKOUT CONTEXT` block (prescription), **conditionally append**:

```
--- SESSION TELEMETRY (live performance) ---
Elapsed: 18m | Sets completed: 12/16 | Skipped exercises: [2]
Ex0 Back Squat: planned 3×135×8 → logged 135×8, 135×7, 135×6 (all done)
Ex2 Tabata block: 6/8 rounds completed
…
```

### Token budget strategy

| Surface      | Format                                                   | Cap                                                         |
| ------------ | -------------------------------------------------------- | ----------------------------------------------------------- |
| **Rail**     | `summarizeTelemetryDeltas()` — human lines, no full JSON | ~2–4 KB                                                     |
| **Non-rail** | Compact JSON fallback if summary empty                   | Split budget with `WORKOUT_CONTEXT_JSON_PROMPT_CAP` (16 KB) |

**Reuse pattern:** `summarizeWorkoutContextForRailBlockAppend` in `block-blueprint-synthesize.ts` — same “prescription summary on rail, full JSON elsewhere” diet.

### Prompt rule additions (`prompts.ts` + mirror)

Append to `ACTIVE_WORKOUT_EXECUTION_STATE_DIRECTIVE` (when telemetry block present):

- Coach must treat **SESSION TELEMETRY** as ground truth for logged performance.
- Prescription targets live in **CURRENT WORKOUT CONTEXT**; deltas show where the athlete deviated.
- When suggesting load changes, reference _logged_ values from telemetry, not only prescription.
- `execution_patch` indices still bound by `live_set_counts` in workout context.

### `resolveCurrentWorkoutContextJsonFromThread`

**No change to prescription resolution order.** Telemetry is a **separate block** — avoids breaking Phase 12 rich-workout gate and LIVE CO-PILOT semantics.

### Open question Q4 (recommendation)

| Option                                                           | Verdict                                                                                       |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Silent telemetry message on debounced change                     | **Defer** — duplicates autosave writes; noisy in thread                                       |
| Poll `workout_log.metadata.session_telemetry` on each Coach turn | **Preferred for v1** — Edge reads latest draft row when rail surface + `source_task_id` known |
| Attach only on user send + sentinel                              | **Ship in C3** — zero extra DB reads on every turn                                            |

---

## 4. Testing strategy

### Sprint C1 — Builder unit tests

**File:** `src/lib/workout-factory/session-telemetry.test.ts`

| Case                                   | Assert                                                   |
| -------------------------------------- | -------------------------------------------------------- |
| Empty grid                             | All `not_started`, zero completed, fingerprint stable    |
| Partial set (weight entered, not done) | `status: 'partial'`                                      |
| Done set with rep drop vs prescription | Delta shows under-target                                 |
| Skipped exercise                       | Index in `skipped_exercise_indices`                      |
| Tabata interval snapshot               | `interval_performance[0].rounds_completed`               |
| `live_set_counts` alignment            | Length === `flatExercises.length`                        |
| Fingerprint                            | Same inputs → same hash; one rep change → different hash |

### Sprint C2 — Persistence integration

**Files:** `persistence.actor.test.ts`, `finish-workout.actor.test.ts`

- Mock adapter captures metadata; assert `session_telemetry.schema_version === 1`.
- Finish path retains telemetry on completed metadata.
- Autoskip path (`AutosaveSkippedError`) does not require telemetry write.

### Sprint C3 — Client outbound

**File:** `useActiveSessionCoachBridge.test.ts` (new) or extend existing rail tests

- Sentinel metadata includes `session_telemetry` when draftLogs non-empty.
- Fingerprint attached for dedupe.

### Sprint C4 — Edge / prompt assembly

**Files:** `session-telemetry-format.test.ts` (client + Deno mirror)

- `formatSessionTelemetryForPrompt` under byte cap truncates with `...(truncated)`.
- `strategy.ts` integration: when trigger metadata carries telemetry, prompt contains `SESSION TELEMETRY` header.
- `pnpm check:agent-mirror` passes after mirror add.

**Deno:** Extend existing coach dispatch integration test pattern with fixture metadata containing `session_telemetry`.

### Sprint C5 — E2E / dogfood (manual + optional RTL)

- Log 2 sets on Active Session → open Coach tab → ask “how did my squats compare to plan?”
- Verify Edge logs show `session_telemetry` source in structured log line.

---

## Sprint C1 — Contract & pure builder

**Deliverables**

- [x] `SessionTelemetrySnapshot` types + `buildSessionTelemetrySnapshot()`
- [x] `computeSessionTelemetryFingerprint()`
- [x] Unit tests (≥10 cases)
- [x] Export from `src/lib/workout-factory/` (no persistence yet)

**Exit criteria:** Builder produces valid delta from machine fixture contexts.

**Primary files:** `src/lib/workout-factory/session-telemetry.ts`, `session-telemetry.test.ts`

---

## Sprint C2 — Persist on autosave & finish

**Deliverables**

- [x] Extend `buildWorkoutLogDraftMetadata` / `buildWorkoutLogFinishMetadata` with optional `sessionTelemetry`
- [x] Wire into `createProductionPersistenceAdapter.buildMeta`
- [x] Wire into `executeFinishWorkout` final metadata
- [x] Actor tests assert `metadata.session_telemetry` on insert/update

**Exit criteria:** In-progress `workout_log` row in DB contains telemetry after autosave; finish retains it.

**Dependency:** Phase 2.5.2 migrations deployed (Workout Logs bubble) for prod dogfood.

**Primary files:** `build-workout-log-finish-metadata.ts`, `persistence.actor.ts`, `finish-workout.actor.ts`

---

## Sprint C3 — Coach outbound (client)

**Deliverables**

- [ ] Attach telemetry + fingerprint to workout-open sentinel (`useActiveSessionCoachBridge`)
- [ ] Attach to user sends from `WorkoutCoachRail` when active session surface
- [ ] (Optional) Suppress sentinel re-send when fingerprint unchanged

**Exit criteria:** `messages.metadata.session_telemetry` visible in Supabase after first logged set + sentinel.

**Primary files:** `useActiveSessionCoachBridge.ts`, `WorkoutCoachRail.tsx`

---

## Sprint C4 — Edge injection & prompt rules

**Deliverables**

- [ ] `session-telemetry-format.ts` (Edge + mirror)
- [ ] `loadInProgressWorkoutLogTelemetry()` helper in `context.ts` (query by `source_task_id`)
- [ ] Append `SESSION TELEMETRY` block in `strategy.ts` after workout context
- [ ] Prompt directive updates in `prompts.ts` + mirror
- [ ] `pnpm check:agent-mirror` + format tests

**Exit criteria:** Coach system prompt includes compact performance summary when athlete has logged sets; `execution_patch` still aligns with `live_set_counts`.

**Primary files:** `supabase/functions/agents/coach/context.ts`, `strategy.ts`, `session-telemetry-format.ts`, `src/lib/agents/coach/prompts.ts` (+ mirrors)

---

## Sprint C5 — Verification & docs

**Deliverables**

- [ ] Update [active-session-engine-plan.md](./active-session-engine-plan.md) Phase 4 checkboxes
- [ ] Dogfood checklist items for telemetry
- [ ] Manual QA script (Active Session → Coach progressive overload question)
- [ ] Resolve Q4 in parent plan (document chosen transport)

**Exit criteria:** Phase 4 acceptance criteria in parent plan met.

---

## Sprint C6 — V1 WorkoutPlayer parity (optional)

**Deliverables**

- [ ] Call same `buildSessionTelemetrySnapshot` from WorkoutPlayer autosave/finish (adapt input shape — no XState context)
- [ ] Same Edge read path works for modal player sessions

**Note:** Can ship C1–C5 without C6 if Active Session remains opt-in.

---

## Risks & mitigations

| Risk                             | Mitigation                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| Token bloat                      | Rail uses `summarizeTelemetryDeltas`; cap bytes; never duplicate factory in telemetry |
| Stale telemetry on Coach turn    | Edge polls in-progress log by `source_task_id` when rail surface                      |
| Index drift vs `execution_patch` | Single builder; shared `live_set_counts` derivation from `draftLogs.length`           |
| Mirror drift                     | `session-telemetry-format.ts` in agent mirror check; builder stays client-only        |
| V1 / Active Session divergence   | Shared builder in `workout-factory`; C6 for parity                                    |

---

## Acceptance criteria (Phase 4 complete)

- [ ] Coach thread metadata contains `session_telemetry` with done sets after user logs
- [ ] `formatExerciseIndexMap` / SESSION TELEMETRY consistent with `live_set_counts`
- [ ] Finish metadata retains telemetry for history / next-session context
- [ ] `pnpm exec vitest run src/lib/workout-factory/session-telemetry` — green
- [ ] `pnpm check:agent-mirror` — green after C4

---

## Changelog

| Date       | Change                                                                |
| ---------- | --------------------------------------------------------------------- |
| 2026-05-26 | **Sprint C1 shipped** — `session-telemetry.ts` builder + 7 unit tests |
| 2026-05-26 | Initial Phase 4 execution plan — sprints C1–C6                        |
