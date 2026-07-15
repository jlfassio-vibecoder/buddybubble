# Active Interval Alternation — Architectural Blueprint

**Status:** Phases 1–4 **shipped** (data contract + live HUD + Quick Launch UI + Coach authoring); Phase 5 polish pending  
**Charter:** Support **alternating-intensity** and **agonist/antagonist** protocols on the existing live Tabata engine — without a new FSM.  
**Depends on:** Custom Interval Timer (Phases 1–3 shipped), multi-exercise circuit rotation (F1–F2 shipped), `rest_seconds: 0` work→work advance.

---

## Related docs

| Doc                                                                                                                | Role                                                        |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| [custom-interval-timer-blueprint.md](./custom-interval-timer-blueprint.md)                                         | Quick Launch W/R/Rounds + multi-station circuits            |
| [multi-exercise-interval-circuit-plan.md](./multi-exercise-interval-circuit-plan.md)                               | Circuit rounds × stations (`resolveTabataWorkSegmentTotal`) |
| [timers/live-video/tabata-dual-engine-boundary.md](./timers/live-video/tabata-dual-engine-boundary.md)             | Live vs offline FSMs — **do not merge**                     |
| [timers/live-video/live-interval-preset-overlay-plan.md](./timers/live-video/live-interval-preset-overlay-plan.md) | HUD labels / snapshot                                       |
| [unified-interval-engine.md](./unified-interval-engine.md)                                                         | `live_interval_sessions` + `mechanics_state`                |

---

## 1. Product use cases

### 1.1 Hi / Low intensity (asymmetrical)

**Example:** 45s High Intensity (Ex A) → 15s Low Intensity (Ex B as active rest) × N rounds.

| Phase (coach language) | Engine segment | Duration | Athlete cue                         |
| ---------------------- | -------------- | -------- | ----------------------------------- |
| High                   | `work`         | 45s      | Work movement (e.g. Burpees)        |
| Low / active recovery  | `rest`         | 15s      | **Active Rest: Jogging** (not idle) |

**Why Path A alone fails:** the Tabata FSM has a **single** `work_seconds` and a **single** `rest_seconds`. Putting both exercises in `stations[]` with `rest_seconds: 0` would give **45s to both** movements (or both 15s if work were 15). Asymmetry requires the existing **work/rest duration split**.

### 1.2 Agonist / antagonist (symmetrical, no passive rest)

**Example:** 30s Push → 30s Pull → 30s Push → … with **no** passive rest between.

| Phase (coach language) | Engine segment | Duration | Athlete cue       |
| ---------------------- | -------------- | -------- | ----------------- |
| Push                   | `work`         | 30s      | Push station name |
| Pull                   | `work`         | 30s      | Pull station name |

**Path A target:** `rest_seconds: 0` + `stations: ['Push', 'Pull']` (or any even/odd pair list). Already supported by shipped Custom Interval + circuit rotation.

### 1.3 Non-goals (this blueprint)

- New Postgres `interval_type` or a second live FSM.
- Merging live and offline timer engines.
- Arbitrary per-segment duration sequences (A=40, B=20, C=10…) — that would need a segment playlist, out of scope.
- Participant-edited mid-session station lists.

---

## 2. Engine constraints (audit)

### 2.1 Circuit rotation (`tabata-circuit-rotation.ts`)

| Helper                            | Behavior                                                                  |
| --------------------------------- | ------------------------------------------------------------------------- |
| `resolveTabataWorkSegmentTotal`   | `exerciseCount > 1` → `circuitRounds × exerciseCount`; else `rounds`      |
| `deriveTabataActiveExerciseIndex` | `(round_index - 1) % exerciseCount` while `round_index ≥ 1` and count > 1 |
| `deriveTabataCircuitRound`        | Maps work-segment index → 1-based circuit pass for logging                |

Rotation is keyed off **`round_index` (work-segment index)**. It does **not** know about a separate “rest exercise” stream.

### 2.2 Live FSM (`tabata-mechanics-state.ts`)

Segments: `idle → setup → work ⇄ rest → done` (or `work → work` when rest is zero).

Critical transitions in `computeNextTabataMechanicsState`:

```
setup  → work(1)
work   → done                    if round_index >= total_rounds
work   → rest(same round_index)  if rest_seconds > 0
work   → work(round_index + 1)   if rest_seconds === 0   ← Path A
rest   → work(round_index + 1)   (or done if last)
```

Implications:

1. **`rest_seconds === 0` skips the rest segment entirely** — no HUD “Rest” flash between stations. Ideal for Push/Pull.
2. During **`rest`**, `round_index` stays on the **just-finished work** segment. Overlay/logger helpers that key off `round_index` therefore still resolve the **work** station during rest unless we add rest-specific display logic.
3. Timing is only two scalars: `work_seconds` / `rest_seconds`. Asymmetrical Hi/Low **must** keep a non-zero rest phase for the short interval.
4. Phase label is fixed copy: `tabataSegmentLabel('rest')` → `"Rest"` (uppercase in overlay as `REST`).

### 2.3 Overlay today (`tabata-overlay-display.ts` + `TabataTimerOverlay`)

| Surface       | Work                               | Rest (current)                                                                    |
| ------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| Phase label   | `WORK` (emerald)                   | `REST` (amber)                                                                    |
| Subtitle      | `Round N of T · {active exercise}` | **Same formula** — still the **work** station name                                |
| Progress fill | emerald                            | amber                                                                             |
| Logger active | Highlights work set / station      | **No** active-set highlight (`deriveTabataLoggerActiveSet` returns null for rest) |

Rest is already a first-class **timed** phase with distinct chrome; it is **not** yet an **active movement** cue.

### 2.4 Attach payload shape (unchanged family)

```
TabataAttachPayload {
  blockSnapshot: {
    block_format: 'tabata'
    format_params: { work_seconds, rest_seconds, rounds, interval_preset?, … }
    exercises: WorkoutExercise[]   // circuit stations for work rotation
  }
  mechanicsState: TabataMechanicsState  // no exercise names; timing + segment only
}
```

Display names live in **`block_snapshot.exercises`**. Mechanics stay timing-only — preferred boundary for Path B as well.

---

## 3. Path evaluation

### Path A — Zero-rest circuit (symmetrical)

| Question                                                           | Verdict                                                    |
| ------------------------------------------------------------------ | ---------------------------------------------------------- |
| Can Push/Pull 30/30 with no rest use `rest_seconds: 0` + stations? | **Yes**                                                    |
| FSM change required?                                               | **No**                                                     |
| Overlay change required?                                           | Minimal — already shows rotating station on each `work`    |
| Quick Launch today                                                 | Custom Interval stations textarea + rest `0` already ships |

**Recommended product framing:** document / preset this as **“Alternating stations (no rest)”** or a Quick Launch template (“Push / Pull”) that seeds `rest_seconds: 0` and two station names. Optional later: one-click template in the Custom Interval dialog.

**Limits:** equal duration only; no dedicated “active rest” vocabulary; logger still one work stream rotating stations (correct for this use case).

### Path B — Active rest phase (asymmetrical)

| Question                                              | Verdict                                   |
| ----------------------------------------------------- | ----------------------------------------- |
| Can 45/15 Hi/Low reuse work/rest durations?           | **Yes** — keep `work=45`, `rest=15`       |
| Can rest show a secondary exercise without a new FSM? | **Yes** — display + snapshot mapping only |
| Put both moves in `exercises[]` with `rest=0`?        | **No** — loses asymmetry                  |
| Fork `mechanics_state` with dual clocks?              | **No** — unnecessary                      |

**Recommended approach:** keep the FSM; enrich **snapshot / format_params** so the overlay (and optionally logger) can resolve an **active-rest exercise** while `segment === 'rest'`.

---

## 4. Target data model

### 4.1 Design principles

1. **No FSM fork** — still `block_format: 'tabata'` / `interval_type: 'tabata'`.
2. **Timing stays in `mechanics_state`** — `work_seconds` / `rest_seconds` / `round_index` unchanged.
3. **Names stay in snapshot** — work stations remain `exercises[]`; active-rest names are additive.
4. **Backward compatible** — absent fields ⇒ today’s passive Rest HUD.

### 4.2 Proposed `format_params` extensions

```ts
// Additive keys on TabataFormatParams (illustrative)
{
  work_seconds: 45,
  rest_seconds: 15,
  rounds: 8,
  interval_preset: 'custom', // or a future named preset

  /** When true (or rest_mode === 'active'), rest phase is cued as active movement. */
  rest_mode?: 'passive' | 'active', // default: 'passive' / omitted

  /**
   * Names shown during rest when rest_mode === 'active'.
   * Rotation: (round_index - 1) % active_rest_exercises.length
   * (same index clock as the just-finished work segment).
   */
  active_rest_exercises?: string[],
}
```

**Normalization rules:**

| Input                                         | Result                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| `rest_mode` omitted / `'passive'`             | Ignore `active_rest_exercises`; current Rest HUD                         |
| `rest_mode: 'active'` + non-empty name list   | Active Rest HUD (Phase 2+); payload shipped in Phase 1                   |
| `rest_mode: 'active'` + empty / missing names | **Reject** at Quick Launch validate; snapshot parse strips (fail-closed) |
| `rest_seconds === 0` + `rest_mode: 'active'`  | **Reject** at validate; snapshot parse strips active-rest keys           |
| Names without `rest_mode: 'active'`           | **Reject** at Quick Launch validate; parse never keeps orphan names      |

**Boolean alternative:** `active_rest: true` is acceptable if we never need a third mode; prefer `rest_mode` for clarity in docs and Coach prose.

### 4.3 Snapshot / payload mapping

| Field                                 | Path A (Push/Pull)               | Path B (Hi/Low)                                      |
| ------------------------------------- | -------------------------------- | ---------------------------------------------------- |
| `exercises[]`                         | `[{name: Push}, {name: Pull}]`   | High-intensity stations only (1..N)                  |
| `format_params.rest_seconds`          | `0`                              | Low-intensity duration (e.g. 15)                     |
| `format_params.work_seconds`          | Equal station duration (e.g. 30) | High duration (e.g. 45)                              |
| `format_params.rest_mode`             | omit / `'passive'`               | `'active'`                                           |
| `format_params.active_rest_exercises` | omit                             | e.g. `['Jogging']` or paired lows `['Jog', 'March']` |
| `mechanicsState.total_rounds`         | `rounds × stations`              | `rounds × highStations` (unchanged circuit math)     |

**Do not** stuff active-rest names into `exercises[]` for Path B — that would inflate work-segment totals and break logger row counts.

### 4.4 Rotation for active rest

Mirror work helpers (new pure functions next to `tabata-circuit-rotation.ts`):

```ts
deriveTabataActiveRestExerciseIndex(roundIndex, activeRestCount);
// (roundIndex - 1) % activeRestCount   when roundIndex >= 1 && count >= 1
```

Use **`round_index` during `rest`** (already the completed work segment index). That pairs Hi station _i_ with Low station _i_ when both lists share length; if active-rest list length is 1, every rest shows the same low move (common Hi/Low pattern).

---

## 5. UI / HUD impact

### 5.1 `TabataTimerOverlay` / `tabata-overlay-display`

| Element      | Passive rest (today)    | Active rest (target)                                                                            |
| ------------ | ----------------------- | ----------------------------------------------------------------------------------------------- |
| Phase label  | `REST`                  | `ACTIVE REST` via overlay `resolveTabataOverlayPhaseLabel` (engine `segmentLabel` stays `Rest`) |
| Subtitle     | `Round N of T · {work}` | `Round N of T · {activeRestName}` (locked Phase 2)                                              |
| Accent / bar | Amber                   | Keep amber (still recovery clock) unless product wants a distinct “low intensity” token later   |
| Audio cues   | Existing rest cues      | Unchanged initially; optional distinct cue later                                                |

### 5.2 Display resolution algorithm (target)

```
if segment === 'rest' && rest_mode === 'active':
  name = active_rest_exercises[deriveIndex(round_index)] ?? 'Active Rest'
  phaseLabel = 'Active Rest'
  subtitle = `Round ${round_index} of ${total} · ${name}`  // or `Active Rest: ${name}`
else:
  // existing work/rest subtitle + tabataSegmentLabel
```

### 5.3 Logger (optional follow-on)

Today rest does not highlight a logger row. Options:

| Option | Behavior                                        | When                                              |
| ------ | ----------------------------------------------- | ------------------------------------------------- |
| B0     | Leave logger dark during rest (ship HUD only)   | Phase 2 MVP                                       |
| B1     | Highlight a synthetic / paired low row          | Only if outline stores lows as loggable exercises |
| B2     | No log rows for active rest (movement cue only) | Default recommendation                            |

**Recommendation:** B0/B2 for MVP — active rest is a **cue**, not a scored work set, unless Coach authoring later adds explicit low-intensity log rows.

### 5.4 Host Quick Launch / Custom Interval

Extend `CustomIntervalLaunchDialog` (or a sibling mode):

1. Toggle: **Passive rest** vs **Active rest**.
2. When Active: textarea / fields for active-rest names (same parse rules as stations).
3. Validation: `rest_seconds ≥ 1` when active rest enabled; station list still optional for highs.
4. Push/Pull template: rest `0`, two stations, active rest off (Path A).

---

## 6. Execution phases

### Phase 0 — Product copy & docs (this blueprint)

- [x] Engine audit (Path A vs Path B).
- [ ] Lock UX strings: `ACTIVE REST` vs `LOW` vs `RECOVERY`.
- [ ] Link from [fitness README](./README.md) when implementation starts.

### Phase 1 — Data contract (no HUD yet) — **shipped**

1. [x] Extend `TabataFormatParams` with `rest_mode` + `active_rest_exercises` (parse/validate; strip on invalid).
2. [x] Unit tests: omit ⇒ passive; active + names round-trip through `parseTabataFormatParams` / snapshot.
3. [x] Quick Launch builder emits active-rest keys via `validateCustomIntervalConfig` (dialog UI in Phase 3).
4. [x] **No** mechanics_state changes.
5. Locked: reuse `parseCustomIntervalStationNames` / `parseCustomIntervalActiveRestNames` for free-text; active list length 1..12.

### Phase 2 — Overlay / HUD (Path B MVP) — **shipped** (live only)

1. [x] `resolveTabataOverlaySubtitle` + `resolveTabataOverlayPhaseLabel` read `rest_mode` / active-rest list from `format_params`.
2. [x] Tests in `tabata-overlay-display.test.ts` + `TabataTimerOverlay.test.tsx` for rest segment with active name.
3. [ ] Manual QA on live huddle: 45/15, one high + one low name.
4. Locked UX: phase **Active Rest**; subtitle **`Round N of T · {name}`**; amber rest chrome unchanged; offline shell deferred.

### Phase 3 — Host UX — **shipped** (templates deferred)

1. [x] Custom Interval dialog: Active Rest checkbox (when `rest_seconds > 0`) + active-rest stations textarea.
2. [ ] Optional templates: **Push/Pull (0 rest)** and **Hi/Low (active rest)** — deferred.
3. [x] Submit merges `rest_mode: 'active'` + parsed names into `validateCustomIntervalConfig` → existing Quick Launch payload builder.

### Phase 4 — Authoring / Coach — **shipped**

1. [x] Outline / Coach Vertex `format_params` + `normalizeFormatParams` preserve `rest_mode` / `active_rest_exercises` (fail-closed); tabata `rest_seconds: 0` allowed for Push/Pull.
2. [x] Prompt guidance: `INTERVAL_ACTIVE_REST_PROMPT_BLOCK` + blueprint tabata prose (Hi/Low vs zero-rest); outline example includes Hi/Low block.
3. [x] Deno mirrors synced (`pnpm check:agent-mirror`). Offline shell Path B parity remains deferred (Phase 5 / prior Phase 2 note).

### Phase 5 — Polish

1. Distinct audio cue for active rest (optional).
2. Logger policy B1 only if product requires logging lows.
3. Named catalog preset (e.g. Hi/Low) if we want one-click without Custom dialog.

---

## 7. Decision summary

| Use case                | Path  | Mechanism                                               | Engine change         |
| ----------------------- | ----- | ------------------------------------------------------- | --------------------- |
| Push/Pull 30/30         | **A** | `rest_seconds: 0` + `exercises[]` stations              | None (shipped)        |
| Hi/Low 45/15            | **B** | Keep work/rest durations; `rest_mode: 'active'` + names | Display + params only |
| New FSM / interval_type | —     | Out of scope                                            | Do not do             |

**North star:** Path A is a **productization** of already-shipped zero-rest circuits. Path B is a **presentation contract** on the existing rest segment so “Rest” can mean **cued low-intensity work** without breaking Tabata attach, advance, pause, or finalize.

---

## 8. Open questions / locked decisions

1. ~~**Phase label copy**~~ — **Locked (Phase 2):** `Active Rest` → HUD `ACTIVE REST`.
2. ~~**Subtitle shape**~~ — **Locked (Phase 2):** `Round N of T · {activeRestName}`.
3. ~~**Multi high × multi low**~~ — **Locked (Phase 1):** allow `active_rest_exercises.length` 1..12; length 1 broadcasts.
4. ~~**Offline shell**~~ — **Deferred:** Phase 2 is live overlay only; offline parity later if needed.
5. **Preset catalog:** ship as Custom-only first, or add a named Hi/Low preset row?
