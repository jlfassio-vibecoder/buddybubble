# Architecture

Normative architecture for BuddyBubble’s AI-native surfaces: how **Personas**, **Context**, **Canvas**, and **Rails** fit together.

## Start here

- **[Persona-Context-Canvas (PCC) Manifesto](./pcc-manifesto.md)** — values and guiding principles for parametric co-pilots, closed-world schemas, and domain-agnostic blocks. **Read this before** changing Coach output, task metadata merge, or chat rails.
- **[Coach two-path editor architecture](../agents/coach/README.md#two-path-workout-editor-architecture)** — creation (`proposed_workout_metadata`) vs surgical rich-canvas mutation (`structural_patch`), including schema pruning and the client draft effect path.

## Implementation epics (PCC in code)

| Epic                      | Path                                                                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parametric workout blocks | [../refactor/parametric-workout-blocks/README.md](../refactor/parametric-workout-blocks/README.md)                                                                           |
| Workout metadata merge    | [../refactor/workout-metadata-merge/README.md](../refactor/workout-metadata-merge/README.md)                                                                                 |
| Standard task chat rail   | [../refactor/standard-task-chat-rail/README.md](../refactor/standard-task-chat-rail/README.md)                                                                               |
| Coach live co-pilot       | [../refactor/coach-live-copilot/README.md](../refactor/coach-live-copilot/README.md) _(historical blueprint; prefer the Coach README two-path section for current behavior)_ |

## Surface docs

| Surface                 | Path                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Standard task chat rail | [../rails/standard-task-chat-rail/README.md](../rails/standard-task-chat-rail/README.md) |
| Workout coach rail      | [../rails/workout-coach-rail/README.md](../rails/workout-coach-rail/README.md)           |
| Workout viewer / canvas | [../fitness/workout-viewer-dialog.md](../fitness/workout-viewer-dialog.md)               |

## Domain UI (fitness Social Space)

Fitness boards, workout viewer, and player mount in the dashboard shell; they **consume** the Canvas produced by merge and parametric blocks.

- [../fitness/README.md](../fitness/README.md)
- [../fitness/workout-viewer-dialog.md](../fitness/workout-viewer-dialog.md) — Task Modal canvas draft handle + Coach effect wiring

## Assessments (non-normative)

Older or feature-scoped reviews; use the PCC manifesto as the decision lens when they disagree.

- [../agents/coach/ARCHITECTURE_ASSESSMENT.md](../agents/coach/ARCHITECTURE_ASSESSMENT.md)
- [../BUBBLE_AGENTS_ARCHITECTURE_PLAN.md](../BUBBLE_AGENTS_ARCHITECTURE_PLAN.md)
- [../CHAT_ARCHITECTURE_ASSESSMENT.md](../CHAT_ARCHITECTURE_ASSESSMENT.md)
