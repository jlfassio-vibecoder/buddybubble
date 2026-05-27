# Active Session Engine — Architecture & Execution Plan

**Status:** **Phases 0–3 shipped** · **Phase 2 shipped** (persistence, Coach sync, abandon flush, exit-flow RTL tests) · **Phase 2.5 ops remaining (2.5.2 deploy)** · **Phase 4 not started**. XState-driven **Active Session** on a dedicated route. **Coexists** with modal **WorkoutPlayer** (V1); not a replacement.

**Product name:** **Active Session** (not "WorkoutPlayer V2")  
**Engineering module:** `src/features/active-session/`  
**Route:** `/app/[workspace_id]/session/[task_id]`

**Prerequisites:** Parametric Workout Engine Steps 1–9 (shipped) · V1 `WorkoutPlayer` stabilization (refs, autosave hardening, timer catch-up — shipped)

**True next steps (in order):**

1. **Phase 2.5 ops** — deploy migrations to existing workspaces (**2.5.2**): Workout Logs bubble backfill + `in_progress` Kanban column.
2. **Phase 4 Telemetry Loop** — [active-session-phase4-telemetry-plan.md](./active-session-phase4-telemetry-plan.md) (Sprints C1–C6).

Before broad prod dogfood on existing workspaces: deploy **`20260830120000_backfill_fitness_workout_logs_bubble.sql`** and **`20260526000000_add_in_progress_column_fitness.sql`** (**2.5.2**).

**Optional polish (non-blocking):** dogfood checklist sign-offs (class board, mobile tab switch, offline autosave Q1); wire `useUserExerciseNotes` on Active Session; Playwright e2e (RTL shell exit-flow tests cover abandon/finish routing today).

**Related:** [workout-player.md](./workout-player.md) (V1 reference) · [active-session-phase4-telemetry-plan.md](./active-session-phase4-telemetry-plan.md) · [layout-shell-architecture.md](./views/layout-shell-architecture.md) · [parametric-step6-plan.md](./views/parametric-step6-plan.md) (Coach context / `live_set_counts`) · [rail-composer-tokens.md](../agents/coach/rail-composer-tokens.md)

**V1 postmortem summary:** V1 is **stable but not modelable** — 8+ refs, 15+ effects, modal-inside-dashboard, one-way Coach patches, no outbound telemetry for progressive overload.

---

## Nomenclature

| Context            | Name                              | Avoid                    |
| ------------------ | --------------------------------- | ------------------------ |
| Product / UX       | **Active Session**                | "Player", "V2"           |
| Engineering        | **Active Session Engine**         | "WorkoutPlayer refactor" |
| AI / data          | **Telemetry Loop**                | "Chat sync"              |
| Live class overlap | **Session Deck** (optional alias) | —                        |

Alternative names considered: **Execution Engine**, **Performance HUD**, **Telemetry Loop**.

---

## Executive summary

| Layer           | WorkoutPlayer (V1)                                   | Active Session (new path)                                            |
| --------------- | ---------------------------------------------------- | -------------------------------------------------------------------- |
| **Container**   | Radix dialog / bottom sheet inside `dashboard-shell` | Dedicated Next.js route; dashboard unmounts                          |
| **State**       | React `useState` + refs + effects                    | XState v5 machine + spawned actors                                   |
| **Timers**      | React hooks wrapping pure reducers                   | Spawned `intervalBlockMachine` wrapping same reducers                |
| **Persistence** | Debounced Supabase client in component               | `persistence` actor; exclusive `autosaving` state                    |
| **Coach**       | Lifted sentinel + patch scan; one-way                | `coachSync` actor; **`SessionTelemetrySnapshot`** outbound (Phase 4) |
| **Testability** | Full React mount required                            | Machine unit tests without UI (43 Vitest tests today)                |

**Bottom line:** Active Session is a **parallel orchestration shell** on a dedicated route. Reuse V1's **pure reducers**, **ViewModel**, interval shells, and log builders in both paths. **WorkoutPlayer stays the default** launch path until product opts into the route via feature flag.

## Coexistence (current intent)

| Path                   | Container                                 | Default?    | Notes                                                         |
| ---------------------- | ----------------------------------------- | ----------- | ------------------------------------------------------------- |
| **WorkoutPlayer** (V1) | Modal / bottom sheet in `dashboard-shell` | **Yes**     | Production path; continues to receive fixes                   |
| **Active Session**     | `/app/[workspace_id]/session/[task_id]`   | No (opt-in) | `NEXT_PUBLIC_ACTIVE_SESSION_ROUTE=1` on selected launch paths |

Both paths share the same prescription read model, timer reducers, draft/finish metadata builders, and Coach rail context. They differ in **container** (modal vs route) and **orchestration** (React effects vs XState).

---

## Architecture decisions (locked)

| #   | Decision       | Choice                                                                       | Rationale                                                      |
| --- | -------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| D1  | State library  | **XState v5** + `@xstate/react`                                              | Explicit concurrency; matches autosave/finish/background races |
| D2  | Container      | **Route takeover**                                                           | Unmount Kanban/calendar/chat overlay during session            |
| D3  | Timer math     | **Reuse** `emom-timer-engine`, `interval-timer-engine`, `amrap-timer-engine` | Proven; wrap, don't rewrite                                    |
| D4  | Read model     | **Reuse** `WorkoutSessionViewModel`                                          | Block list + flat index unchanged                              |
| D5  | Coach contract | **`SessionTelemetrySnapshot` v1** (Phase 4)                                  | Closes progressive-overload blindspot                          |
| D6  | Rollout        | **Feature flag**; **WorkoutPlayer remains default**                          | Side-by-side; no forced cutover                                |

---

## Current file map (shipped)

```
src/features/active-session/
├── machines/
│   ├── active-session.machine.ts       # top-level coordinator
│   ├── interval-block.machine.ts       # Tabata / EMOM / AMRAP nested machine
│   ├── interval-block-reducer.ts       # wraps pure timer reducers
│   ├── interval-block.types.ts
│   └── types.ts                        # context, events, guards
├── actors/
│   ├── persistence.actor.ts            # debounced autosave (production adapter)
│   ├── finish-workout.actor.ts         # finalize INSERT/UPDATE + template patch
│   ├── coach-sync.actor.ts             # sentinel + execution_patch sweep
│   ├── visibility-listener.actor.ts    # document.visibilitychange → VISIBILITY
│   ├── interval-block-clock.actor.ts   # rAF clock for active interval child
│   └── session-clock.actor.ts          # stub (elapsed via SESSION_TICK in shell)
├── components/
│   ├── ActiveSessionShell.tsx          # VM hydrate, machine, exit nav, coach bridge
│   ├── SessionHUD.tsx
│   ├── SessionLogSurface.tsx           # WorkoutPlayerBlockList + interval machine mode
│   └── SessionCoachPane.tsx            # WorkoutCoachRail wrapper
├── hooks/
│   ├── useActiveSession.ts
│   ├── useActiveSessionCoachBridge.ts
│   └── useActiveSessionIntervalControls.ts
├── types/
│   └── session-task.ts
├── __tests__/                          # 43 Vitest tests (6 files)
│   ├── active-session.machine.test.ts
│   ├── persistence.actor.test.ts
│   ├── finish-workout.actor.test.ts
│   ├── coach-sync.actor.test.ts
│   ├── interval-block.machine.test.ts
│   ├── ActiveSessionShell.exit-flows.test.tsx  # abandon flush + finish routing (RTL)
│   └── test-utils/                     # shared shell harness + supabase mock
└── index.ts

src/lib/active-session/
├── build-active-session-url.ts
└── resolve-active-session-launch-ui.ts # + resolve-active-session-launch-ui.test.ts

src/lib/
└── workout-log-task-state.ts           # isWorkoutLogInProgress + badge classes (+ unit test)

src/components/tasks/
└── WorkoutLogInProgressBadge.tsx       # amber chip on Kanban / chat / modal

src/hooks/
└── use-active-session-launch-from-task-modal.ts

src/app/(dashboard)/app/[workspace_id]/session/[task_id]/
├── page.tsx                            # Server Component fetch (Q5)
├── layout.tsx
└── load-session-task.ts                # resolveWorkoutLogsBubbleId → target_bubble_id

src/lib/fitness/
└── resolve-workout-logs-bubble-id.ts

src/lib/feature-flags/
└── activeSessionRoute.ts               # NEXT_PUBLIC_ACTIVE_SESSION_ROUTE
```

**Out of scope (for now):** Deprecating or removing `WorkoutPlayer.tsx`, `workoutPlayerLaunch`, or `workout-player-execution-patch-bridge.ts` (V1 still uses the bridge). Convergence to a single path is a **future product decision** (Phase 5).

---

## XState blueprint (as implemented)

### Top-level states

| State                   | Purpose                                                | Status  |
| ----------------------- | ------------------------------------------------------ | ------- |
| `hydrating`             | Client draft recovery → `HYDRATE_DONE`                 | Shipped |
| `active.logging`        | Default — user editing set grid                        | Shipped |
| `active.autosaving`     | **Exclusive** — blocks finish fast-path; queues FINISH | Shipped |
| `finishing`             | Finalize log via `finishWorkoutActor`                  | Shipped |
| `closing` → `completed` | Terminal after finish or abandon flush                 | Shipped |

**Interval timers** are **not** a top-level machine state. A spawned **`intervalBlockMachine`** child runs while the user is in an interval block; parent holds `intervalBlockRef`, `activeIntervalBlockId`, and `intervalRowSnapshots`.

### Nested interval child states

| State                                       | Purpose                                   | Status  |
| ------------------------------------------- | ----------------------------------------- | ------- |
| `intervalBlock.idle`                        | Awaiting START                            | Shipped |
| `intervalBlock.running.active`              | rAF clock + TICK                          | Shipped |
| `intervalBlock.running.backgroundSuspended` | Tab hidden; catch-up on resume            | Shipped |
| `intervalBlock.paused`                      | User pause                                | Shipped |
| `intervalBlock.completed`                   | Emits `BLOCK_INTERVAL_COMPLETE` to parent | Shipped |

### Parallel regions / actors (parent machine)

```
activeSessionMachine
├── persistence         → debounced draft write (2s)
├── coachSync           → sentinel + execution_patch (via bridge adapter)
├── visibilityListener  → VISIBILITY → forward to interval child
└── intervalBlock       → spawned on INTERVAL_START (not always invoked)
```

### Guards (tested)

| Guard                  | Behavior                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `canFinishImmediately` | `FINISH` in `active.logging` → `finishing` when `!autosaveInFlight && !pendingInsert && !autosaveScheduled`  |
| `finishQueued`         | After `AUTOSAVE_DONE`, transition to `finishing` if user pressed FINISH during autosave                      |
| `closeQueued`          | After `AUTOSAVE_DONE`, transition to `closing` on ABANDON flush                                              |
| **Fail-stop**          | `AUTOSAVE_FAILED` + `finishQueued` → `active.logging` (clear queue, set `autosaveError`); **no** `finishing` |
| **Insert lock**        | Persistence actor rejects second INSERT when `pendingInsert`                                                 |

`VISIBILITY` on parent updates `documentHidden` and forwards to the active interval child; child runs `catchUpIntervalEngine` on resume from `backgroundSuspended`.

---

## Data contract: SessionTelemetrySnapshot v1 (Phase 4 — not implemented)

**Purpose:** Close-loop Coach context — actual logged performance, not just prescription.

**Stored in (planned):**

- `workout_log.metadata.session_telemetry` (latest; crash recovery)
- `messages.metadata.session_telemetry` (on user send + sentinel + optional silent push)

**Schema (v1):**

```typescript
type SessionTelemetrySnapshot = {
  schema_version: 1;
  session_id: string;
  workout_log_task_id: string | null;
  elapsed_sec: number;
  started_at: string; // ISO
  set_logs: Array<{
    exercise_index: number;
    sets: Array<{
      set_index: number;
      weight: string | null;
      reps: string | null;
      rpe: string | null;
      done: boolean;
    }>;
  }>;
  interval_performance: Array<{
    block_id: string;
    format: 'tabata' | 'emom' | 'amrap' | 'straight';
    rounds_completed: number;
    rounds_target: number | null;
    last_phase: string;
    elapsed_in_block_sec: number;
  }>;
  performance_summary: {
    total_sets_completed: number;
    total_volume_kg: number | null;
    exercises_with_pr_attempt: string[];
  };
  workout_context: Record<string, unknown>; // buildWorkoutCoachRailContext output
};
```

**Coach Hop 1 changes (Phase 4):** Inject `SESSION TELEMETRY` block in `supabase/functions/agents/coach/context.ts`; mirror prompt rule in `src/lib/agents/coach/prompts.ts`.

---

## Phase overview

| Phase   | Theme                               | Status                                                                   |
| ------- | ----------------------------------- | ------------------------------------------------------------------------ |
| **0**   | XState foundation + machine tests   | **Shipped** — 43 Vitest tests; no UI at ship time                        |
| **1**   | Session route shell + feature flag  | **Shipped** — route + flag; V1 remains default                           |
| **2**   | Persistence + Coach actors          | **Shipped** — abandon flush nav + exit-flow RTL tests (**2.5**, **2.7**) |
| **2.5** | Playbook + Workout Logs routing     | **Core shipped** — **2.5.2 deploy** remaining; draft visibility shipped  |
| **3**   | Ghost UI + interval nested machines | **Shipped** — ghost, denorm, interval machine, shells, visibility        |
| **4**   | Telemetry loop (Coach)              | **Not started**                                                          |
| **5**   | Optional convergence (deferred)     | **Deferred** — side-by-side until product decision                       |

---

## Phase 0 — Foundation (machine only)

**Status:** **Shipped** (`ade54d5`, expanded through Phase 3 commits)  
**Goal:** Prove XState model against V1 race scenarios before any UI.

### Tasks

- [x] **0.1** Add dependencies: `xstate@^5.31.1`, `@xstate/react@^6.1.0`. **`@xstate/test` deferred** — uses `createActor` + `vi.useFakeTimers()` instead.
- [x] **0.2** Create `src/features/active-session/` scaffold
- [x] **0.3** Define `ActiveSessionContext`, events, and guards in `machines/types.ts`
- [x] **0.4** Implement `active-session.machine.ts` (hydrating → active ↔ autosaving → finishing → closing → completed)
- [x] **0.5** Implement `persistence.actor.ts` with injectable adapter; production adapter in Phase 2
- [x] **0.6** Port V1 concurrency scenarios to machine tests (all pass; suite now 43 tests across 6 files)
- [x] **0.7** Link from [views/README.md](./views/README.md)

### Acceptance criteria

- [x] `pnpm exec vitest run src/features/active-session` — green (43 tests)
- [x] `pnpm exec tsc --noEmit` — clean
- [x] No React components at initial ship (Phase 1 added UI)

---

## Phase 1 — Session route shell

**Status:** **Shipped** (`b5d6a9b`, launch guardrails `c8eb1ca`)  
**Depends on:** Phase 0  
**Goal:** Dedicated route with minimal UI; **opt-in** feature-flagged entry alongside unchanged WorkoutPlayer default.

### Tasks

- [x] **1.1** Route: `src/app/(dashboard)/app/[workspace_id]/session/[task_id]/page.tsx`
- [x] **1.2** Minimal `layout.tsx`; `WorkspaceShellGate` skips `DashboardShell`
- [x] **1.3** `ActiveSessionShell.tsx` — VM hydrate, `useActiveSession`
- [x] **1.4** `SessionLogSurface` — reuses `WorkoutPlayerBlockList`
- [x] **1.5** `SessionHUD` — elapsed from machine context
- [x] **1.6** Env flag: `NEXT_PUBLIC_ACTIVE_SESSION_ROUTE=1`
- [x] **1.7** Parallel launch paths (Kanban, class board, task modal) when flag ON
- [x] **1.7a** Task modal launch guardrails — `resolve-active-session-launch-ui.ts`, Save & Start, `notFound()` when flag off
- [x] **1.8** Query params: `?from=`, `?class_instance_id=`, `?sessionId=`, `?return=`
- [x] **1.9** Exit: `safeNextPath(?return=)` / `router.back()` on abandon; `router.replace` workspace on finish

### Acceptance criteria

- [x] Route renders block list + elapsed for rich Tabata/EMOM cards
- [x] Dashboard unmounts on session route
- [x] Flag OFF → WorkoutPlayer modal unchanged
- [x] Flag ON → session route available as alternative
- [x] Mobile: full-screen, no Radix dialog

---

## Phase 2 — Persistence + Coach actors

**Status:** **Shipped** (`0c81509` persistence/finish, `0f17dc4` Coach sync, **2.5** abandon nav, **2.7** exit-flow RTL)  
**Depends on:** Phase 1  
**Goal:** Move autosave, finish, sentinel, and execution_patch out of V1 effects into machine actors.

**Shipped:** Production `createProductionPersistenceAdapter` + `createProductionFinishWorkoutRunner`; client draft recovery via `recoverWorkoutSessionLogs`; editable `SessionLogSurface`; `coach-sync.actor.ts` + `useActiveSessionCoachBridge` + `SessionCoachPane` (V1-parity sentinel + `execution_patch` → `COACH_PATCH`; historical replay skipped before `sessionStartedAt`).

### Tasks

- [x] **2.1** `persistence.actor.ts` production path — draft INSERT/UPDATE, `AUTOSAVE_DONE` / `AUTOSAVE_FAILED`
- [x] **2.2** `finishing` state — `buildWorkoutLogFinishMetadata`, assignee sync
- [x] **2.3** `coach-sync.actor.ts` + bridge — sentinel, patch scan, fingerprint dedupe
- [x] **2.4** `SessionCoachPane.tsx` — thin `WorkoutCoachRail` wrapper
- [x] **2.6** Route path does **not** use `registerWorkoutPlayerExecutionPatchApplier` — Coach patches flow via `coach-sync` actor (V1 modal still uses the bridge intentionally)
- [x] **2.5** **Abandon nav polish** — `ActiveSessionShell` defers abandon navigation until `snapshot.status === 'done'`; Back disabled during `closeQueued`/`closing`; optional HUD "Saving…" label
- [x] **2.7** **Integration tests** — RTL shell tests for abandon flush-then-navigate and finish routing (`ActiveSessionShell.exit-flows.test.tsx`)

### Acceptance criteria

- [x] Finish after autosave draft → one `completed` log, no orphan `in_progress`
- [x] Coach patch applies when Coach tab not visible — `COACH_PATCH` via machine; session-scoped only
- [x] Close mid-session → draft reliably flushed before navigation (**2.5**)
- [x] Machine tests pass against production actor shapes (mocked Supabase)

---

## Phase 2.5 — Playbook Architecture & Workout Logs Routing

**Status:** **Core shipped** (`4a465cf`, V1 parity 2.5.5) · **Ops remaining (2.5.2 deploy)**  
**Depends on:** Phase 2 first half (**met**)  
**Goal:** Route Active Session execution logs to Workout Logs bubble; seed playbook taxonomy.

**Shipped:** `resolveWorkoutLogsBubbleId`; `target_bubble_id` on session payload; persistence + finish scoped to Workout Logs bubble; fitness seed (Workout Logs bubble, Active Split, Vault, **In Progress** column); backfill + `in_progress` column migration **files**; Kanban personalization; draft **In progress** badge on Kanban/chat/modal.

### Playbook column taxonomy (fitness workspace `board_columns`)

Shared across fitness Kanban surfaces (Workouts templates, Workout Logs, etc.). **`in_progress`** groups draft `workout_log` rows on **Workout Logs**; template columns apply to **Workouts**.

| Slug          | Playbook label | Semantics                                                                       |
| ------------- | -------------- | ------------------------------------------------------------------------------- |
| `planned`     | Active Split   | Templates in current rotation                                                   |
| `scheduled`   | Scheduled      | Future-dated templates                                                          |
| `today`       | Today          | Promoted scheduled-for-today                                                    |
| `in_progress` | In Progress    | Active Session / WorkoutPlayer draft logs (`workout_log`, status `in_progress`) |
| `completed`   | Completed      | Finished logs (Workout Logs bubble receives session telemetry)                  |
| `vault`       | Vault          | Retired templates (manual only; finish never auto-moves templates here)         |

### Tasks

- [x] **2.5.1** Fitness seed columns — Vault + Active Split label + **In Progress** (`in_progress`) for draft logs
- [ ] **2.5.2** **Deploy** `supabase/migrations/20260830120000_backfill_fitness_workout_logs_bubble.sql` and `20260526000000_add_in_progress_column_fitness.sql` to all envs
- [x] **2.5.3** Playbook rule documented — finish never updates source template column
- [x] **2.5.4** Dogfood: Active Session finish → log in Workout Logs → Completed; template unchanged
- [x] **2.5.5** **V1 parity** — route `WorkoutPlayer` draft/finish INSERTs via `resolveWorkoutLogsBubbleId` / `logBubbleId` (Active Session path already uses `target_bubble_id`)
- [x] **2.5.6** **Draft log visibility** — `in_progress` Kanban column (fitness seed + migration); amber **In progress** badge on Kanban/chat/modal for `workout_log` drafts

### Acceptance criteria

- [x] New fitness workspaces seed Workout Logs bubble + Vault column
- [x] Active Session draft logs land in Workout Logs bubble under **In Progress** (column + badge; existing workspaces need **2.5.2** migration deploy)
- [x] Source workout templates never auto-move on finish

---

## Phase 3 — Ghost UI, readiness denorm, interval nested machines

**Status:** **Shipped** (`61d7292` ghost/denorm · `3c6876e` interval machine + shells · `a107074` visibility catch-up · `fc083b3` interval audio · `bbe389e` declarative interval actions)  
**Depends on:** Phase 2 minimum (**met**)  
**Goal:** Ghost hints, template readiness denorm, EMOM/Tabata/AMRAP as nested XState machines with background suspension.

### Phase 3.0 — Ghost UI + Readiness Denormalization

- [x] **`ghostLogs` matrix** parallel to `draftLogs`
- [x] **`recoverWorkoutSessionLogs` v2-ghost mode** — blank editable drafts; ghost from latest completed log
- [x] **Ghost placeholders** — `Last: …` styling in `WorkoutPlayerExercisePanel`
- [x] **`last_performed_at`** — `finish-workout.actor.ts` UPDATE on source template metadata
- [x] **Stale draft guard** — skip superseded in-progress drafts; delete orphans on finish
- [x] **Tests** — ghost builders, recover v2/v1, finish actor template patch, coach-sync historical skip

**Follow-up (non-blocking):** Kanban card UI reading `last_performed_at`.

### Phase 3.1 — Interval nested machines

- [x] **3.1** `interval-block.machine.ts` — wraps pure timer reducers; START/PAUSE/RESUME/RESET/CLOCK_FRAME/VISIBILITY
- [x] **3.2** Parent spawns `intervalBlock` on `INTERVAL_START`; tears down on FINISH/ABANDON/`BLOCK_INTERVAL_COMPLETE`
- [x] **3.3** Interval shells on route — `SessionLogSurface` passes `useIntervalMachine` + `useActiveSessionIntervalControls` → `TabataIntervalShellMachine` / EMOM / AMRAP machine variants in `WorkoutPlayerBlockList`
- [x] **3.4** `backgroundSuspended` in interval child + `visibility-listener.actor.ts` on parent
- [x] **3.5** `useIntervalShellPolish` on machine shell path (live remaining time for audio cues)
- [x] **3.6** Unit tests — Tabata/EMOM/AMRAP background catch-up, pause/resume, parent `BLOCK_INTERVAL_COMPLETE` notification

### Acceptance criteria

- [x] Tabata interval completes via machine path (unit-tested; manual dogfood recommended)
- [x] Background tab hide → catch-up on resume (unit-tested)
- [x] Single rAF clock per spawned interval child (no duplicate hook loops on machine path)

### Verification

```bash
pnpm exec vitest run src/features/active-session
pnpm exec tsc --noEmit
```

---

## Phase 4 — Telemetry loop (Coach) — **NEXT MAJOR MILESTONE**

**Status:** **Not started**  
**Execution plan:** [active-session-phase4-telemetry-plan.md](./active-session-phase4-telemetry-plan.md) (Sprints **C1–C6**)  
**Depends on:** Phases 2–3 (**met** for machine context + interval snapshots)  
**Goal:** Coach receives live performance (`set_logs`, interval performance), not just prescription.

### Tasks

- [ ] **4.1** Implement `src/features/active-session/contracts/session-telemetry.ts`:
  - `buildSessionTelemetrySnapshot(context)` from machine context + `intervalRowSnapshots`
  - Fingerprint for diff / dedupe before send
- [ ] **4.2** Persist telemetry on autosave: `workout_log.metadata.session_telemetry`
- [ ] **4.3** Attach telemetry to:
  - [ ] Workout-open sentinel metadata
  - [ ] User messages from Coach pane (`metadata.session_telemetry`)
  - [ ] Optional: silent telemetry push on debounced snapshot change (evaluate payload size — Q4)
- [ ] **4.4** Edge: `supabase/functions/agents/coach/context.ts` — parse and inject `SESSION TELEMETRY` block
- [ ] **4.5** Mirror prompt addition in `src/lib/agents/coach/prompts.ts` + `pnpm check:agent-mirror`
- [ ] **4.6** Extend `buildWorkoutLogFinishMetadata` with final `interval_performance` + `performance_summary`
- [ ] **4.7** Tests — snapshot builder, context formatter, integration: logged reps visible to Coach

### Acceptance criteria

- [ ] Coach thread metadata contains `session_telemetry` with done sets after user logs
- [ ] `formatExerciseIndexMap` / SESSION TELEMETRY consistent with `live_set_counts`
- [ ] Finish metadata retains telemetry for history / next-session context

---

## Phase 5 — Optional convergence (deferred)

**Status:** **Deferred**  
**Depends on:** Phases 1–4 complete; product decision  
**Goal:** _If_ product chooses a single execution surface, migrate default launch to session route and retire modal player.

> **Current intent:** Keep both paths. Do **not** remove WorkoutPlayer as part of Phases 0–4.

---

## Rollout & feature flags

| Flag                               | Default                   | Purpose                                           |
| ---------------------------------- | ------------------------- | ------------------------------------------------- |
| `NEXT_PUBLIC_ACTIVE_SESSION_ROUTE` | `0` (WorkoutPlayer modal) | Opt-in session route; no planned prod flip to `1` |

**Dogfood checklist (Active Session path):**

- [x] Solo Kanban start → finish → log in Workout Logs → Completed; template unchanged
- [x] Fresh session after finish → blank inputs with `Last:` ghost placeholders
- [ ] Class board start with `class_instance_id` (wired in code; not formally signed off)
- [ ] Mobile Workout \| Coach tab switch during EMOM
- [ ] Background / lock screen during Tabata on session route (machine-tested; manual sign-off)
- [ ] Coach `execution_patch` while on Workout tab (code path exists; formal sign-off)
- [ ] Network offline during autosave (document behavior; Q1)

---

## Open questions

| #   | Question                                                     | Status                                                                                         |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Q1  | Offline / flaky network: IndexedDB queue for autosave?       | Open — before prod flag flip                                                                   |
| Q2  | Single machine + `classContext` vs two variants?             | **Resolved:** single machine; `classInstanceId` on context (`persistence` + `finish` + bridge) |
| Q3  | Share `intervalBlockMachine` with live-video `SessionDeck*`? | Open — Phase 5+                                                                                |
| Q4  | Telemetry transport: silent message vs poll draft row?       | Open — decide in Phase 4                                                                       |
| Q5  | Server Component task fetch vs client-only?                  | **Resolved:** Server fetch in `page.tsx`; draft recovery client-side                           |
| Q9  | Denormalize `last_performed_at` on finish?                   | **Resolved:** shipped (`61d7292`); Kanban display follow-up                                    |

---

## V1 carry-forward checklist

- [x] `WorkoutSessionViewModel` / `useWorkoutSessionViewModel`
- [x] Pure timer reducers + config-derived catch-up limits
- [x] `buildWorkoutLogDraftMetadata` / `buildWorkoutLogFinishMetadata`
- [x] `resolve-player-log-row-count` / block-aware log rows
- [x] `buildWorkoutCoachRailContext` / `live_set_counts`
- [x] `WorkoutCoachRail` → `SessionCoachPane`
- [ ] `useUserExerciseNotes` — not wired on Active Session (`SessionLogSurface` passes null notes today)

---

## Progress tracker

| Phase | Status           | Key commits                                | Notes                                                              |
| ----- | ---------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| 0     | **Shipped**      | `ade54d5`                                  | XState foundation; 43 Vitest tests today                           |
| 1     | **Shipped**      | `b5d6a9b`, `c8eb1ca`                       | Route, flag, launch guardrails, Save & Start                       |
| 2     | **Shipped**      | `0c81509`, `0f17dc4`                       | Persistence, finish, Coach sync, abandon flush, exit-flow RTL      |
| 2.5   | **Core shipped** | `4a465cf`                                  | Workout Logs routing, draft visibility; **2.5.2 deploy** remaining |
| 3     | **Shipped**      | `61d7292`, `3c6876e`, `a107074`, `fc083b3` | Ghost UI, intervals, visibility, audio                             |
| 4     | **Not started**  | —                                          | Telemetry Loop — **next major milestone**                          |
| 5     | **Deferred**     | —                                          | Side-by-side; convergence TBD                                      |

---

## Changelog

| Date       | Change                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-24 | Initial plan — architecture proposal → execution doc                                                                                                          |
| 2026-05-24 | Coexistence — Active Session side-by-side with WorkoutPlayer; Phase 5 convergence deferred                                                                    |
| 2026-05-24 | **Phase 0 shipped** — XState machine, persistence actor, concurrency tests                                                                                    |
| 2026-05-24 | **Phase 1 shipped** — session route, HUD, feature flag, WorkspaceShellGate                                                                                    |
| 2026-05-24 | **Phase 2 first half shipped** — Supabase persistence/finish, draft recovery, editable log surface (`0c81509`)                                                |
| 2026-05-24 | **Phase 2.5 partial** — Workout Logs bubble routing, playbook seed, backfill migration file (`4a465cf`)                                                       |
| 2026-05-24 | **Phase 2 Coach sync shipped** — `coach-sync.actor`, bridge, `SessionCoachPane` (`0f17dc4`)                                                                   |
| 2026-05-25 | **Phase 3.0 shipped** — Ghost UI, `last_performed_at` denorm (`61d7292`)                                                                                      |
| 2026-05-25 | **Phase 3.1 shipped** — `interval-block.machine.ts`, interval shells on route, visibility catch-up, audio polish (`3c6876e`, `a107074`, `fc083b3`, `bbe389e`) |
| 2026-05-25 | **Plan refresh** — mark Phases 0–3 core complete; true next steps = 2.5.2 deploy, Phase 4 Telemetry                                                           |
| 2026-05-25 | **Phase 2.5.5 shipped** — V1 `WorkoutPlayer` routes workout_log recovery/INSERTs via `resolveWorkoutLogsBubbleId` (`logBubbleId`)                             |
| 2026-05-24 | **Phase 2.5 shipped (2.5)** — `ActiveSessionShell` defers abandon navigation until persistence flush completes; HUD "Saving…" during close                    |
| 2026-05-24 | **Phase 2.7 shipped** — RTL exit-flow tests (`ActiveSessionShell.exit-flows.test.tsx`); shared shell test harness; 43 Vitest tests                            |
| 2026-05-24 | **Phase 2.5.6 shipped** — fitness `in_progress` Kanban column + amber **In progress** badge (`workout-log-task-state.ts`, migration `20260526000000_*`)       |
