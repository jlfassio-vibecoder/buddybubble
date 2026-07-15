# Rest Between Rounds — Architectural Blueprint

**Status:** Phases 1–3 shipped (data & math + Engine/FSM + Quick Launch UI; `round_rest_seconds` max **300**); Phase 4 Coach/outline optional

**Charter:** Allow an optional longer **`round_rest_seconds`** that fires only after a **full circuit pass** (all stations done), while keeping the existing shorter **`rest_seconds`** between stations within a round.  
**Depends on:** Custom Interval Timer, multi-exercise circuit rotation (`resolveTabataWorkSegmentTotal`), live Tabata FSM.  
**Boundary:** Live (`tabata-mechanics-state.ts`) and offline (`interval-timer-engine.ts`) stay separate — share pure helpers only ([tabata-dual-engine-boundary](./timers/live-video/tabata-dual-engine-boundary.md)).

---

## Related docs

| Doc                                                                                    | Role                                         |
| -------------------------------------------------------------------------------------- | -------------------------------------------- |
| [custom-interval-timer-blueprint.md](./custom-interval-timer-blueprint.md)             | Quick Launch W/R/Rounds + stations           |
| [multi-exercise-interval-circuit-plan.md](./multi-exercise-interval-circuit-plan.md)   | Circuit rounds × stations                    |
| [active-interval-alternation-blueprint.md](./active-interval-alternation-blueprint.md) | Path A zero-rest / Path B active rest        |
| [unified-interval-engine.md](./unified-interval-engine.md)                             | `live_interval_sessions` + `mechanics_state` |

---

## 1. Product use case

**Example:** 4 stations × 3 circuit rounds · 40s work · **15s** between stations · **60s** between rounds.

| After finishing…                 | Rest type           | Duration |
| -------------------------------- | ------------------- | -------- |
| Station 1, 2, 3                  | Station rest        | 15s      |
| Station 4 (end of round 1 or 2)  | **Round rest**      | 60s      |
| Station 4 of round 3 (last work) | None — session done | —        |

Athlete language: short recoveries inside the circuit; a longer breath before repeating the full station list.

### 1.1 Non-goals

- New FSM segment type (`round_rest` as a distinct `segment` enum value) — reuse `rest` with a **resolved duration**.
- Per-station custom rest lists.
- Changing Path B active-rest copy rules (active rest still keys off `rest` + `rest_mode`).
- Merging live and offline engines.

---

## 2. Discovery findings (FSM audit)

### 2.1 Live FSM — rest is a baked scalar

[`tabata-mechanics-state.ts`](../../src/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state.ts):

| Field          | Role today                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| `rest_seconds` | Copied into `mechanics_state` at attach; every `rest` segment uses this duration via `segmentDurationSec` |
| `round_index`  | **1-based work-segment index** (not circuit-round index)                                                  |
| `total_rounds` | Total **work segments** (`circuitRounds × stations` when stations > 1)                                    |

Advance (`computeNextTabataMechanicsState`):

```
setup → work(1)
work  → done                         if round_index >= total_rounds
work  → rest(same round_index)       if rest_seconds > 0
work  → work(round_index + 1)        if rest_seconds === 0
rest  → work(round_index + 1)        (or done if last)
```

**Gap:** duration and “enter rest?” both key only off the single `rest_seconds` field. There is no notion of end-of-circuit-pass.

### 2.2 End-of-circuit-pass detection (live, 1-based)

With `exerciseCount > 1` and work-segment index `R`:

```
isEndOfCircuitPass(R, E) ⇔ E > 1 && R >= 1 && (R % E) === 0
```

Examples (E = 4): after work `R = 4, 8, 12` → end of pass. After `R = 1, 2, 3` → mid-circuit.

Circuit-round number (already shipped): `deriveTabataCircuitRound(R, E)`.

### 2.3 Offline FSM — same shape, 0-based index

[`interval-timer-engine.ts`](../../src/lib/workout-factory/interval-timer/interval-timer-engine.ts):

- Config holds a single `restMs`; `getPhaseDurationMs` returns it for every `rest` phase.
- `roundIndex` is **0-based** work-segment index.
- End of pass: `E > 1 && ((roundIndex + 1) % E) === 0`.

### 2.4 Duration math today

[`computeTabataBlockDurationFromParams`](../../src/lib/workout-factory/interval-timer/tabata-block-duration.ts):

```
workSegments = resolveTabataWorkSegmentTotal(circuitRounds, exerciseCount)
total = setup + workSegments * work + max(0, workSegments - 1) * rest
```

Live `tabataBlockDurationSeconds(mechanics)` mirrors the same formula using baked `total_rounds` / `work_seconds` / `rest_seconds` (no circuit-aware round rest).

### 2.5 Attach path

[`buildTabataAttachPayload`](../../src/features/live-video/wrappers/interval/utils/buildTabataAttachPayload.ts) resolves `totalRounds` via `resolveTabataWorkSegmentTotal` and seeds `mechanics_state.rest_seconds` from `format_params.rest_seconds`. Exercise names live on `block_snapshot`; mechanics stay timing-only today.

---

## 3. Data model

### 3.1 `TabataFormatParams`

```ts
round_rest_seconds?: number; // optional; omit or 0 = disabled (today’s behavior)
```

**Validation (Custom Interval / parse):**

| Rule                    | Detail                                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Type                    | Non-negative integer; same max family as `rest_seconds` (reuse rest bounds unless product wants a higher cap, e.g. 300)                                                                                                                    |
| Meaning when `0` / omit | No round rest — all inter-work rests use `rest_seconds`                                                                                                                                                                                    |
| Multi-station only      | When `exerciseCount <= 1`, ignore `round_rest_seconds` for FSM + duration (no distinct “circuit pass”)                                                                                                                                     |
| Active rest             | Unchanged: `rest_mode: 'active'` still requires `rest_seconds > 0`. Round rest may still show active-rest HUD if product wants the same low move during long rest — **lock default: yes, same active-rest list during any `rest` segment** |

### 3.2 Persist on live `mechanics_state`

At attach, copy:

| Field                | Why                                                               |
| -------------------- | ----------------------------------------------------------------- |
| `round_rest_seconds` | Available without re-reading format_params on every tick          |
| `exercise_count`     | Needed for `% E` end-of-pass checks inside pure mechanics helpers |

Do **not** overwrite `rest_seconds` when entering a long rest — keep both scalars and **resolve** the active duration.

### 3.3 Offline `IntervalTimerConfig`

Extend with `roundRestMs` + `exerciseCount` (exerciseCount already exists on `TabataTimerConfig` from `resolveTabataTimerConfig`; offline engine config should gain the same).

---

## 4. FSM constraints (target)

### 4.1 Shared pure helper (new)

```ts
resolveTabataRestDurationSeconds({
  finishedWorkIndex, // live: round_index (1-based); offline: roundIndex+1
  exerciseCount,
  restSeconds,
  roundRestSeconds,
}): number
```

```
if exerciseCount > 1
   && finishedWorkIndex % exerciseCount === 0
   && roundRestSeconds > 0:
  return roundRestSeconds
return restSeconds   // may be 0
```

### 4.2 Live advance (`computeNextTabataMechanicsState`)

On **`work` elapsed** (not last work segment):

```
restDur = resolveTabataRestDurationSeconds({
  finishedWorkIndex: state.round_index,
  exerciseCount: state.exercise_count,
  restSeconds: state.rest_seconds,
  roundRestSeconds: state.round_rest_seconds ?? 0,
})
if restDur > 0 → rest(same round_index)
else → work(round_index + 1)
```

**Critical vs today:** when `rest_seconds === 0` but `round_rest_seconds > 0`, the engine **must still enter `rest`** at end-of-pass (zero-rest _within_ round, long rest _between_ rounds). Today `rest_seconds === 0` skips all rests.

On **`rest`**: countdown uses resolved duration (see §4.3); advance to next work unchanged.

### 4.3 Live remaining time (`segmentDurationSec`)

For `segment === 'rest'`:

```
return resolveTabataRestDurationSeconds({ finishedWorkIndex: round_index, ... })
```

Work/setup durations unchanged. Pause / freeze / audio cue keys that use segment duration pick up the longer rest automatically.

### 4.4 Offline reducer

Mirror the same resolve helper in `getPhaseDurationMs` (rest) and in `advanceFromWork` when deciding rest vs next work (`restDur > 0` instead of `config.restMs > 0` alone).

### 4.5 Interaction matrix

| `rest_seconds` | `round_rest_seconds` | Stations | Behavior                                                   |
| -------------- | -------------------- | -------- | ---------------------------------------------------------- |
| 15             | omit / 0             | 4        | Today: 15s after every work except last                    |
| 15             | 60                   | 4        | 15s mid-circuit; 60s at end of pass (not after final work) |
| 0              | 60                   | 4        | Path A inside round; 60s between rounds only               |
| 0              | 0                    | 4        | Path A fully (no rests)                                    |
| 30             | 60                   | 1        | Round rest **ignored**; 30s between works                  |

---

## 5. Duration math (target)

Let:

- `R` = circuit rounds (`format_params.rounds`)
- `E` = `exerciseCount` (stations; use 1 when empty / single)
- `W`, `S`, `RR` = work / station-rest / round-rest seconds
- `setup` = setup seconds (default 10 live)

**Multi-station (`E > 1`) with optional round rest:**

```
workSegments = R * E
stationRestCount = R * (E - 1)          // after every station except last in each round
roundRestCount   = max(0, R - 1)        // after each full pass except the last
effectiveRoundRest = RR > 0 ? RR : S    // if RR disabled, end-of-pass uses station rest (today)

total = setup
      + workSegments * W
      + stationRestCount * S
      + roundRestCount * (RR > 0 ? RR : S)
```

When `RR === 0`, this collapses to today’s  
`setup + workSegments * W + (workSegments - 1) * S`.

**Single-station (`E <= 1`):** ignore `RR`; keep  
`setup + R * W + (R - 1) * S`.

**Example (4×3, W=40, S=15, RR=60, setup=10):**

```
work = 12×40 = 480
station rests = 3×3×15 = 135
round rests = 2×60 = 120
total = 10 + 480 + 135 + 120 = 745s (~12:25)
```

Update both `computeTabataBlockDurationFromParams` and live `tabataBlockDurationSeconds` (mechanics must carry `round_rest_seconds` + enough to know `E`, or accept `exerciseCount` option like the authoring helper).

---

## 6. UI impact

### 6.1 `CustomIntervalLaunchDialog`

| Control                                   | Behavior                                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Toggle / checkbox **Rest between rounds** | Visible when station count > 1 (parsed stations). Off by default.                                   |
| Seconds input                             | Shown when toggle on; default **60**; validate with round-rest bounds.                              |
| Duration preview                          | Use updated `computeTabataBlockDurationFromParams` / preview helper so ~total includes round rests. |

When stations drop to ≤1, clear toggle + `round_rest_seconds` from the emit payload.

### 6.2 HUD (live)

| Surface              | Target                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Phase chip           | Prefer **`ROUND REST`** when resolved duration is the round-rest value; keep **`REST`** / **`ACTIVE REST`** otherwise |
| Billboard / subtitle | Unchanged rules (Next / active-rest names); longer clock only                                                         |

HUD label can ship in the same phase as FSM or as a small follow-on — default **include in Phase 2** (one helper: `isTabataRoundRestSegment(state)`).

### 6.3 Coach / outline

Phase 1 can persist the key from Quick Launch only. Coach schema + prompts for `round_rest_seconds` are **Phase 4 / follow-on** unless product requires Coach authoring in the same cut.

---

## 7. Execution phases

### Phase 0 — Blueprint (this doc)

- [x] FSM + duration audit
- [ ] Product lock: single-station ignores round rest; Path A + round rest allowed
- [ ] Link from fitness README when Phase 1 starts

### Phase 1 — Data & math — **shipped**

1. [x] Extend `TabataFormatParams` + `parseTabataFormatParams` / snapshot with optional `round_rest_seconds` (max **300**).
2. [x] `validateCustomIntervalConfig` + bounds; emit only when ≥2 stations and `RR > 0`.
3. [x] Update `computeTabataBlockDurationFromParams` (+ tests) with matrix in §5.
4. [x] Unit-test pure `resolveTabataRestDurationSeconds` / `isTabataEndOfCircuitPass` in `tabata-circuit-rotation.ts`.
5. [x] **No FSM behavior change yet.**

### Phase 2 — Engine / FSM — **shipped**

1. [x] Attach: write `round_rest_seconds` + `exercise_count` onto live `mechanics_state`.
2. [x] Live: `segmentDurationSec` + `computeNextTabataMechanicsState` use resolve helper (including rest enter when `rest_seconds === 0` but round rest applies).
3. [x] Offline: config + `getPhaseDurationMs` / `advanceFromWork` parity.
4. [x] Overlay phase label **`Round Rest`** / `ROUND REST` when applicable (priority over Active Rest).
5. [x] Tests: mechanics-state + interval-timer-engine tables for 4×3 / zero-station-rest+round-rest / single-station ignore.

### Phase 3 — Quick Launch UI — **shipped**

1. [x] `CustomIntervalLaunchDialog`: toggle + seconds when stations > 1.
2. [x] Wire validate → attach payload (existing Quick Launch path).
3. Manual QA on live huddle: mid-circuit 15s vs end-of-round 60s; Path A + 60s between rounds.

### Phase 4 — Polish / authoring (optional)

1. Coach Vertex `format_params` + normalize allow-list.
2. Outline editor field.
3. Named preset template (“Circuit with round rest”).

---

## 8. Decision summary

| Topic                             | Decision                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Segment enum                      | Keep `rest`; resolve duration dynamically                                                               |
| When round rest fires             | End of circuit pass: `R % E === 0` (live 1-based), not after final work                                 |
| Single-station                    | Ignore `round_rest_seconds`                                                                             |
| `rest_seconds === 0` + round rest | Enter `rest` only at end-of-pass                                                                        |
| Mechanics fields                  | Persist `round_rest_seconds` + `exercise_count` at attach                                               |
| Engines                           | Dual update via shared pure helper; do not merge FSMs                                                   |
| Active rest during round rest     | **`Round Rest`** label takes priority over **Active Rest** at end-of-pass when `round_rest_seconds > 0` |

---

## 9. Open questions

1. ~~**Round-rest upper bound**~~ — **Locked (Phase 1):** max **300** (`CUSTOM_INTERVAL_ROUND_REST_SECONDS_BOUNDS`).
2. ~~**HUD copy**~~ — **Locked (Phase 2):** **`Round Rest`** / overlay `ROUND REST` (priority over Active Rest).
3. **Coach authoring:** ship Quick Launch only first (recommended); Coach schema deferred past Phase 1.
   )
