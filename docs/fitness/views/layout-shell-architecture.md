# Layout, View State & Shell Architecture

This document describes how the dashboard shell manages **which surface the user sees** (Messages, Board, Calendar, split layouts) on **desktop vs. mobile**, how that state is **hydrated** from persistence, and the **safe patterns** for routing users to a specific view (for example after login).

It also covers how the **WorkoutPlayer** full-screen overlay mounts from the shell without participating in desktop focus mode or mobile `?tab=` routing.

**Related (workout prescription / parametric blocks, not shell layout):**

- [Workout UI landscape audit](./README.md) — every surface that reads or executes workouts
- [parametric-step1-2-plan.md](./parametric-step1-2-plan.md) — metadata sync contract + `WorkoutSessionViewModel`
- [parametric-step3-plan.md](./parametric-step3-plan.md) — block-aware WorkoutPlayer P0 (shipped)
- [workout-player.md](../workout-player.md) — player props, finish flow, triggers

---

## Grounded in code

It is grounded in the current implementation in:

- `src/components/dashboard/dashboard-shell.tsx` — primary shell: collapse state, hydration, mobile vs. desktop branching, `LayoutCommandContext`, and composition of `WorkspaceMainSplit`
- `src/lib/layout-collapse-keys.ts` — per-workspace `localStorage` key helpers for rail/split/collapse preferences
- `src/components/dashboard/workspace-main-split.tsx` — resizable Messages | Board row; receives collapse flags from the shell and applies layout (strips, hidden stages, calendar slot injection)

Related types and entry points:

- `DesktopFocusMode` — `src/components/layout/desktop-view-switcher.tsx`
- Layout commands API — `src/components/layout/layout-command-context.tsx`
- Mobile tab normalization — `src/lib/mobile-crm-tab.ts` (`normalizeMobileTab`)

---

## Overview

### What “Desktop Focus Mode” actually is

**`DesktopFocusMode` is not stored anywhere.** It is a **derived projection** of three boolean collapse flags owned by the shell:

- `chatCollapsed`
- `kanbanCollapsed`
- `calendarCollapsed`

The shell computes `desktopFocusModeActive` from those flags (only when not in mobile layout and not in embed mode). Mappings in code:

| Mode       | Condition (simplified)                                        |
| ---------- | ------------------------------------------------------------- |
| `chat`     | Messages expanded, Kanban collapsed                           |
| `board`    | Messages collapsed, Kanban expanded, calendar strip collapsed |
| `calendar` | Messages collapsed, Kanban collapsed, calendar expanded       |
| `split`    | Messages and Kanban both expanded, calendar strip collapsed   |

If the triple does not match any row above, the switcher shows **no** active mode (`null`).

The **desktop view switcher** calls into the same transitions as programmatic layout commands; it does not maintain a parallel “mode” state machine.

### Shell invariants and derived calendar collapse

The shell enforces constraints so the UI never lands in an empty main stage:

- Collapsing **chat** forces **Kanban** open (at least one of Messages or Kanban stays meaningful).
- Collapsing **Kanban** forces **chat** open.
- Collapsing the **calendar** strip forces **Kanban** open and bumps board column expansion so the stage is not toolbar-only.

**Calendar rail collapse is partly derived:** when Kanban is hidden (`kanbanCollapsed === true`), the calendar rail is treated as **not** strip-collapsed (`calendarRailIsCollapsed` is forced to `false`) so invariants stay consistent even if raw `calendarCollapsed` state were stale.

`WorkspaceMainSplit` receives `calendarRailIsCollapsed` (not the raw `calendarCollapsed` flag) as `calendarCollapsed` for layout math and calendar injection.

---

## The Truth Hierarchy (Desktop vs. Mobile)

### Desktop (`md` and up, non-embed)

**Source of truth:** `localStorage` (per workspace via keys in `layout-collapse-keys.ts`) **plus** user actions that update React state and then sync back to `localStorage`.

- Chat / Kanban / calendar strip preferences use `chatCollapsedStorageKey`, `kanbanCollapsedStorageKey`, and `calendarCollapsedStorageKey` (all scoped by `workspaceId`).
- Additional shell chrome (workspace rail, bubble sidebar, dock splits, etc.) uses other helpers in the same module.

**User-driven updates:** toggles and `LayoutCommands` update React state; **effects that persist only run after `layoutHydrated` is true** so the first paint does not fight the hydrate read.

**URL on desktop:** `?tab=` and `?view=messages` participate in **initial hydrate** and deep-link behavior (see Hydration Rules), but ongoing desktop focus is not “owned” by the query string the way mobile tabs are.

### Mobile (narrow viewport, non-embed)

**Source of truth for which tab is visible:** the URL search param **`?tab=`**, normalized by `normalizeMobileTab` in `mobile-crm-tab.ts` to one of `chat` | `board` | `calendar` (invalid or missing values default to **`chat`**).

The shell sets `layoutMobile` from viewport width (`useIsNarrowBelowMd`) and `embedMode` from `?embed=true`. On mobile, **tab bar navigation** updates the URL (same pattern as layout commands: `router.replace` with preserved query params).

**Collapse flags still exist on mobile** and are set in the **same hydrate `useLayoutEffect`** as desktop (via [`resolveDashboardLayoutCollapse`](../../../src/lib/dashboard-layout-collapse.ts)): on narrow viewports, **`?tab=` wins over `?view=`** (e.g. login defaults append `view=messages` but `tab=board` must not keep Messages layout), and the pair overrides localStorage for the collapse triplet. **`setTab('board' | 'calendar')` strips `view`** so stale deep-link params do not fight the tab bar. **Do not treat collapse booleans as the mobile source of truth**—they follow the URL at hydrate time.

---

## Hydration Rules

### The `layoutHydrated` gate

`layoutHydrated` is **`layoutHydratedWorkspaceId === workspaceId`**. It becomes true after the shell’s hydrate **`useLayoutEffect`** runs for the current workspace. That effect:

1. Reads workspace rail and bubble sidebar from `localStorage`.
2. Calls **`resolveDashboardLayoutCollapse`** with `urlTab`, `urlView`, `narrowViewport`, and stored collapse keys.
3. On **narrow** viewports: maps `normalizeMobileTab(urlTab)` to the mobile CRM collapse triplet (URL wins over LS for chat/kanban/calendar).
4. On **wide** viewports: messages deep links, first-visit desktop default, or parsed LS + invariants (unchanged desktop behavior).
5. Sets React collapse state, then **`setLayoutHydratedWorkspaceId(workspaceId)`**.

Re-runs when **`workspaceId`**, **`urlTab`**, **`urlView`**, or **`narrowViewport`** change (fixes mobile Board tab stuck after workspace switch).

### Why the gate exists

Until hydration completes:

- **Persistence effects do not run** — nothing writes chat/Kanban/calendar (or rails) back to `localStorage` from initial default React state. That avoids **double-writes** and clobbering saved prefs on refresh.
- **Layout commands no-op** (`focusMessages`, `focusBoard`, etc. return early if `!layoutHydrated`).
- **Desktop view switcher** is disabled until hydrated — avoids clicking transitions before state matches storage.
- Other behaviors (e.g. live-video rail auto-collapse, storefront auto-open hooks) also key off `layoutHydrated` so they do not run against pre-hydrate guesses.

Together, this reduces **UI flash** (e.g. default layout briefly shown then snapping to `localStorage`) and keeps **storage and UI** aligned.

### `WorkspaceMainSplit` local hydration

`WorkspaceMainSplit` maintains its own small **`hydrated`** flag for **chat panel pixel width** (`buddybubble.chatWidth.${workspaceId}`). It reads width once, then persists resizes only after that—same “read first, then write” idea as the shell gate, scoped to the split handle.

---

## The “Mobile Blast Radius”

**Risk:** Treating `chatCollapsed` / `kanbanCollapsed` / `calendarCollapsed` as the primary control on mobile—or updating them without updating **`?tab=`**—creates **desync**:

1. **URL vs. collapse mismatch:** Mobile UX is driven by `normalizeMobileTab(searchParams.get('tab'))`. If code collapses panels but leaves `?tab=board`, the next render or tab bar may still reflect “board” while strips/stages show something else.
2. **localStorage pollution:** After `layoutHydrated`, desktop persistence effects write collapse booleans to `localStorage`. Mutating collapse on mobile in ways that **don’t** match how desktop interprets tabs can leave **saved desktop prefs** inconsistent with what the user thought they chose on phone.
3. **Effects ordering:** A single hydrate path applies mobile rules when `narrowViewport` is true—no secondary effect to race.
4. **Deep links:** `?tab=chat` and `?view=messages` are handled inside `resolveDashboardLayoutCollapse` on the appropriate viewport branch.

**Rule of thumb:** On mobile, **change the URL first** (`router.replace` with `tab` set) for any intentional navigation to Messages / Board / Calendar. The hydrate `useLayoutEffect` maps that to collapse state. Avoid ad-hoc `setChatCollapsedState` / `setKanbanCollapsedState` from feature code on narrow viewports unless you fully control URL and understand persistence side effects.

---

## Layout Command Strategy (Next Steps)

### What exists today

`DashboardShell` exposes **`LayoutCommands`** via `LayoutCommandContext` (`useLayoutCommands`):

- `focusMessages`
- `focusBoard`
- `focusCalendar`
- `focusSplit` (on mobile, maps to **board** as the closest multi-pane surface)

Each command already implements the required **branch**:

- **Mobile:** `router.replace` with updated search params (`tab` set to `chat`, `board`, or `calendar`), preserving other params.
- **Desktop:** updates the three collapse states (and related UX like `boardStripExpandNonce`, bubble rail) directly—no reliance on `?tab=` for ongoing focus.

Commands **respect** `layoutHydrated` and **no-op** in `embedMode`.

### Pattern for post-login (or any global) routing

When sending a user to a specific shell view after auth or from a notification:

1. **Wait until the user is under `DashboardShell`** (or equivalent provider) so `useLayoutCommands` is wired—not `silentNoopLayoutCommands`.
2. **Prefer calling the existing layout commands** rather than duplicating collapse logic. That keeps desktop invariants and mobile URL updates in one place.
3. If the redirect runs **before** hydration completes, accept that commands **no-op** until `layoutHydrated` is true; schedule the focus **after** shell mount/hydrate (e.g. effect keyed on hydrated + user id) or encode the intent in **`?tab=`** / `?view=messages` on the **initial** navigation URL so the hydrate path applies it.
4. **Never** assume a single code path for “open board”: always branch mentally **mobile URL vs. desktop collapse** (even if the API hides that behind `focusBoard`).

### Documentation-only note

This README does not change runtime behavior. Future code should **extend** `LayoutCommands` (or a thin facade) for new targets rather than scattering `router.replace` and `localStorage` writes across features.

---

## WorkoutPlayer overlay (fitness shell integration)

### Relationship to layout state

`WorkoutPlayer` is a **modal overlay** (Radix dialog / mobile bottom sheet). It does **not**:

- Change `DesktopFocusMode` or the three collapse flags
- Update mobile `?tab=`
- Write layout `localStorage` keys

The shell keeps a separate **`workoutPlayerLaunch`** payload (`WorkoutPlayerLaunchPayload | null`). When non-null, it renders `<WorkoutPlayer open … />` as a sibling under the main workspace tree (alongside `TaskModal`, settings modals, etc.).

### Launch paths

| Entry           | Handler / component                                    | What gets passed                                                                                                                                     |
| --------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kanban **Play** | `handleStartWorkout` in `dashboard-shell.tsx`          | Full `task.metadata` (`Json`); optional `workoutData` derived from `metadataFieldsFromParsed(task.metadata).workoutExercises` for class/member flows |
| Class board     | `handleStartWorkoutFromClass`                          | Same, plus `sessionId` and `class_instance_id` on the launch payload                                                                                 |
| Task modal      | `WorkoutPlayerTriggers` in `TaskModalEditorChrome.tsx` | Nested player with forced `mode` (`desktop` \| `mobile`); does not use `workoutPlayerLaunch`                                                         |

Trial gating: `handleStartWorkout` / `handleStartWorkoutFromClass` call `shouldBlockWorkoutForExpiredMemberPreview` and open the trial modal instead of setting launch state.

On close or finish: `setWorkoutPlayerLaunch(null)`; `onComplete` calls `bumpTaskViews` so boards refresh.

### Metadata at the shell boundary (parametric blocks, Steps 1–3)

The shell passes **raw** `tasks.metadata` into `WorkoutPlayer`. Parsing and block layout happen **inside** the player:

- `useWorkoutSessionViewModel(metadata)` → `source`, `blocks[]`, `flatExercises`, `flatCacheStale`
- Rich cards (`source === 'rich'`) render `WorkoutPlayerBlockList` (warmup → main blocks with subtitles → finisher → cooldown)
- Set logging, draft recovery, and `handleFinish` still use **flat global exercise indices** (`flatExercises` + `SetDraft[][]`)

**Play gate (task modal only):** `WorkoutPlayerTriggers` memoizes `buildWorkoutSessionViewModel(metadata)` and returns `null` when `flatExercises.length === 0` (includes factory-derived exercises when `ai_workout_factory` exists but `metadata.exercises` is empty).

**Save / sync contract (not invoked by the shell on play):**

| Module                                                                                                  | Role                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [`sync-workout-metadata.ts`](../../../src/lib/workout-factory/sync-workout-metadata.ts)                 | `deriveFlatExercisesFromMetadata`, `applyFlatWorkoutEditsToMetadata`, order-sensitive `flatExercisesMatchDerived`                              |
| [`item-metadata.ts`](../../../src/lib/item-metadata.ts)                                                 | `buildTaskMetadataPayload` → `finalizeWorkoutMetadataForSave`; strips legacy `linked_program_task_id` / `program_session_key` on workout saves |
| [`parse-task-metadata.ts`](../../../src/lib/parse-task-metadata.ts)                                     | `parseTaskMetadata` (shared parse helper; breaks `item-metadata` ↔ `sync-workout-metadata` import cycle)                                       |
| [`parse-workout-exercises-from-metadata.ts`](../../../src/lib/parse-workout-exercises-from-metadata.ts) | `parseWorkoutExercisesFromMetadata` for `metadata.exercises` only                                                                              |

Manual flat edits (viewer Apply, live deck merge) call `applyFlatWorkoutEditsToMetadata`: factory is **preserved**, main `exerciseBlocks` degrade to a single `straight_sets` “Main” block. Session-only deck merges also strip legacy linkage keys via `stripLegacyWorkoutMetadataKeys`.

### Future shell work (documented elsewhere)

- **WorkoutPlayer + Coach split pane** — not a layout-collapse concern; see [workout-player.md § Architectural assessment](../workout-player.md#architectural-assessment--gap-analysis-2026-04-25)
- **Step 4+ player UX** — interval timers, superset/contrast pairing; see [parametric-step3-plan.md § Out of scope](./parametric-step3-plan.md#out-of-scope-step-4)

---

## Quick reference: key files

| Concern                                  | Location                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| Collapse state, hydrate, mobile URL sync | `src/components/dashboard/dashboard-shell.tsx`                                            |
| WorkoutPlayer launch state & mount       | `src/components/dashboard/dashboard-shell.tsx` (`workoutPlayerLaunch`)                    |
| WorkoutPlayer UI + ViewModel             | `src/components/fitness/WorkoutPlayer.tsx`, `src/hooks/use-workout-session-view-model.ts` |
| Workout metadata sync / finalize         | `src/lib/workout-factory/sync-workout-metadata.ts`, `src/lib/item-metadata.ts`            |
| `localStorage` key names                 | `src/lib/layout-collapse-keys.ts`                                                         |
| Messages / board row layout              | `src/components/dashboard/workspace-main-split.tsx`                                       |
| Focus mode type & switcher UI            | `src/components/layout/desktop-view-switcher.tsx`                                         |
| `useLayoutCommands()` API                | `src/components/layout/layout-command-context.tsx`                                        |
| Mobile tab values                        | `src/lib/mobile-crm-tab.ts`                                                               |

---

## Doc maintenance

| Last updated | Scope                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------- |
| 2026-05-20   | WorkoutPlayer shell integration + parametric metadata cross-links (Steps 1–3, Copilot cycle-break) |
