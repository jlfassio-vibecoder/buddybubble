# Active Session Engine — Architecture & Execution Plan

**Status:** **Phase 0 shipped** (machine + tests on branch; UI/route not started). XState-driven **Active Session** on a dedicated route. **Coexists** with modal **WorkoutPlayer** (V1); not a replacement.

**Product name:** **Active Session** (not "WorkoutPlayer V2")  
**Engineering module:** `src/features/active-session/`  
**Route:** `/app/[workspace_id]/session/[task_id]`

**Prerequisites:** Parametric Workout Engine Steps 1–9 (shipped) · V1 `WorkoutPlayer` stabilization (refs, autosave hardening, timer catch-up — shipped on `feat/mobile-chat-thread-overlay`)

**Related:** [workout-player.md](./workout-player.md) (V1 reference) · [layout-shell-architecture.md](./views/layout-shell-architecture.md) · [parametric-step6-plan.md](./views/parametric-step6-plan.md) (Coach context / `live_set_counts`) · [rail-composer-tokens.md](../agents/coach/rail-composer-tokens.md)

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

| Layer           | WorkoutPlayer (V1)                                   | Active Session (new path)                                   |
| --------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| **Container**   | Radix dialog / bottom sheet inside `dashboard-shell` | Dedicated Next.js route; dashboard unmounts                 |
| **State**       | React `useState` + refs + effects                    | XState v5 machine + spawned actors                          |
| **Timers**      | React hooks wrapping pure reducers                   | Nested `intervalBlockMachine` wrapping same reducers        |
| **Persistence** | Debounced Supabase client in component               | `persistence` actor; exclusive `autosaving` state           |
| **Coach**       | Lifted sentinel + patch scan; one-way                | `coachSync` actor + **`SessionTelemetrySnapshot`** outbound |
| **Testability** | Full React mount required                            | Machine unit tests without UI                               |

**Bottom line:** Active Session is a **parallel orchestration shell** on a dedicated route. Reuse V1's **pure reducers**, **ViewModel**, and log builders in both paths. **WorkoutPlayer stays the default** launch path until product opts into the route via feature flag.

## Coexistence (current intent)

| Path                   | Container                                 | Default?    | Notes                                                         |
| ---------------------- | ----------------------------------------- | ----------- | ------------------------------------------------------------- |
| **WorkoutPlayer** (V1) | Modal / bottom sheet in `dashboard-shell` | **Yes**     | Production path; continues to receive fixes                   |
| **Active Session**     | `/app/[workspace_id]/session/[task_id]`   | No (opt-in) | `NEXT_PUBLIC_ACTIVE_SESSION_ROUTE=1` on selected launch paths |

Both paths share the same prescription read model, timer reducers, draft/finish metadata builders, and Coach rail context. They differ in **container** (modal vs route) and **orchestration** (React effects vs XState).

---

## Architecture decisions (locked for planning)

| #   | Decision       | Choice                                                                       | Rationale                                                      |
| --- | -------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| D1  | State library  | **XState v5** + `@xstate/react`                                              | Explicit concurrency; matches autosave/finish/background races |
| D2  | Container      | **Route takeover**                                                           | Unmount Kanban/calendar/chat overlay during session            |
| D3  | Timer math     | **Reuse** `emom-timer-engine`, `interval-timer-engine`, `amrap-timer-engine` | Proven; wrap, don't rewrite                                    |
| D4  | Read model     | **Reuse** `WorkoutSessionViewModel`                                          | Block list + flat index unchanged                              |
| D5  | Coach contract | **`SessionTelemetrySnapshot` v1**                                            | Closes progressive-overload blindspot                          |
| D6  | Rollout        | **Feature flag**; **WorkoutPlayer remains default**                          | Side-by-side; no forced cutover                                |

---

## Target file map

**Phase 0 (shipped):**

```
src/features/active-session/
├── machines/
│   ├── active-session.machine.ts      # top-level coordinator (shipped)
│   ├── interval-block.machine.ts        # TODO: Phase 3 stub
│   └── types.ts                         # context, events, guards (shipped)
├── actors/
│   ├── persistence.actor.ts             # debounced autosave fromCallback (shipped)
│   ├── coach-sync.actor.ts              # finishWorkoutActor + Phase 2 coach stub
│   └── session-clock.actor.ts           # Phase 1+ stub
├── __tests__/
│   ├── active-session.machine.test.ts   # V1 scenario replay + concurrency (shipped)
│   ├── persistence.actor.test.ts        # debounce isolation (shipped)
│   └── test-utils/
│       ├── fixtures.ts
│       └── mock-persistence.ts
└── index.ts                             # public re-exports (shipped)
```

**Phase 1+ (not started):**

```
src/features/active-session/
├── contracts/
│   └── session-telemetry.ts             # SessionTelemetrySnapshot v1 (Phase 4)
├── components/
│   ├── ActiveSessionShell.tsx
│   ├── SessionHUD.tsx
│   ├── SessionLogSurface.tsx
│   └── SessionCoachPane.tsx
└── hooks/
    └── useActiveSession.ts              # thin @xstate/react wrapper

src/app/(dashboard)/app/[workspace_id]/session/[task_id]/
├── page.tsx
└── layout.tsx                           # minimal chrome, safe-area
```

**Out of scope (for now):** Deprecating or removing `WorkoutPlayer.tsx`, `workoutPlayerLaunch`, or `workout-player-execution-patch-bridge.ts`. Convergence to a single path is a **future product decision**, not part of Phases 0–4.

---

## XState blueprint (reference)

### Top-level states (Phase 0 implemented)

| State                   | Purpose                                                | Phase 0                   |
| ----------------------- | ------------------------------------------------------ | ------------------------- |
| `hydrating`             | Load units, recover draft, build VM                    | Instant → `active` (stub) |
| `active.logging`        | Default — user editing set grid                        | Shipped                   |
| `active.autosaving`     | **Exclusive** — blocks finish fast-path; queues FINISH | Shipped                   |
| `finishing`             | Finalize log via `finishWorkoutActor`                  | Shipped                   |
| `closing` → `completed` | Terminal                                               | Shipped                   |
| `intervalRunning`       | Nested block timer active                              | Phase 3                   |
| `backgroundSuspended`   | Document hidden; queue clock catch-up                  | Phase 3                   |

### Parallel regions / actors

```
activeSessionMachine
├── persistence      → debounced draft write (2s)     [Phase 0 shipped]
├── finishWorkout    → finalize INSERT/UPDATE           [Phase 0 stub via adapter]
├── coachSync        → sentinel + execution_patch       [Phase 2]
├── sessionClock     → wall-clock elapsed_sec           [Phase 1+]
└── blockExecutor    → nested intervalBlockMachine       [Phase 3]
```

### Guards (Phase 0 — tested)

| Guard                  | Behavior                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `canFinishImmediately` | `FINISH` in `active.logging` → `finishing` when `!autosaveInFlight && !pendingInsert && !autosaveScheduled`  |
| `finishQueued`         | After `AUTOSAVE_DONE`, transition to `finishing` if user pressed FINISH during autosave                      |
| `closeQueued`          | After `AUTOSAVE_DONE`, transition to `closing` on ABANDON flush                                              |
| **Fail-stop**          | `AUTOSAVE_FAILED` + `finishQueued` → `active.logging` (clear queue, set `autosaveError`); **no** `finishing` |
| **Insert lock**        | Persistence actor rejects second INSERT when `pendingInsert` (actor + `setAutosaveInFlight`)                 |

Phase 3+: `VISIBILITY` → `catchUpAllTimers` before resume.

---

## Data contract: SessionTelemetrySnapshot v1

**Purpose:** Close-loop Coach context — actual logged performance, not just prescription.

**Stored in:**

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

| Phase | Theme                              | Est.   | Ship criteria                                                   |
| ----- | ---------------------------------- | ------ | --------------------------------------------------------------- |
| **0** | XState foundation + machine tests  | 1–2 wk | **Shipped** — 15 Vitest tests; no UI                            |
| **1** | Session route shell + feature flag | 1 wk   | Route loads workout; V1 remains default                         |
| **2** | Persistence + Coach actors         | 2 wk   | Autosave/finish/sentinel/patch in machine; flag ON for internal |
| **3** | Interval nested machines           | 1 wk   | EMOM/Tabata/AMRAP on route; background catch-up modeled         |
| **4** | Telemetry loop (Coach)             | 1–2 wk | Coach sees `set_logs` + interval performance in context         |
| **5** | Optional convergence (deferred)    | TBD    | Only if product later chooses a single execution path           |

**Total (Phases 0–4):** ~5–8 weeks with testing and staged rollout. Phase 5 is **deferred** — WorkoutPlayer and Active Session continue side-by-side until explicitly revisited.

---

## Phase 0 — Foundation (machine only)

**Status:** **Shipped** (branch `feat/active-session-engine`; implementation commit pending push)  
**Goal:** Prove XState model against V1 race scenarios before any UI.

### Tasks

- [x] **0.1** Add dependencies: `xstate@^5.31.1`, `@xstate/react@^6.1.0` (Next 16 / React 19 compatible). **`@xstate/test` deferred** — peer dep targets XState v4; Phase 0 uses `createActor` + `vi.useFakeTimers()` instead.
- [x] **0.2** Create `src/features/active-session/` scaffold (machines, actors, tests, `index.ts`; no UI/route)
- [x] **0.3** Define `ActiveSessionContext`, events, and guards in `machines/types.ts` (`canFinishImmediately`, `finishQueued`, `closeQueued`; `autosaveScheduled`, `finishError`)
- [x] **0.4** Implement `active-session.machine.ts`:
  - States: `hydrating` → `active.logging` ↔ `active.autosaving` → `finishing` → `closing` → `completed`
  - FINISH fast-path when idle; queue + flush when autosave pending; fail-stop on `AUTOSAVE_FAILED`
- [x] **0.5** Implement `persistence.actor.ts` as `fromCallback` debounce (`AUTOSAVE_MS = 2000`) with injectable `PersistenceAdapter`; default `createNoOpPersistenceAdapter()` (Phase 2 Supabase path TBD)
- [x] **0.6** Port V1 scenarios to machine tests (15 tests green):

| Scenario                               | Expected                                            | Test status |
| -------------------------------------- | --------------------------------------------------- | ----------- |
| Autosave INSERT then FINISH            | Single finalize UPDATE, no orphan draft             | Pass        |
| Concurrent FINISH + debounced autosave | Finish waits; uses `logTaskId` from context         | Pass        |
| FINISH while autosaving                | Queued until `AUTOSAVE_DONE`; fail-stop on error    | Pass        |
| ABANDON mid-session                    | Flush once; no duplicate INSERT                     | Pass        |
| Sentinel failure                       | Retry allowed (not permanently fired)               | Pass        |
| Fast-path FINISH (idle)                | Skips autosave when nothing pending                 | Pass        |
| Finish finalize failure                | `finishError` surfaced; returns to `active.logging` | Pass        |

- [ ] **0.7** Link from [views/README.md](./views/README.md) — doc edit staged locally; commit with Phase 0 code

### Acceptance criteria

- [x] `pnpm exec vitest run src/features/active-session` — 15 tests green
- [x] `pnpm exec tsc --noEmit` — clean
- [x] No React components shipped; no route added yet

### Verification

```bash
pnpm exec vitest run src/features/active-session
pnpm exec tsc --noEmit
```

---

## Phase 1 — Session route shell

**Status:** Not started  
**Depends on:** Phase 0  
**Goal:** Dedicated route with minimal UI; **opt-in** feature-flagged entry alongside unchanged WorkoutPlayer default.

### Tasks

- [ ] **1.1** Add route: `src/app/(dashboard)/app/[workspace_id]/session/[task_id]/page.tsx`
- [ ] **1.2** Add minimal `layout.tsx` — full viewport, safe-area, no Kanban chrome
- [ ] **1.3** Implement `ActiveSessionShell.tsx`:
  - Load task row + metadata server-side or client `createClient` (match V1 auth patterns)
  - `useWorkoutSessionViewModel(metadata)` — unchanged
  - Wire `useActiveSession` provider
- [ ] **1.4** Implement read-only `SessionLogSurface` (port `WorkoutPlayerBlockList` props)
- [ ] **1.5** Implement `SessionHUD` — wall-clock elapsed from machine context
- [ ] **1.6** Add env flag: `NEXT_PUBLIC_ACTIVE_SESSION_ROUTE=1`
- [ ] **1.7** Add **parallel** launch paths (flag ON only; flag OFF keeps existing modal):
  - [ ] `dashboard-shell.tsx` `handleStartWorkout` → `router.push(.../session/[id])` when flag set
  - [ ] Class board start handler (same flag gate)
  - [ ] Task modal: optional **Start Active Session** entry (WorkoutPlayer triggers unchanged when flag OFF)
- [ ] **1.8** Query params: `?from=kanban|class|modal`, `?class_instance_id=`, `?sessionId=` — preserve V1 props
- [ ] **1.9** Exit: `router.back()` or `?return=` URL on abandon; `router.replace` workspace on finish (stub OK in Phase 1)

### Acceptance criteria

- [ ] Route renders block list + elapsed for a rich Tabata/EMOM card
- [ ] Dashboard **unmounts** when session route active (verify React DevTools / no Kanban hooks firing)
- [ ] Flag OFF → WorkoutPlayer modal unchanged (default production path)
- [ ] Flag ON → session route available as an **alternative**; both paths can coexist in the same build
- [ ] Mobile: full-screen, no Radix dialog

### Verification

```bash
pnpm exec tsc --noEmit
pnpm run dev
# Manual: Kanban → Start (flag ON) → session route → back → dashboard restores
```

---

## Phase 2 — Persistence + Coach actors

**Status:** Not started  
**Depends on:** Phase 1  
**Goal:** Move autosave, finish, sentinel, and execution_patch out of V1 effects into machine actors.

### Tasks

- [ ] **2.1** Implement `persistence.actor.ts` production path:
  - Reuse `buildWorkoutLogDraftMetadata`, `createClient`, draft INSERT/UPDATE
  - Emit `AUTOSAVE_DONE { logTaskId }` | `AUTOSAVE_FAILED`
- [ ] **2.2** Implement `finishing` state:
  - Reuse `buildWorkoutLogFinishMetadata`, `finalLogId` from context (not stale React state)
  - `syncAssignees` via existing `replaceTaskAssigneesWithUserIds`
- [ ] **2.3** Implement `coach-sync.actor.ts`:
  - Own `useMessageThread` subscription (single instance on route)
  - Sentinel send with retry on failure
  - Scan Coach messages → `COACH_PATCH` events with fingerprint dedupe
- [ ] **2.4** Implement `SessionCoachPane.tsx` — consume prebuilt thread from machine/coach actor (port `WorkoutCoachRail` UI, no local thread hook)
- [ ] **2.5** Implement `handleClose` equivalent as `closing` state:
  - Clear debounce, await in-flight autosave, flush, navigate
  - `setClosing` equivalent = machine `closing` state (no stuck UI)
- [ ] **2.6** Delete pattern: no `registerWorkoutPlayerExecutionPatchApplier` on route path
- [ ] **2.7** Integration tests: autosave + finish + coach patch apply on route (Playwright or RTL)

### Acceptance criteria

- [ ] Finish after autosave draft → one `completed` log, no orphan `in_progress`
- [ ] Coach patch applies when Coach tab not visible (mobile Workout tab)
- [ ] Close mid-session → draft flushed
- [ ] Machine tests from Phase 0 still pass against production actors (with mocked Supabase)

### Verification

```bash
pnpm exec vitest run src/features/active-session
pnpm exec tsc --noEmit
# Manual: full finish flow, coach patch mid-session, close without finish
```

---

## Phase 3 — Interval nested machines

**Status:** Not started  
**Depends on:** Phase 2  
**Goal:** Model EMOM/Tabata/AMRAP as nested machines; explicit background suspension.

### Tasks

- [ ] **3.1** Implement `interval-block.machine.ts`:
  - Wrap `emomTimerReducer` / `intervalTimerReducer` / `amrapTimerReducer`
  - Events: `START`, `TICK`, `PAUSE`, `RESUME`, `RESET`
  - On `done` → parent `BLOCK_INTERVAL_COMPLETE`
- [ ] **3.2** Parent machine: spawn `blockExecutor` when user enters interval block; tear down on block exit
- [ ] **3.3** Port interval shells to route:
  - `TabataIntervalShell`, `EmomIntervalShell`, `AmrapIntervalShell` — read snapshot from machine, not local hooks
- [ ] **3.4** Implement `backgroundSuspended` state:
  - `visibilitychange` → `VISIBILITY` event
  - On resume: `catchUpAllTimers(now)` using config-derived step limits (see V1 fix)
- [ ] **3.5** Port audio / wake-lock polish via `use-interval-shell-polish` (unchanged hook OK if driven by machine snapshot)
- [ ] **3.6** Unit tests: background 3-minute jump → correct round/phase on resume

### Acceptance criteria

- [ ] Tabata 8-round workout completes correctly on session route
- [ ] Background app 2+ minutes → timer catches up in one tick cycle
- [ ] No duplicate rAF loops from orphaned hook instances

### Verification

```bash
pnpm exec vitest run \
  src/lib/workout-factory/interval-timer \
  src/features/active-session
pnpm exec tsc --noEmit
```

---

## Phase 4 — Telemetry loop (Coach)

**Status:** Not started  
**Depends on:** Phase 2 (minimum); Phase 3 for interval_performance  
**Goal:** Coach Hop 1 receives live performance, not just prescription.

### Tasks

- [ ] **4.1** Implement `contracts/session-telemetry.ts`:
  - `buildSessionTelemetrySnapshot(context)` from machine context
  - Fingerprint for diff / dedupe before send
- [ ] **4.2** Persist telemetry on autosave: `workout_log.metadata.session_telemetry`
- [ ] **4.3** Attach telemetry to:
  - [ ] Workout-open sentinel metadata
  - [ ] User messages from Coach pane (`metadata.session_telemetry`)
  - [ ] Optional: silent telemetry push on debounced snapshot change (evaluate payload size)
- [ ] **4.4** Edge: `supabase/functions/agents/coach/context.ts` — parse and inject `SESSION TELEMETRY` block
- [ ] **4.5** Mirror prompt addition in `src/lib/agents/coach/prompts.ts` + `pnpm check:agent-mirror`
- [ ] **4.6** Extend `buildWorkoutLogFinishMetadata` to include final `interval_performance` + `performance_summary`; fix `workout_type` omission on finish if still present
- [ ] **4.7** Tests:
  - [ ] Snapshot builder unit tests
  - [ ] Context formatter includes completed set_logs
  - [ ] Integration: log 3 sets → Coach reply references actual reps

### Acceptance criteria

- [ ] Coach thread metadata contains `session_telemetry` with done sets after user logs
- [ ] `formatExerciseIndexMap` / SESSION TELEMETRY consistent with `live_set_counts`
- [ ] Finish metadata retains telemetry for history / next-session context

### Verification

```bash
pnpm exec vitest run \
  src/features/active-session/contracts \
  src/lib/workout-factory/build-workout-log-finish-metadata.test.ts \
  supabase/functions/agents/coach/context.test.ts  # add if missing

pnpm check:agent-mirror
pnpm exec tsc --noEmit
```

---

## Phase 5 — Optional convergence (deferred)

**Status:** **Deferred** — not planned while WorkoutPlayer and Active Session run side-by-side  
**Depends on:** Phases 1–4 complete; product decision to consolidate to one path  
**Goal:** _If_ product later chooses a single execution surface, migrate default launch to the session route and retire the modal player.

> **Current intent:** Keep both paths. Do **not** remove WorkoutPlayer or force route-only launch as part of Phases 0–4.

### Tasks (only if convergence is approved)

- [ ] **5.1** Decide default: route vs modal (or keep both indefinitely)
- [ ] **5.2** If route-only: default `NEXT_PUBLIC_ACTIVE_SESSION_ROUTE=1` in production env
- [ ] **5.3** If route-only: remove `workoutPlayerLaunch` + `<WorkoutPlayer />` from `dashboard-shell.tsx`
- [ ] **5.4** If route-only: remove or redirect `WorkoutPlayerTriggers` to session route
- [ ] **5.5** If route-only: delete `workout-player-execution-patch-bridge.ts` if no other consumers (grep first)
- [ ] **5.6** If route-only: archive `WorkoutPlayer.tsx` → `_deprecated/` or delete after soak
- [ ] **5.7** Update docs to reflect chosen default(s)

### Acceptance criteria (convergence only)

- [ ] Documented product decision on single vs dual path
- [ ] If converged: all chosen entry points land on session route; modal removed
- [ ] If dual path retained: both paths documented in [workout-player.md](./workout-player.md) and this plan

---

## Rollout & feature flags

| Flag                               | Phase | Default                   | Purpose                                                                          |
| ---------------------------------- | ----- | ------------------------- | -------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_ACTIVE_SESSION_ROUTE` | 1+    | `0` (WorkoutPlayer modal) | Opt-in session route alongside modal; no planned flip to `1` while paths coexist |

**Dogfood checklist (Active Session path, Phases 1–4):**

- [ ] Solo Kanban start → finish → log appears on board
- [ ] Class board start with `class_instance_id`
- [ ] Mobile Workout \| Coach tab switch during EMOM
- [ ] Background / lock screen during Tabata
- [ ] Coach execution_patch while on Workout tab
- [ ] Network offline during autosave (document behavior; fix in follow-up if needed)

---

## Open questions (resolve before Phase 2–4)

| #   | Question                                                     | Owner       | Decision deadline   |
| --- | ------------------------------------------------------------ | ----------- | ------------------- |
| Q1  | Offline / flaky network: IndexedDB queue for autosave?       | Eng         | Before Phase 2 ship |
| Q2  | Single machine + `classContext` input vs two variants?       | Eng         | Phase 1             |
| Q3  | Share `blockExecutor` with live-video `SessionDeck*`?        | Eng         | Phase 3             |
| Q4  | Telemetry transport: silent message vs poll draft row only?  | Eng + Coach | Phase 4             |
| Q5  | Server Component task fetch on session route vs client-only? | Eng         | Phase 1             |

---

## V1 carry-forward checklist (do not rewrite)

- [x] `WorkoutSessionViewModel` / `useWorkoutSessionViewModel`
- [x] Pure timer reducers + config-derived catch-up limits
- [x] `buildWorkoutLogDraftMetadata` / `buildWorkoutLogFinishMetadata`
- [x] `resolve-player-log-row-count` / block-aware log rows
- [x] `buildWorkoutCoachRailContext` / `live_set_counts`
- [x] `WorkoutCoachRail` composer UI (rehost as `SessionCoachPane`)
- [ ] `useUserExerciseNotes` — wire in Phase 1 detailed view

---

## Progress tracker

Update this table as phases ship.

| Phase | Status      | Shipped commit / PR               | Notes                                                        |
| ----- | ----------- | --------------------------------- | ------------------------------------------------------------ |
| 0     | **Shipped** | `a969f70` (plan only); code local | Machine + 15 Vitest tests; commit code + `package.json` next |
| 1     | Not started | —                                 | **Next** — session route shell + feature flag                |
| 2     | Not started | —                                 |                                                              |
| 3     | Not started | —                                 |                                                              |
| 4     | Not started | —                                 |                                                              |
| 5     | Deferred    | —                                 | Side-by-side; convergence TBD                                |

---

## Changelog

| Date       | Change                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-24 | Initial plan — architecture proposal → execution doc                                                                            |
| 2026-05-24 | Coexistence — Active Session side-by-side with WorkoutPlayer; Phase 5 convergence deferred                                      |
| 2026-05-24 | **Phase 0 shipped** — XState machine, persistence actor, concurrency tests; polish (fail-stop, fast-path FINISH, `finishError`) |
