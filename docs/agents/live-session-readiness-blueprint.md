# Blueprint: Live Active Session Coach × pre-session check-in

**Status:** Gap analysis complete · Implementation not started in this doc  
**Date:** 2026-07-20  
**Constraint:** Do **not** tear out Coach readiness / `task_modal_intake_patch` usage in general chat while creating a workout. Fixes are **Active Session surface–scoped**.

Companion visual assessment: Cursor canvas `live-coach-readiness-gap.canvas.tsx`.

---

## 1. Problem statement

Coach is product-required to use pre-session check-in (energy / sleep / soreness) for **live session recommendations** (`execution_patch`). Observed failure (2026-07-20 12:42 PT):

1. Member: “add suggested reps based on my daily check-in” → Coach asks to re-describe readiness.
2. Member: “repeat exactly what I logged for sleep, energy, and soreness” → Coach: _“The pre-session readiness data … is not available to me in this live chat interface.”_

That denial is the **exact antipattern** already forbidden in `ACTIVE_SESSION_PREFLIGHT_READINESS_DIRECTIVE`. So either grounded numbers never reached the prompt, or competing main-chat instructions overrode the directive.

---

## 2. Product architecture (locked)

| Workflow                         | When                                     | Check-in role                                                                            |
| -------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Generate Workout**             | Card has no factory yet                  | Macro intake only — **no** readiness/sleep/soreness gate                                 |
| **Pre-session → Active Session** | Workout already generated (`hasFactory`) | Realtime check-in → `tasks.metadata.session_readiness_context` → Live Coach ground truth |

```text
Generate Workout intake  -.-> (no readiness) -.->  factory exists
factory exists --> Preflight (energy/sleep/soreness) --> Active Session Coach
```

---

## 3. What already shipped (not sufficient alone)

| Layer                 | Behavior                                                                                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client preflight      | Task Modal Save & Start → `metadataMerge: 'full'` so outline-keys merge cannot drop readiness                                                                                 |
| Client Active Session | Bridge/rail attach `session_readiness_context` + `workout_context.surface: 'active_session'` on sentinel/follow-ups                                                           |
| Edge follow-ups       | `resolveSessionReadinessForActiveSessionPrompt` (trigger → task → history); inject PRE-SESSION block + anti-denial directive; suppress Task Modal intake UI on Active Session |
| Deploy                | `agent-dispatch` includes the above                                                                                                                                           |

**Conclusion:** Happy-path plumbing exists. The live failure is a **gap between “plumbing present” and “live surface always grounded + uncontaminated by generation prompts.”**

---

## 4. Root-cause assessment

### Primary (highest likelihood)

**Missing grounded PRE-SESSION payload** combined with **Active Session still running the main-chat Apex / base prompt diet**.

- When resolve returns `null`, the directive alone (“never claim unavailable”) is weak next to Apex language (“when PRE-SESSION is available…”) and schema copy that still describes Task Modal readiness sliders.
- The model invents the “live chat interface” denial — matching user evidence.

### Contributing gaps

| ID     | Gap                                                                                                  | Why it matters                                      |
| ------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **G1** | Kanban / class / bare `ActiveSessionLaunchButton` skip preflight                                     | No write → all fallbacks null                       |
| **G2** | Workout-open greeting reads **trigger metadata only**                                                | Seeds “I don’t have check-in” even when task has it |
| **G3** | `!isRailSurface` still injects Apex Architect main-chat + Task Modal base chapters on Active Session | Teaches check-in belongs to generation/Task Modal   |
| **G4** | Response schema is main-chat (`task_modal_intake_patch` readiness = wizard)                          | Reinforces wrong ownership                          |
| **G5** | Sentinel omits key when bridge null; session-dedupe blocks rewrite                                   | First fire without readiness sticks                 |
| **G6** | `createTask()` branch in preflight can drop `mergedMetadata`                                         | Edge-case create-then-launch                        |

Src ↔ Deno readiness helpers are **not** the drift problem for this denial.

---

## 5. Keep vs override

### Keep (Generate Workout / Task Modal / standard rail)

- `task_modal_intake_patch` and TASK MODAL INTAKE UI / LIVE STATE
- Wizard semantics for readiness/sleep/soreness **inside Task Modal creation**
- `session_readiness_score` (0–100) distinct from 1–10 sliders
- Language that generation intake is **not** a readiness questionnaire

### Override only when `workout_context.surface === 'active_session'`

1. **Data:** Always resolve readiness via trigger → task → history (including **greeting**).
2. **Prompt diet:** No Apex Generate-Workout chapter; no Task Modal intake-patch chapter; keep MID_WORKOUT + ACTIVE_SESSION readiness + PRE-SESSION numbers + `execution_patch`.
3. **Schema:** Active-session schema without (or null-only) wizard-readiness wording.
4. **Absent path:** “No check-in numbers loaded — ask briefly how you feel” — **never** “unavailable in this interface / only Task Modal.”

---

## 6. Implementation roadmap

### Phase 0 — Prove the null (same day, 30–60 min)

On one failing Active Session turn after a **known** Task Modal preflight:

1. Network: outbound message metadata includes `session_readiness_context` (`readiness`, `sleep_quality`, `soreness`) and `workout_context.surface: 'active_session'`.
2. Edge logs: `coach active session readiness resolve` → `has_readiness_block`.
3. Record launch path (`from=modal` vs `kanban` / `class`).

**Exit:** Confirmed whether failure is empty payload, wrong surface, or prompt-only.

### Phase 1 — Ground the data (P0)

| Work                                                                                                          | Files (indicative)                            |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Greeting uses same resolve as follow-ups (after `loadCurrentTaskContext`)                                     | `supabase/functions/agents/coach/strategy.ts` |
| Ensure Task Modal preflight always persists readiness before navigate                                         | `TaskModal.tsx`, `useTaskSaveAndCreate.ts`    |
| Fix `createTask()` drop of `mergedMetadata`                                                                   | `TaskModal.tsx`                               |
| Product decision: gate kanban/class through preflight **or** document null readiness and never claim check-in | `dashboard-shell.tsx`, launch controls        |

**Exit:** `has_readiness_block: true` for modal → Active Session happy path; greeting includes numbers when task has them.

### Phase 2 — Live prompt / schema diet (P0–P1)

| Work                                                                                                 | Files (indicative)                          |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| When `isActiveSessionSurface`, skip `buildApexArchitectMainChatBlock()`                              | `strategy.ts` (Deno + any src test mirrors) |
| `buildBaseCoachPrompt` flag: omit Task Modal intake-patch / Generate CTA chapters for Active Session | `prompts.ts` both mirrors                   |
| Active Session response schema (execution-focused; no wizard readiness ownership)                    | `schema.ts`, `resolveResponseSchema`        |
| Strengthen absent-path copy (ask feel; never “live chat can’t access”)                               | `config.ts` both mirrors                    |

**Exit:** Prompt dump for Active Session contains PRE-SESSION numbers + live directives, **without** Generate Workout / Task Modal ownership language.

### Phase 3 — Sentinel / race hardening (P1)

- Defer open sentinel until readiness resolved from task, **or** rely on Phase 1 greeting resolve.
- Revisit `shouldSkipSentinelForSession` so a readiness-less first fire cannot permanently poison the session open.

### Phase 4 — Acceptance (product)

Fresh **already-generated** workout → Task Modal preflight → Active Session:

1. Follow-up metadata carries `session_readiness_context`.
2. “Repeat my sleep, energy, and soreness” → exact values.
3. “Suggest reps from my check-in” → grounded recommendation + `execution_patch`.
4. Zero mentions of Task Modal / generation / “not available in live chat.”

Regression: Generate Workout / Task Modal creation chat still patches intake as today.

---

## 7. Explicit non-goals

- New `daily_check_in` table
- Moving energy/sleep/soreness into Generate Workout intake
- Treating outline-fill OOM as caused by readiness injection
- Rewriting general Coach creation prompts globally

---

## 8. Success criteria

- Live Coach **cannot** truthfully claim check-in is inaccessible when `session_readiness_context` is on task or trigger.
- Live recommendations for load/reps/RPE prefer check-in + `execution_patch`.
- Generation-time Coach behavior unchanged.
- Edge deploy matches the branch that contains Phases 1–2.

---

## 9. Suggested first PR slice

Smallest high-leverage PR:

1. Greeting resolve = follow-up resolve (G2).
2. Skip Apex + Task Modal base chapters when `isActiveSessionSurface` (G3).
3. Integration/unit tests: Active Session prompt contains PRE-SESSION values from **task** metadata when trigger omits them; prompt dump excludes “Task Modal” readiness ownership.

Follow-up PR: launch-path preflight gate (G1) + schema variant (G4).
