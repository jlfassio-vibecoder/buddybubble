# Interval Billboard Overlay — Architectural Blueprint

**Status:** Phases 1–3 shipped (model + component + stage mount); Phase 4 polish pending  
**Charter:** Add a large, semi-transparent **top-center “Billboard”** on the live video stage that shows the **upcoming or current exercise**, legible from ~10 feet, without disturbing the existing top-left Tabata HUD.  
**Depends on:** Active Interval Alternation (Phases 1–4 shipped), multi-exercise circuit rotation, live Tabata overlay slots.

---

## Related docs

| Doc                                                                                                                | Role                                                           |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| [active-interval-alternation-blueprint.md](./active-interval-alternation-blueprint.md)                             | Path A (passive / zero-rest) vs Path B (`rest_mode: 'active'`) |
| [custom-interval-timer-blueprint.md](./custom-interval-timer-blueprint.md)                                         | Quick Launch W/R/Rounds + stations                             |
| [multi-exercise-interval-circuit-plan.md](./multi-exercise-interval-circuit-plan.md)                               | Circuit rounds × stations                                      |
| [timers/live-video/tabata-dual-engine-boundary.md](./timers/live-video/tabata-dual-engine-boundary.md)             | Live vs offline FSMs — **do not merge**                        |
| [timers/live-video/live-interval-preset-overlay-plan.md](./timers/live-video/live-interval-preset-overlay-plan.md) | Existing top-left HUD labels / snapshot                        |
| [unified-interval-engine.md](./unified-interval-engine.md)                                                         | `live_interval_sessions` + `mechanics_state`                   |

---

## 1. Product intent

Athletes watching a phone/tablet on a floor stand or wall mount need a **stage-center exercise cue** larger than the top-left chip HUD. The top-left overlay remains the **timer/chrome** surface (countdown, phase, progress, host controls). The Billboard is a **second surface**: name-only (or short prefix + name), high contrast, short-lived during work/active segments so it does not permanently obscure faces.

### 1.1 Modes covered

| Mode                         | Detection                                                                  | Billboard job                                      |
| ---------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------- |
| **High / Rest (passive)**    | `rest_mode` absent or not `'active'` (or empty `active_rest_exercises`)    | Preview next work name on rest; flash work name 3s |
| **High / Low (active rest)** | `format_params.rest_mode === 'active'` + non-empty `active_rest_exercises` | Flash **current** segment name 5s on work and rest |
| **Zero-rest circuit (A)**    | `rest_seconds === 0` (no rest segment)                                     | Setup + work flash only (no rest “Next:” line)     |

### 1.2 Non-goals

- Replacing or relocating `TabataTimerOverlay` (top-left HUD stays).
- Offline / gym-shell billboard parity (live huddle first).
- EMOM / AMRAP billboards in v1 (Tabata / custom interval only).
- New FSM fields or Postgres columns — presentation-only.
- Logging active-rest movements as scored sets (unchanged from Path B).

---

## 2. Discovery findings (code map)

### 2.1 Overlay mounting today

| Piece            | Location                                                             | Notes                                                                  |
| ---------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Slot context     | `VideoOverlaySlotsContext.tsx`                                       | Slots: `topLeft`, `topRight`, `stageBottom`, rail PiPs — **no center** |
| Provider mount   | `LiveSessionView.tsx` → `videoOverlays`                              | Renders `{topLeftOverlay}{topRightOverlay}` into `VideoStageWrapper`   |
| Tabata HUD mount | `TabataMechanics.tsx` → `setTopLeftOverlay(<TabataTimerOverlay …/>)` | Cleanup on unmount; deps include segment / remaining / snapshot        |
| HUD chrome       | `TabataTimerOverlay.tsx`                                             | `absolute top-4 left-4`, `z-[43]`, `bg-black/50`, small type           |

**Safe mount path for Billboard:** add a **dedicated top-center slot** (do not nest inside the top-left HUD tree, and do not reuse `topRight` — that slot is used by AMRAP round logger). Pattern mirrors Tabata: `TabataMechanics` calls `setTopCenterOverlay(<TabataBillboardOverlay …/>)` alongside `setTopLeftOverlay`.

```
VideoOverlaySlotsProvider
  └─ LiveSessionView.videoOverlays
       ├─ ActivePhaseOverlays
       ├─ topLeftOverlay     ← TabataTimerOverlay (unchanged)
       ├─ topCenterOverlay   ← NEW TabataBillboardOverlay
       └─ topRightOverlay
```

### 2.2 Elapsed time within the current segment

`useIntervalTimerState` already exposes:

| Field                               | Meaning                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| `remainingSec`                      | Countdown for current segment (250ms tick for Tabata)              |
| `totalSec`                          | Segment length (`setup_seconds` / `work_seconds` / `rest_seconds`) |
| `mechanicsState.segment_started_at` | Anchor for derive helpers                                          |
| `mechanicsState.elapsed_in_segment` | Frozen elapsed while paused                                        |

**Preferred elapsed for fade rules** (matches existing progress helper):

```ts
elapsedSec = max(0, totalSec - remainingSec);
// same basis as tabataSegmentProgressRatio(remainingSec, totalSec)
```

**Fade reset key** (already exists for audio cues):

```ts
tabataOverlayCueSegmentKey(state); // `${segment}-${round_index}-${segment_started_at}`
```

Billboard visibility should re-evaluate when that key changes (new segment → show again, then fade after N seconds of **elapsed** in the new segment). While paused, elapsed is frozen — Billboard should **stay in its current opacity state** (do not continue fading on wall clock).

**Precision note:** `remainingSec` is integer-ceiled from mechanics; a 3.0s fade may land on the 3rd or 4th tick (±250ms). Acceptable for 10-foot UI; if product wants exact ms later, derive from `segment_started_at` + pause-aware elapsed (same path as `deriveTabataSegmentRemainingSec`).

### 2.3 Next / current exercise derivation

Helpers in `tabata-circuit-rotation.ts` + display in `tabata-overlay-display.ts`:

| Need                         | Source                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| Current **work** station     | `deriveTabataActiveExerciseIndex(round_index, exerciseCount)` → `exercises[i].name`              |
| Current **active rest** name | `resolveTabataActiveRestExerciseName(round_index, active_rest_exercises)`                        |
| **Next work** during rest    | During `rest`, `round_index` is the **just-finished** work index; next work is `round_index + 1` |

Critical FSM fact (from Active Alternation blueprint): on `rest`, `round_index` does **not** advance until rest completes. Therefore:

```
// Passive rest Billboard "Next:"
nextRoundIndex = mechanics.round_index + 1
if nextRoundIndex > total_rounds → no next (last rest before done) → hide or show "Finish"
else name = resolveActiveExerciseLabel(nextRoundIndex, exercises)
```

Recommend a **new pure helper** next to circuit rotation (Phase 1), e.g.:

```ts
resolveTabataNextWorkExerciseName(roundIndex, totalRounds, exercises): string | null
```

Do **not** invent a second rotation formula — wrap `deriveTabataActiveExerciseIndex(roundIndex + 1, …)` + name trim / `'Movement'` fallback already used by `resolveTabataActiveExerciseLabel` (today private in `tabata-overlay-display.ts`; extract or share).

### 2.4 Mode branch (passive vs active rest)

Reuse the same predicate as HUD:

```ts
isActiveRestFormat =
  format_params.rest_mode === 'active' &&
  Array.isArray(active_rest_exercises) &&
  active_rest_exercises.length > 0;
```

| Segment     | Passive Billboard copy                    | Active-rest Billboard copy                          |
| ----------- | ----------------------------------------- | --------------------------------------------------- |
| setup       | First upcoming work name (always visible) | Same (first high / work name)                       |
| work        | `{name}` → fade after **3s**              | `{name}` (or `Current: {name}`) → fade after **5s** |
| rest        | `Next: {nextWorkName}` (stay visible)     | `{lowName}` (or `Current: {lowName}`) → fade **5s** |
| idle / done | Hidden                                    | Hidden                                              |

---

## 3. UI design

### 3.1 Placement & chrome

| Property       | Spec                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------- |
| Position       | Top-center of main video stage: `absolute top-4 left-1/2 -translate-x-1/2` (or equivalent)    |
| Z-index        | Same band as timer HUD (`z-[43]`) so it sits above video tiles; below modals                  |
| Max width      | `min(92vw, 40rem)` — wrap long names to 2 lines max                                           |
| Background     | Semi-transparent dark glass: e.g. `bg-black/45`–`bg-black/55` + light blur / border           |
| Pointer events | `pointer-events-none` on Billboard (no host controls here)                                    |
| Coexistence    | Must not collide with top-left HUD; leave horizontal gutter so both read as separate surfaces |

### 3.2 Typography (10-foot UI)

| Element      | Guidance                                                                       |
| ------------ | ------------------------------------------------------------------------------ |
| Primary name | Large display weight — target ~`text-3xl`–`text-5xl` responsive (`sm`/`md`)    |
| Prefix       | Smaller uppercase tracking (`Next:` / optional `Current:`) — secondary opacity |
| Contrast     | White / near-white on dark glass; avoid thin weights                           |
| Truncation   | Prefer wrap (2 lines) over ellipsis; hard-cap via existing station name bounds |

Exact tokens locked in Phase 2 implementation against live stage screenshots — blueprint requires **name-dominant**, not chip-sized.

### 3.3 Motion

| Transition                        | Behavior                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Segment enter                     | Fade/scale in quickly (~150–250ms) when cue key changes                                                            |
| Fade-out (work / active segments) | Opacity → 0 after elapsed ≥ threshold; keep layout reserved or collapse after fade (prefer collapse to free faces) |
| Pause                             | Freeze opacity / do not advance fade clock                                                                         |
| Prefers-reduced-motion            | Instant show/hide without scale                                                                                    |

---

## 4. Visibility rules (locked product)

### 4.1 High / Rest — Passive

| Phase                     | Visible? | Copy                     | Fade                                   |
| ------------------------- | -------- | ------------------------ | -------------------------------------- |
| **Setup** (10s pre-start) | Always   | Upcoming first work name | No fade                                |
| **Rest**                  | Always   | `Next: [Exercise Name]`  | No fade (stay for full rest)           |
| **Work**                  | Yes → no | `[Exercise Name]`        | Fade out after **3s** into the segment |
| Idle / done / no name     | Hidden   | —                        | —                                      |

### 4.2 High / Low — Active Rest

| Phase                        | Visible? | Copy                                            | Fade                  |
| ---------------------------- | -------- | ----------------------------------------------- | --------------------- |
| **Setup**                    | Always   | First work (High) name                          | No fade               |
| **Work (High)**              | Yes → no | `[Exercise Name]` or `Current: [Exercise Name]` | Fade out after **5s** |
| **Rest (Low / Active Rest)** | Yes → no | Low name from `active_rest_exercises`           | Fade out after **5s** |
| Idle / done                  | Hidden   | —                                               | —                     |

**Copy lock (Phase 2):** Prefer bare `{name}` for work/active-rest flashes; reserve `Next:` **only** for passive rest. Optional `Current:` prefix is product-toggleable but default **off** to maximize name size.

### 4.3 Edge cases

| Case                                  | Behavior                                                                |
| ------------------------------------- | ----------------------------------------------------------------------- |
| Single-exercise block (no circuit)    | Billboard still shows that one name                                     |
| Passive rest, last rest before `done` | No next work → hide Billboard (or optional “Finish” — default **hide**) |
| `rest_seconds === 0` (Push/Pull)      | No rest Billboard; work uses **passive** 3s fade rule                   |
| Missing / blank exercise name         | Fallback `'Movement'` (parity with HUD) or hide if still empty          |
| Host pause mid-fade                   | Freeze; resume continues from frozen elapsed                            |

---

## 5. Proposed module shape

| Module                                    | Responsibility                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| `tabata-circuit-rotation.ts` (extend)     | Pure `resolveTabataNextWorkExerciseName` (+ tests)                       |
| `tabata-billboard-display.ts` (new, pure) | Resolve copy + visibility model from mechanics + format_params + elapsed |
| `TabataBillboardOverlay.tsx` (new)        | Presentational: glass panel + large type + CSS/ framer opacity           |
| `TabataMechanics.tsx`                     | Mount via `setTopCenterOverlay` (parallel to top-left)                   |
| `VideoOverlaySlotsContext.tsx`            | Add `topCenterOverlay` / `setTopCenterOverlay`                           |
| `LiveSessionView.tsx`                     | Include `topCenterOverlay` in `videoOverlays`                            |

**Keep out of Billboard:** audio, pause/resume controls, progress bar — those stay on top-left HUD.

### 5.1 Suggested pure API (Phase 1)

```ts
type TabataBillboardModel = {
  visible: boolean;
  prefix: 'next' | null;       // 'next' → render "Next:"
  name: string;
  fadeAfterSec: number | null; // null = stay visible
};

resolveTabataBillboardModel({
  mechanics,
  formatParams,
  exercises,
  elapsedSec,
}): TabataBillboardModel | null
```

Component maps `fadeAfterSec` + `elapsedSec` → opacity; model stays unit-testable without React.

---

## 6. Implementation phases

### Phase 0 — Blueprint (this doc)

- [x] Discovery: overlay slots, elapsed derivation, next-exercise during rest.
- [ ] Product review of copy (`Next:` vs bare name) and 3s / 5s thresholds.
- [ ] Link from fitness README when Phase 1 starts.

### Phase 1 — Elapsed time & next-exercise derivation — **shipped**

1. [x] `resolveTabataWorkExerciseName` + `resolveTabataNextWorkExerciseName` in `tabata-circuit-rotation.ts` with unit tests (rest index → next station; last round → null).
2. [x] `resolveTabataBillboardModel` pure module + table-driven tests for:
   - Passive: setup / rest / work@2.5s / work@3.5s
   - Active: work@4.5s visible, work@5.5s faded; rest@4.5s / rest@5.5s
   - Zero-rest circuit: no rest branch
3. [x] Elapsed is caller-supplied (`totalSec - remainingSec`); pause freeze documented on the pure API.
4. [x] **No UI mount yet.**

### Phase 2 — Top-center component & animation — **shipped**

1. [x] `TabataBillboardOverlay` derives model from `engine` (`elapsedSec = totalSec - remainingSec`).
2. [x] Typography + glass chrome (top-center, `text-3xl`/`md:text-5xl`, `bg-black/50`).
3. [x] Enter transition + `motion-reduce:transition-none`; faded segments unmount (`visible: false` → null).
4. [x] Component tests for setup / work / rest / active-rest fade boundaries.

### Phase 3 — Wire to overlay context — **shipped**

1. [x] Extend `VideoOverlaySlotsContext` with `topCenterOverlay` + setter.
2. [x] Render slot in `LiveSessionView` `videoOverlays`.
3. [x] `TabataMechanics`: `setTopCenterOverlay(<TabataBillboardOverlay …/>)` with deps aligned to top-left mount (segment, round, remaining, format_params, exercises, pause).
4. [ ] Manual QA on live huddle:
   - Passive multi-station: rest shows `Next:`, work fades at ~3s
   - Active rest Hi/Low: both segments fade at ~5s
   - Setup always shows first movement
   - Confirm top-left HUD unchanged

### Phase 4 — Polish (optional follow-on)

1. Optional `Current:` prefix toggle / A-B with coaches.
2. Distinct glass tint for active-rest vs work (subtle; keep name primary).
3. Offline shell parity if product requests gym-floor offline billboard.
4. EMOM “this minute” billboard (separate mini-blueprint).

---

## 7. Decision summary

| Topic                        | Decision                                                                |
| ---------------------------- | ----------------------------------------------------------------------- |
| Mount surface                | **New** `topCenterOverlay` slot — do not overload top-left or top-right |
| Timer HUD                    | Unchanged (`TabataTimerOverlay` top-left)                               |
| Elapsed for fades            | `totalSec - remainingSec` (+ segment cue key); freeze while paused      |
| Next exercise (passive rest) | `round_index + 1` via existing rotation helper wrapper                  |
| Active rest name             | Existing `resolveTabataActiveRestExerciseName`                          |
| Passive work fade            | **3s**                                                                  |
| Active work/rest fade        | **5s**                                                                  |
| Passive rest visibility      | Stay for full rest with `Next:`                                         |
| Engine / DB                  | No changes                                                              |

---

## 8. Open questions

1. **Last rest before done:** hide vs show “Finish” / “Last round complete”? Default in §4.3: **hide**.
2. **`Current:` prefix** on active-rest flashes: default **off** for max type size — confirm with product.
3. **Single-line vs two-line** names at `text-5xl` on narrow phones in portrait huddle — Phase 2 visual lock.
4. Should idle (host not yet started, setup not running) show a static first-exercise teaser? Default: **only during `setup` segment** (and running work/rest rules), not pre-start idle chip.
