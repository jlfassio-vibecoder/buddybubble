# Timer HUD Start Button — Architectural Blueprint

**Status:** Phases 1–2 shipped (presentation + host/RPC wiring); Phase 3 polish optional

**Charter:** Add a host-only **Start** control attached beneath the live interval timer glass HUD (`TabataTimerOverlay`), redundant with the Nav **Start timer** action but closer to the countdown. The panel slides down while the block is ready, then retracts upward when Start is pressed / the timer leaves idle.  
**Depends on:** Unified live interval engine (`live_interval_sessions` + `mechanics_state`), `TabataTimerOverlay`, host Nav actions (`TabataHostActions`).  
**Boundary:** Presentational overlay + thin host wiring only. Do **not** invent a second start RPC or resume path.

---

## Related docs

| Doc                                                                                                            | Role                                                                      |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [timers/live-video/tabata-timer-overlay-assessment.md](./timers/live-video/tabata-timer-overlay-assessment.md) | Overlay architecture; Start → `beginTabataSegmentTimer` → RPC             |
| [interval-billboard-overlay-blueprint.md](./interval-billboard-overlay-blueprint.md)                           | Top-left timer HUD vs center Billboard; host controls stay on timer glass |
| [custom-interval-timer-blueprint.md](./custom-interval-timer-blueprint.md)                                     | Custom intervals share `TabataTimerOverlay`                               |
| [unified-interval-engine.md](./unified-interval-engine.md)                                                     | `live_interval_sessions` + mechanics                                      |

---

## 1. Product intent

Hosts already start the block from the huddle Nav (**Start timer**). During attach / pre-start, attention is on the video + glass HUD, so a second Start affordance under the timer is more discoverable.

| Actor                                       | Sees HUD Start?                                                       |
| ------------------------------------------- | --------------------------------------------------------------------- |
| Host, block ready (`timerPhase === 'idle'`) | Yes                                                                   |
| Host, countdown / work / rest / finished    | No (panel retracted)                                                  |
| Participant                                 | Never                                                                 |
| Host, mid-segment paused                    | No — overlay already has **Resume** via `IntervalOverlayHostControls` |

This control is **begin only**, not resume.

---

## 2. Discovery (locked facts)

### 2.1 Overlay surface

- Presentational HUD: [`TabataTimerOverlay.tsx`](../../src/features/live-video/wrappers/interval/mechanics/TabataTimerOverlay.tsx)
- Mounted from [`TabataMechanics.tsx`](../../src/features/live-video/wrappers/interval/mechanics/TabataMechanics.tsx) into `VideoOverlaySlotsContext` (`setTopLeftOverlay`).
- Existing host chrome on the glass: pause / resume via [`IntervalOverlayHostControls`](../../src/features/live-video/wrappers/interval/mechanics/IntervalOverlayHostControls.tsx) (`showHostControls`, `canPause`, `canResume`).
- Glass root today: `absolute top-4 left-4 … rounded-xl border … bg-black/50 … backdrop-blur-md` inside a `pointer-events-none` full-bleed layer with `pointer-events-auto` on the card.

### 2.2 Host detection

| Source       | How                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------- |
| Session      | `useLiveSessionRuntime().isHost` ← `localUserId === hostUserId` in `useSessionState`               |
| Wrapper role | `LiveSessionView` passes `role: isHost ? 'host' : 'participant'` into the interval wrapper         |
| Engine gates | `useIntervalSession`: `startTimer` / `resetTimer` / `advanceSegment` are **null for participants** |

**Locked for this feature:** treat “host” as `Boolean(engine.startTimer)` (same gate as Nav). Optionally also require `showHostControls`-style host flag if wiring through `TabataMechanics`, but do not show Start when `startTimer` is null.

### 2.3 Ready-to-start state

Attach seeds mechanics as `segment: 'setup'` with `segment_started_at: null` (`buildInitialTabataMechanicsState`).

[`useIntervalTimerState`](../../src/features/live-video/wrappers/interval/hooks/useIntervalTimerState.ts) maps that (and legacy `segment === 'idle'`) to:

```ts
timerPhase === 'idle';
```

Once the host starts, `beginTabataSegmentTimer` anchors setup; derived `timerPhase` becomes `'work'` for the rest of the runnable block (including the GET READY countdown). Nav already uses:

```ts
disabled={engine.timerPhase === 'work'} // TabataHostActions
```

**Locked visibility predicate:**

```ts
const showHudStart = engine.startTimer != null && engine.timerPhase === 'idle';
```

Do **not** key solely on `mechanics.segment === 'idle'` — that misses the common attach state (`setup` + null anchor). Prefer `timerPhase === 'idle'` so HUD and Nav stay aligned.

### 2.4 Start wiring (must reuse)

| Step   | Symbol                                                             | Location                            |
| ------ | ------------------------------------------------------------------ | ----------------------------------- |
| Nav UI | `TabataHostActions` → `onClick={() => void engine.startTimer?.()}` | `…/mechanics/TabataHostActions.tsx` |
| Engine | `startTimer`                                                       | `useIntervalSession`                |
| Pure   | `beginTabataSegmentTimer(state, nowMs)`                            | `tabata-mechanics-state.ts`         |
| RPC    | `interval_advance_segment`                                         | `supabase.rpc(...)`                 |

**Not the same path as Resume:** overlay Resume → `unfreezeTabataMechanicsStateForResume` → `engine.advanceSegment` (same RPC shape, different mechanics patch). HUD Start must call **`engine.startTimer` only**.

Do not confuse with Nav **Start Session** (`actions.startSession`) — that starts the global live session, not the interval block.

### 2.5 Motion stack on this surface

Interval / huddle HUD today uses **Tailwind CSS transitions** only (`transition-[width]`, `transition-opacity`). `motion` exists in the repo but is unused under `live-video/wrappers/interval` and `shells/huddle`.

**Locked default:** CSS/Tailwind slide + `motion-reduce:transition-none`. Framer / `AnimatePresence` is out of scope unless a later phase explicitly opts in.

---

## 3. UI / UX design

### 3.1 Composition

```
┌─────────────────────────────┐  ← existing glass card (timer / phase / progress / pause)
│  INTERVALS                  │
│  GET READY · 0:10           │
│  ▓▓▓▓▓▓▓▓▓░░░░░░░░░         │
└────────────┬────────────────┘
             │ attached “dropdown”
┌────────────▼────────────────┐
│         [  Start  ]         │  ← high-contrast host CTA
└─────────────────────────────┘
```

- Panel is a **sibling attached under** the glass card (same left/top stack), not a second floating island elsewhere on the video.
- Visually reads as a pull-down from the glass: shared width (or slightly inset), slightly stronger fill / border so the CTA reads as interactive chrome.
- Button copy: **Start** (short). Nav may keep **Start timer**; no need to rename Nav in this cut.
- `data-testid` proposal: `interval-overlay-start` (parallel to `interval-overlay-pause` / `interval-overlay-resume`).

### 3.2 Motion

| State   | Transform / opacity                                                                                        |
| ------- | ---------------------------------------------------------------------------------------------------------- |
| Hidden  | Retracted upward: e.g. panel wrapper `max-h-0` / `-translate-y-full` + `opacity-0` + `pointer-events-none` |
| Visible | `translate-y-0` + `opacity-100` + `pointer-events-auto`                                                    |
| Exit    | Same retract on click **and** when `timerPhase` leaves `'idle'` (Realtime / local start)                   |

Implementation sketch (CSS-first):

- Outer clip: `overflow-hidden` on a slot under the glass so the panel does not paint over the card while retracting.
- Inner panel: `transition-transform transition-opacity duration-200 ease-out` (tune 150–250ms).
- Honor `prefers-reduced-motion`: snap visibility without slide.

Click Start → call `engine.startTimer()`; as soon as `timerPhase !== 'idle'`, the panel unmounts or animates closed. No separate “force close” state machine beyond visibility rules.

### 3.3 Layout / pointer events

Preserve the overlay pattern:

- Full-bleed layer: `pointer-events-none`
- Glass + Start panel: `pointer-events-auto`
- Do not block video taps outside the card/panel bounds.
- Keep Pause/Resume **on** the glass (existing); Start lives **below** the glass only while idle.

### 3.4 Accessibility

- Button is a real `<button>` (or shared `Button`), not a div.
- When retracted / host-hidden, remove from tab order (`hidden` or unmount).
- Optional `aria-label="Start timer"` for parity with Nav wording.

---

## 4. Visibility rules (normative)

```
showHudStart =
  engine.startTimer != null
  AND engine.timerPhase === 'idle'
```

| Condition                         | Result                                                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Participant (`startTimer` null)   | Hidden                                                                                                                                          |
| Host + idle attach / legacy idle  | Visible                                                                                                                                         |
| Host + setup countdown started    | Hidden (`timerPhase === 'work'`)                                                                                                                |
| Host + work / rest / done         | Hidden                                                                                                                                          |
| Host + overlay paused mid-segment | Hidden (Resume on glass)                                                                                                                        |
| Global session `paused`           | Still idle-only; do not invent a third chrome mode. Pause overlay controls already hide when session is paused — Start remains idle-gated only. |

---

## 5. Wiring

### 5.1 Preferred mount

Extend props on `TabataTimerOverlay` (or a thin child `IntervalOverlayStartPanel`) from `TabataMechanics`:

```ts
// Conceptual — not implementation
showStart={engine.startTimer != null && engine.timerPhase === 'idle'}
onStart={() => void engine.startTimer?.()}
```

Keep Nav `TabataHostActions` unchanged in Phase 1–2 (redundant by design).

### 5.2 Call graph (target)

```
TabataTimerOverlay / IntervalOverlayStartPanel
  └─ onClick → engine.startTimer()          // same as TabataHostActions
       └─ beginTabataSegmentTimer(...)
       └─ rpc interval_advance_segment
```

### 5.3 Scope

| In scope (v1)                                          | Out of scope                                              |
| ------------------------------------------------------ | --------------------------------------------------------- |
| Tabata + Custom Interval (shared `TabataTimerOverlay`) | New RPC / Edge function                                   |
| Host-only + idle-only                                  | Resume / Reset on the dropdown                            |
| CSS retract animation                                  | Framer Motion requirement                                 |
| Unit/RTL tests for visibility + click                  | EMOM/AMRAP HUD Start (follow-on; same pattern if desired) |
|                                                        | Moving or removing Nav Start                              |

---

## 6. Execution phases

### Phase 0 — Blueprint (this doc)

1. [x] Map overlay, host gate, idle phase, Nav start RPC.
2. [x] Lock visibility, motion stack (CSS), and begin-only wiring.
3. [x] Product lock: button label **Start**; keep Nav **Start timer** duplicate.

### Phase 1 — Component & animation — **shipped**

1. [x] Add Start panel under the glass in `TabataTimerOverlay` (or extracted presentational child).
2. [x] CSS slide-down / retract-up with reduced-motion fallback; overflow clip so retract does not cover the card.
3. [x] Story/unit tests: renders when `showStart`; hidden otherwise; `data-testid="interval-overlay-start"`.
4. [x] No RPC yet — optional stub `onStart` prop.

### Phase 2 — Host & RPC wiring — **shipped**

1. [x] From `TabataMechanics`, pass `showStart` / `onStart` using `engine.startTimer` + `engine.timerPhase === 'idle'`.
2. [x] Confirm click path matches Nav (same `startTimer` reference).
3. Manual huddle QA: host sees panel after attach; click starts GET READY; panel retracts; participant never sees it; pause/resume unchanged.
4. [x] Overlay unit tests cover `showStart` / `onStart`; mechanics wire is thin (no dedicated harness).

### Phase 3 — Polish (optional)

1. EMOM / AMRAP parity if product wants the same affordance.
2. Micro-interaction (pressed scale) without adding Framer.
3. Link from [docs/fitness/README.md](./README.md) when shipped.

---

## 7. Decision summary

| Topic       | Decision                                                                       |
| ----------- | ------------------------------------------------------------------------------ |
| Surface     | Under `TabataTimerOverlay` glass (top-left HUD)                                |
| Host gate   | `engine.startTimer != null`                                                    |
| Ready state | `engine.timerPhase === 'idle'` (covers `setup` + null anchor)                  |
| Action      | `engine.startTimer()` → `beginTabataSegmentTimer` → `interval_advance_segment` |
| Resume      | Stay on existing overlay Resume; not this panel                                |
| Motion      | CSS/Tailwind retract upward; no Framer requirement                             |
| Nav Start   | Keep; intentional redundancy                                                   |

---

## 8. Open questions

1. ~~**Button copy**~~ — **Locked (Phase 1):** HUD **Start**; Nav keeps **Start timer**.
2. **EMOM / AMRAP:** ship Tabata-only first (recommended) or same PR?
3. **Reset:** any desire for a secondary Reset under the HUD, or Nav-only forever?

---

## 9. Validation (when implementing)

```bash
pnpm exec vitest run \
  src/features/live-video/wrappers/interval/mechanics/TabataTimerOverlay.test.tsx
```

Manual: host attach Custom Interval → HUD Start visible → Start → GET READY runs and panel retracts; second client (participant) never sees Start.
