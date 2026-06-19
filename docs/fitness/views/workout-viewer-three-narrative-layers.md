# Workout viewer — three narrative layers

_Scope: how coach brief, structure rationale, and session adjustments are parsed, stored, and displayed after parametric outline-fill generation._

_Related: [workout-generation-content-parsing.md](./workout-generation-content-parsing.md) (pipeline) · [workout-viewer-dialog.md](../workout-viewer-dialog.md)_

---

## 1. Purpose

The workout viewer shows **three distinct prose sections** (not three copies of the same paragraph):

| Layer                       | Label in UI                                 | Source                                                               | Audience intent                                                                      |
| --------------------------- | ------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **1 — Coach brief**         | _Coach brief_ (card header)                 | `tasks.description` from the @coach conversation                     | What the user wants to accomplish                                                    |
| **2 — Structure**           | _Structure_ (workout plan chrome)           | Deterministic summary from `coach_workout_outline` blocks after fill | Why the session is organized this way (formats, rounds, stations)                    |
| **3 — Session adjustments** | _Session adjustments_ (workout plan chrome) | Pre-session intake wizard → `daily_checkin`                          | How today’s calibration changed prescriptions (phase, anchor, duration, limitations) |

Exercise rows below these sections remain **prescription UI** (sets/reps/rest), not narrative.

---

## 2. Data flow

```mermaid
flowchart LR
  coachChat[@coach chat] --> taskDesc[tasks.description]
  architect[Apex outline] --> outline[coach_workout_outline]
  wizard[Intake wizard] --> checkin[daily_checkin]

  taskDesc --> header[Viewer header: Coach brief]
  outline --> fill[Outline fill + assemble]
  checkin --> vertex[Vertex prompt only]
  checkin --> adapt[session_adaptations text]

  fill --> blocks[workout_set blocks]
  blocks --> structure[structure_rationale text]

  structure --> chrome2[Viewer: Structure]
  adapt --> chrome3[Viewer: Session adjustments]
```

**Important:** Macro intake is **no longer appended** to `persona.description` or duplicated into `workout_set.description`. It is:

- Passed to Vertex in the fill prompt (`buildFillParametricOutlinePrompt` + formatted prose).
- Stored on `chain_metadata.generation_intake_context` (structured) and `session_adaptations` (display string).
- Copied to `ai_workout_factory.session_adaptations` when the task modal saves generation results.

---

## 3. Storage keys

| Field               | Location                                                                         | Example                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Coach brief         | `tasks.description`                                                              | “45-minute bodyweight circuit for climbing flagging…”                                                          |
| Structure rationale | `ai_workout_factory.structure_rationale` or `chain_metadata.structure_rationale` | “Main work: Main — Circuit · Circuit · 4 Rounds — Lateral Flagging Lunges, …”                                  |
| Session adaptations | `ai_workout_factory.session_adaptations` or `chain_metadata.session_adaptations` | “Goal-driven duration. Training phase: Standard Progression (RPE 7-8). Anchor lift reference: Deadlift 305×3.” |
| Intake snapshot     | `chain_metadata.generation_intake_context`                                       | `{ phase_intent, anchor_lift, … }`                                                                             |

`workout_set.description` and `workouts[0].description` are **empty** for new outline-fill generations so they do not compete with the three layers.

---

## 4. Resolution at read time

`resolveWorkoutViewerNarrative()` in `src/lib/workout-factory/workout-viewer-narrative.ts`:

1. **Coach brief** — `stripMacroPlanningContextSuffix(tasks.description)` (cleans legacy workouts that still have appended JSON).
2. **Structure** — persisted `structure_rationale`, else `buildWorkoutStructureRationale(blocks)` from the live block view model.
3. **Session adjustments** — persisted `session_adaptations`, else `formatGenerationIntakeAdaptations(generation_intake_context)`, else parse legacy macro JSON from old descriptions.

Used by `WorkoutViewerContent` and `WorkoutBuilderShell`.

---

## 5. Example (climbing circuit)

**Coach brief** (header):

> A 45-minute bodyweight circuit designed to enhance kinetic chain efficiency for climbing, focusing on flagging and dynamic movements…

**Structure** (workout plan):

> Main work: Main — Circuit · Circuit · 4 Rounds (3 exercises) — Lateral Flagging Lunges, Pike Push-ups, Single-Leg Glute Bridges.  
> Finisher: Finisher · Tabata · 8 Rounds (20/10s) (1 exercise) — Mountain Climbers.

**Session adjustments** (workout plan):

> Goal-driven duration (uncapped). Training phase: Standard Progression (RPE 7-8). Recent trend: Appropriately Challenging. Anchor lift reference: Deadlift 305×3.

No raw `Macro planning context: {"duration_minutes":…}` in the athlete-facing UI.

---

## 6. Legacy workouts

Workouts generated before this split may still have:

- Duplicated brief text in `workout_set.description` / session description.
- Macro JSON appended to `tasks.description`.

The resolver strips macro suffixes for the header and backfills session adjustments from that JSON when dedicated fields are missing. Structure is always derivable from blocks.

---

## 7. Key files

| Concern                       | File                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------- |
| Narrative helpers             | `src/lib/workout-factory/workout-viewer-narrative.ts`                        |
| Stop macro-in-description     | `src/lib/workout-factory/buddy-persona.ts`                                   |
| Intake in Vertex prompt only  | `src/lib/workout-factory/prompt-chain/fill-parametric-outline.ts`            |
| Persist rationale on generate | `src/lib/workout-factory/generate-workout-outline-fill-runner.ts`            |
| Viewer chrome labels          | `src/components/fitness/workout-block-renderer/WorkoutBlockListRenderer.tsx` |
| Task save after generate      | `src/components/modals/task-modal/hooks/useTaskWorkoutAi.ts`                 |
