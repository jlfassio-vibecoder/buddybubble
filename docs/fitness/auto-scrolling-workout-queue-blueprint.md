# Auto-Scrolling Workout Queue (Teleprompter) — Blueprint

**Status:** Phase 1–2 implemented (heuristic + hook; Solo Studio hybrid parent-tile scroll/highlight); Live Video / WorkoutPlayer adapters not yet started  
**Charter:** While a coach records in Solo Studio (and later Live Video / Active Workout), the workout queue should act as a teleprompter: approximate progress from elapsed recording time, then smoothly recenter the list every few exercises so the host rarely touches the UI.  
**Depends on:** Solo Studio recorder (`useSoloStudioRecorder`), huddle queue strip (`WorkoutQueueRegion` → `SessionDeckBuilder`), task prescription JSON (`tasks.metadata` ± `session_task_metadata`), flat exercise derivation (`deriveFlatExercisesFromMetadata` / `WorkoutExercise`).  
**Boundary:** Estimates are **heuristic pacing aids**, not timers of record. Do **not** write estimated progress into `live_session_deck_items` or session state. Do **not** auto-advance interval engines (Tabata/EMOM/AMRAP) from this feature — those already own their own clocks.

---

## Related surfaces

| Surface                                    | Role today                                                             | Teleprompter role                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `WorkoutQueueRegion`                       | Collapsible strip; mounts `SessionDeckBuilder`                         | Keep as chrome; wrap or inject scroll host                                              |
| `SessionDeckBuilder`                       | Horizontal `overflow-x-auto` deck tiles; host/async selection          | Primary Solo Studio scroll target (deck cards **or** flattened exercise chips — see §3) |
| `useSoloStudioRecorder`                    | Exports `elapsedMs` while `status === 'recording'` (cleared otherwise) | Solo Studio teleprompter clock source                                                   |
| `ParticipantWorkoutLogger` / interval HUDs | Set-row highlight via interval FSM                                     | Optional secondary highlight; **not** the v1 scroll driver                              |
| `WorkoutPlayer`                            | Vertical exercise list + `activeSetIndex`                              | Later reuse of the same hook + scroll helper                                            |

---

## 1. Data model facts (locked)

### 1.1 `live_session_deck_items` is an index, not a prescription

Deck rows store **order + optional overlay only**:

| Column                                      | Role                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `id`, `session_id`, `task_id`, `sort_order` | Queue identity / order                                                                |
| `session_task_metadata`                     | Optional jsonb overlay (“Apply to session only”) shallow-merged over `tasks.metadata` |

There are **no** `sets`, `reps`, `duration`, or `exercise_type` columns on the deck table.

### 1.2 Prescription lives in task JSON

Canonical fields (after merge):

| Path                                      | Meaning                                                       |
| ----------------------------------------- | ------------------------------------------------------------- |
| `metadata.workout_type`                   | Free-text session type (e.g. Strength)                        |
| `metadata.duration_min`                   | Authored whole-session minutes (optional)                     |
| `metadata.exercises[]`                    | Flat `WorkoutExercise` rows                                   |
| `metadata.ai_workout_factory.workout_set` | Rich blocks (`blockFormat`, `formatParams`, nested exercises) |

`WorkoutExercise` (see `src/lib/item-metadata.ts`) includes:

- `name`, `sets?`, `reps?` (`number \| string`), `duration_min?`
- `work_seconds?`, `rest_seconds?`, `rounds?`
- Coaching / media fields — **no** `movement_type` field on the flat row

**Movement type** is not on the deck item. Closest existing signals:

1. Exercise **name** (heuristic keyword match — v1)
2. Optional later: `exercise_dictionary.kinetic_chain_type` / `biomechanics` lookup by name (enrichment path already exists for coach cues; do not block v1 on dictionary hydration)

### 1.3 Unit of teleprompter progress

**v1 unit = flattened exercise**, not deck card.

Rationale:

- User ask is “every 2 or 3 **exercises**,” with `sets × reps × baseRepTime` math.
- One deck card often contains many exercises (or a rich block).
- Deck-card-only scrolling would feel coarse and underuse prescription data.

**Pipeline:**

```
SessionDeckSnapshot[]  (sorted)
  → for each card: deriveFlatExercisesFromMetadata(merged metadata)
  → TeleprompterItem[]  (stable id, display name, estimateSec, deckItemId, exerciseIndex)
```

If a card has **zero** flat exercises but has `duration_min` / interval params, emit **one synthetic item** for that card so the queue still advances.

Rich formats (EMOM / Tabata / AMRAP): prefer authored time math over sets×reps when params exist (reuse existing helpers where cheap — e.g. `computeTabataBlockDurationFromParams`). Fallback: flatten to exercises and use the default heuristic.

---

## 2. Task 1 — Exercise duration heuristic

### 2.1 Proposed pure utility

**Location (proposed):** `src/lib/fitness/estimate-exercise-duration.ts`  
**Signature (proposed):**

```ts
type EstimateExerciseDurationInput = {
  name?: string | null;
  sets?: number | null;
  reps?: number | string | null;
  duration_min?: number | null;
  work_seconds?: number | null;
  rest_seconds?: number | null;
  rounds?: number | null;
  /** Optional block format when estimating a synthetic / block-backed item. */
  blockFormat?: string | null;
  formatParams?: Record<string, unknown> | null;
};

function estimateExerciseDurationSec(input: EstimateExerciseDurationInput): number;
function estimateQueueDurationsSec(items: EstimateExerciseDurationInput[]): number[];
function cumulativeDurationsSec(perItemSec: number[]): number[]; // prefix sums
```

No React, no DB, no dictionary fetch in v1.

### 2.2 Heuristic math (priority order)

Evaluate top-down; first match wins.

| Priority | Condition                                                  | Formula (seconds)                                                                                                    |
| -------: | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
|        1 | `duration_min > 0`                                         | `round(duration_min * 60)`                                                                                           |
|        2 | Interval-like: `work_seconds > 0` and (`rounds` or `sets`) | `(work + rest) * roundsOrSets` where `rest = rest_seconds ?? DEFAULT_REST_SEC`, `roundsOrSets = rounds ?? sets ?? 1` |
|        3 | Strength-like: `sets` and parseable `reps`                 | `sets * repsMid * secPerRep(name) + (sets - 1) * restBetweenSetsSec(name)`                                           |
|        4 | Sets only, no reps                                         | `sets * DEFAULT_SET_BUCKET_SEC`                                                                                      |
|        5 | Fallback                                                   | `DEFAULT_EXERCISE_SEC` (**90**)                                                                                      |

**Rep parsing:**

- number → use as-is
- `"8-10"` / `"8–10"` → midpoint `((8+10)/2)`
- `"AMRAP"`, `"max"`, unparsable → treat as `DEFAULT_AMRAP_REPS` (**10**) for pacing only

**Constants (v1 knobs — tune after first Solo Studio dry runs):**

| Constant                        |    Value | Notes                                        |
| ------------------------------- | -------: | -------------------------------------------- |
| `DEFAULT_EXERCISE_SEC`          |       90 | Unknown card / empty prescription            |
| `DEFAULT_SET_BUCKET_SEC`        |       45 | Sets without reps                            |
| `DEFAULT_REST_BETWEEN_SETS_SEC` |       60 | Strength default                             |
| `DEFAULT_REST_SEC` (interval)   |       15 | When `rest_seconds` missing                  |
| `DEFAULT_AMRAP_REPS`            |       10 | Unparsable reps                              |
| `MIN_EXERCISE_SEC`              |       20 | Clamp floor                                  |
| `MAX_EXERCISE_SEC`              | 15 \* 60 | Clamp ceiling (avoid one bad row dominating) |

### 2.3 Movement-aware `secPerRep(name)`

v1: **name keyword table** (case-insensitive substring). No dictionary dependency.

| Family              | Keywords (examples)                                  | sec/rep | Rest between sets |
| ------------------- | ---------------------------------------------------- | ------: | ----------------: |
| Heavy lower         | squat, deadlift, lunge, hinge, RDL                   |     4.0 |                90 |
| Upper push/pull     | bench, press, row, pull-up, chin-up, push-up, pushup |     2.5 |                60 |
| Olympic / explosive | clean, snatch, jerk, thruster                        |     5.0 |               120 |
| Core / accessory    | curl, raise, fly, plank\*, crunch, sit-up            |     2.0 |                45 |
| Default             | —                                                    | **3.0** |            **60** |

\*If name includes `plank` **and** `duration_min` / `work_seconds` present, priority 1–2 already wins; keyword table is only for sets×reps paths.

Optional later: override `secPerRep` from `exercise_dictionary.kinetic_chain_type` when a hydrated map is available; keep name table as fallback.

### 2.4 Cumulative timeline

For teleprompter items `E[0..n)`:

```
est[i]   = clamp(estimateExerciseDurationSec(E[i]))
cum[0]   = 0
cum[i+1] = cum[i] + est[i]     // end time of item i is cum[i+1]
total    = cum[n]
```

**Active index at elapsed `t`:**

```
activeIndex = max { i | cum[i] <= t }   // 0-based; if t >= total → n - 1 (or "complete")
```

Do **not** scale estimates to fit `metadata.duration_min` in v1 (keeps math debuggable). Optional Phase 2: if authored `duration_min` exists and `|total - duration_min*60| / (duration_min*60) > 0.35`, linearly scale `est[]` so total matches authored session length.

### 2.5 Unit tests (when implementing)

Pure tests in `estimate-exercise-duration.test.ts`:

- sets×reps keyword families
- rep ranges / AMRAP strings
- `duration_min` / interval precedence
- clamps + empty input → default
- cumulative + active-index edge cases (`t=0`, mid-item, past end)

---

## 3. Task 2 — Auto-advance hook design

### 3.1 Proposed hook

**Location (proposed):** `src/features/live-video/hooks/useAutoAdvanceQueue.ts`  
(or `src/hooks/useAutoAdvanceQueue.ts` if shared with `WorkoutPlayer` outside live-video)

```ts
type UseAutoAdvanceQueueArgs = {
  enabled: boolean; // Teleprompter Mode On + recording/live gate
  items: TeleprompterItem[]; // stable ordered list
  /** Elapsed ms since recording/session clock zero. null = paused / not running. */
  elapsedMs: number | null;
  /** Recenter when active index crosses a multiple of this (default 3). */
  recenterEvery?: number; // 2 | 3 recommended
  /** Optional: also recenter whenever activeIndex changes and item leaves viewport. */
  recenterIfObscured?: boolean; // default true
  getItemElement: (itemId: string) => HTMLElement | null;
};

type UseAutoAdvanceQueueResult = {
  activeIndex: number;
  activeItemId: string | null;
  estimatedTotalSec: number;
  /** True briefly when a scroll was requested this tick (debug / analytics). */
  didRecenter: boolean;
};
```

### 3.2 Clock source (Solo Studio)

Today `useSoloStudioRecorder` exposes `status` but **not** elapsed time. Small additive change (implementation PR, not this blueprint):

- On transition → `'recording'`, set `recordingStartedAt = performance.now()` (or `Date.now()`).
- While `status === 'recording'`, tick `elapsedMs` at **1s** (or `requestAnimationFrame` throttled to 250ms — 1s is enough for teleprompter).
- On stop / idle / failed → `elapsedMs = null`, reset active index consumers.

**Do not** drive teleprompter off Agora cloud recording or upload duration.

Live Video later: host session wall clock or “workout started” timestamp — same `elapsedMs` contract.

Active Workout (`WorkoutPlayer`): local workout start clock.

### 3.3 Active index computation

```
if (!enabled || elapsedMs == null || items.length === 0) → activeIndex = 0 (no scroll side effects)
else activeIndex = findActiveIndex(cumulative, elapsedMs / 1000)
```

Recompute when `items` identity/length/estimates change (deck edit mid-recording): rebuild cumulative from current items; **keep elapsedMs**; re-derive index (coach may jump backward/forward — acceptable for heuristic).

### 3.4 Scrolling logic (locked proposal)

**Goal:** Not card-by-card jitter. Recenter smoothly after every **N** exercises (default **N = 3**), keeping the estimated-active item in view.

| Event                                                                | Scroll?                                                                                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeIndex` becomes `0` when recording starts                      | Optional one-time `block: 'nearest'` (no smooth) if first item not visible                                                                              |
| `activeIndex > 0` and `activeIndex % N === 0` (crossed boundary)     | **Yes** — `scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })` for horizontal deck; `block: 'center'` for vertical player lists |
| `activeIndex` advanced but not on N-boundary                         | **No** forced recenter                                                                                                                                  |
| `recenterIfObscured` and active element’s intersection ratio `< 0.4` | **Yes** — rescue scroll (smooth) even off-boundary                                                                                                      |
| Teleprompter toggled Off → On mid-recording                          | Recenter once to current `activeIndex`                                                                                                                  |
| User manually scrolls / selects a deck card                          | Do **not** fight the user for **MANUAL_COOLDOWN_MS** (e.g. 8s); then resume auto behavior                                                               |

**Boundary detection detail:** fire recenter when `prevActiveIndex` and `activeIndex` straddle a multiple of N:

```
crossed = Math.floor(activeIndex / N) > Math.floor(prevActiveIndex / N)
```

So with N=3, recenter when entering indices 3, 6, 9… (not on every tick inside a segment).

**Horizontal vs vertical:**

| Host list                                         | `scrollIntoView` options               |
| ------------------------------------------------- | -------------------------------------- |
| Solo Studio / Live deck strip (`overflow-x-auto`) | `inline: 'center'`, `block: 'nearest'` |
| WorkoutPlayer vertical list                       | `block: 'center'`, `inline: 'nearest'` |

Prefer scrolling the **nearest scrollport** (the strip container), not `window`. Implementation should use `element.scrollIntoView` first; if that proves jumpy, fall back to container `scrollTo({ left/top, behavior: 'smooth' })` using offset math.

### 3.5 Highlight vs selection (important)

Teleprompter **estimated** active ≠ host **selection**.

| Concern                                        | Source of truth                                             |
| ---------------------------------------------- | ----------------------------------------------------------- |
| Visual “now playing” ring on teleprompter item | Local hook `activeItemId` (client-only)                     |
| Host-selected deck card / logger binding       | Existing `activeDeckItemId` / `WorkoutDeckSelectionContext` |
| Interval set highlight                         | Existing interval FSM                                       |

**v1 recommendation:** paint a distinct teleprompter ring (e.g. muted primary) on the estimated item **without** calling `setActiveDeckItem` automatically. Auto-mutating host selection would yank the logger mid-cue and fights manual control.

Optional Phase 2 (opt-in): “Sync selection to teleprompter” for coaches who want the logger to follow.

### 3.6 Hook side-effect rules

- Only call scroll APIs when `enabled === true` and `elapsedMs != null`.
- Debounce scroll requests to **≥ 400ms** apart.
- Cancel pending smooth scroll on disable / unmount.
- No `console.log` in production path.

---

## 4. Task 3 — Reusable component architecture

### 4.1 Layering

```
┌─────────────────────────────────────────────────────────────┐
│ Host chrome: Teleprompter Mode toggle                        │
│  Solo: SessionControlsActions (beside Record / Stop)         │
│  Live: same host bar (hidden for participants)               │
│  WorkoutPlayer: header mode button (Detailed/Simple pattern) │
└────────────────────────────┬────────────────────────────────┘
                             │ enabled + elapsedMs
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ useAutoAdvanceQueue(items, elapsedMs, getItemElement, …)     │
│  → activeIndex / activeItemId / scroll intents               │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ AutoScrollingWorkoutQueue (wrapper)                          │
│  - Builds TeleprompterItem[] from deck snapshots OR accepts  │
│    prebuilt items                                            │
│  - Registers item refs (data-teleprompter-id)                 │
│  - Applies estimated-active styles                           │
│  - Renders children OR default strip                         │
└────────────────────────────┬────────────────────────────────┘
                             │ children / render prop
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ Existing UI                                                  │
│  WorkoutQueueRegion → SessionDeckBuilder  (Solo / Live)      │
│  WorkoutPlayerBlockList                   (Active Workout)   │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 `AutoScrollingWorkoutQueue` responsibilities

**In:**

- `items` or `deck: SessionDeckSnapshot[]` (+ flatten helper)
- `teleprompterEnabled: boolean`
- `elapsedMs: number | null`
- `recenterEvery?: 2 | 3` (default 3)
- `orientation?: 'horizontal' | 'vertical'`
- `children` **or** render prop `(ctx) => ReactNode` so Solo can keep real `SessionDeckBuilder` tiles

**Out:**

- Does **not** own collapse chrome (`WorkoutQueueRegion` stays)
- Does **not** own recording start/stop
- Does **not** persist toggle to DB in v1 (local React state; optional `localStorage` key `bb.teleprompter.<workspaceId>` later)

### 4.3 Toggle UX — “Teleprompter Mode: On/Off”

| Context       | Placement                                                                                    | Default |
| ------------- | -------------------------------------------------------------------------------------------- | ------- |
| Solo Studio   | `SessionControlsActions`, immediately after Solo Record cluster / before `ControlsSeparator` | **Off** |
| Live host     | Same host bar; only if host and queue strip visible                                          | Off     |
| Participants  | Hidden                                                                                       | —       |
| WorkoutPlayer | Header text button matching Detailed/Simple styling                                          | Off     |

When Off: hook `enabled=false` — no scroll, no estimated ring (or show ring only if we later add a preview). Manual deck selection unchanged.

When On **and** not recording (Solo): show idle hint — “Starts with Record” — do not scroll on lobby elapsed.

### 4.4 Solo Studio integration plan (first ship)

1. Extend recorder result with `elapsedMs` / `recordingStartedAt`.
2. Flatten live deck → `TeleprompterItem[]` in `LiveSessionView` (or thin adapter beside queue strip).
3. Wrap strip content with `AutoScrollingWorkoutQueue` **or** pass `activeTeleprompterItemId` + ref callback into `SessionDeckBuilder` (smallest surgical option if wrapper fights DnD).
4. Add toggle in `SessionControlsActions` gated by `isSoloStudio` (or `accessMode === 'solo_studio'`).
5. Keep queue strip **open** while teleprompter + recording (override today’s “collapse when leaving lobby / live uiMode” if it hides the strip during record — verify in `WorkoutQueueRegion`; teleprompter is useless if collapsed).

**Open implementation choice (resolve in coding PR):**

| Option                                                                                                                                                                          | Pros                          | Cons                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------- |
| **A. Scroll existing deck tiles** using per-card estimate (= sum of child exercises)                                                                                            | Minimal UI change             | User said “exercises”; card grain may be too coarse |
| **B. Flatten to exercise chips under/inside the strip while teleprompter On**                                                                                                   | Matches “every 2–3 exercises” | New presentation while recording                    |
| **C. Hybrid** — keep deck tiles; estimate & recenter on **exercise** milestones mapped back to parent card (`scrollIntoView` parent tile when exercise index hits N-boundaries) | Best reuse of current strip   | Active ring is on card, not individual exercise     |

**Recommendation for v1: Option C (Hybrid).**  
Keeps Solo Studio chrome stable, matches recenter cadence to exercise estimates, avoids a second competing list. Phase 2 can add an optional exercise chip rail if coaches want finer “now” labeling.

### 4.5 Live Video & WorkoutPlayer reuse

| Target            | Adapter                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Live host         | Same wrapper; `elapsedMs` from session/workout start; toggle host-only; still no auto `setActiveDeckItem`                   |
| Live participants | Follow host selection only (existing); **no** independent teleprompter unless product asks for “athlete teleprompter” later |
| `WorkoutPlayer`   | Pass vertical list refs; `orientation: 'vertical'`; local start clock; same hook                                            |

Shared packages of work: pure estimate util + hook + scroll helper. UI wrappers may differ.

---

## 5. Scrolling logic summary (review focus)

```
recording starts → elapsedMs ticks
                 → activeIndex = f(elapsed, cumulativeEstimates)
                 → if floor(activeIndex/N) advanced → smooth recenter active parent tile
                 → else if active tile < 40% visible → rescue recenter
                 → if user manually scrolled recently → suppress auto scroll until cooldown
teleprompter Off → no ticks applied to scroll / estimated ring
```

**Defaults to confirm in review:**

| Knob                     | Proposed default                             |
| ------------------------ | -------------------------------------------- |
| `recenterEvery` (N)      | **3**                                        |
| Rescue viewport ratio    | **0.4**                                      |
| Manual scroll cooldown   | **8s**                                       |
| Tick interval            | **1000ms**                                   |
| Auto-sync deck selection | **Off** (highlight only)                     |
| Scroll behavior          | **`smooth`** + horizontal `inline: 'center'` |

---

## 6. Non-goals (v1)

- Storefront / public aggregate teleprompter
- Persisting teleprompter progress on the VOD / publication
- Driving Tabata/EMOM/AMRAP engines from estimates
- Dictionary-required movement classification
- Card-by-card forced scroll on every index change
- Auto-opening collapsed `WorkoutQueueRegion` for participants

---

## 7. Implementation sketch (later PR order)

1. `estimate-exercise-duration.ts` + unit tests
2. `flattenDeckToTeleprompterItems(deck)` helper
3. `useAutoAdvanceQueue` + scroll helper tests (fake timers + mock elements)
4. Recorder `elapsedMs` export
5. Solo toggle + hybrid highlight/scroll wiring in huddle queue
6. (Follow-up) WorkoutPlayer vertical adapter

---

## 8. Open questions for review

1. Confirm **N = 3** vs **N = 2** as the default recenter cadence.
2. Confirm **Hybrid (C)** vs flattened exercise chip rail (B) for Solo Studio v1 UI.
3. Should teleprompter auto-**expand** the queue strip when Record starts if the coach collapsed it? (Recommended: **yes**.)
4. Mid-recording deck edits: keep wall-clock alignment (current proposal) or freeze a snapshot of estimates at Record start? (Recommended: **live recompute**, simpler and matches coach edits.)
