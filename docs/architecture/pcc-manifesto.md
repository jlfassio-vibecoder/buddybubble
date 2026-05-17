# The Persona-Context-Canvas (PCC) Manifesto for AI-Native Application Development

> **Status:** adopted (May 2026). Use this document as the **decision lens** for Rails, Canvases, Personas, and parametric AI output. Implementation epics live under [`docs/refactor/`](../refactor/) and surface docs under [`docs/rails/`](../rails/).

---

## The Persona-Context-Canvas (PCC) Architecture

We are designing better ways of building AI-native software by moving beyond raw chat interfaces and developing strict, parametric co-pilot engines. Through this work, we have come to value:

- **Parametric structure** over conversational prose.
- **Permanent canvas state** over transient chat history.
- **Grounded live context** over latent model assumptions.
- **Domain-agnostic architecture** over hardcoded feature sets.

That is, while there is utility in the conversational interface, we build our foundations on the architectural truths of human expectation and behavior.

---

## Our Guiding Principles

### 1. The Canvas is the Source of Truth.

The Canvas is not a blank text document; it is a rigid, parametric data structure. It represents the permanent state of the work. It is both the input the system reads and the output the system writes.

### 2. The Rail is a Pipe, Not a Bucket.

The chat interface (the Rail) exists solely to facilitate the transactional handshake between the User, the Persona, and the Canvas. It streams intent and data, but it must never hold permanent state.

### 3. AI Autonomy is Earned Through Data Boundaries.

We do not rely on prompts to prevent UI breakage. We constrain the AI by forcing it to interact with the Canvas purely through strict, validated JSON block schemas. The Persona outputs data; the Canvas handles the rendering.

### 4. Context is a Living Triad.

Intelligence requires grounding. The Persona is powered by a triad of context: the User’s current state, the Temporal thread of the active conversation, and the Historical baselines of past Canvases.

### 5. The Persona is an Engine, Not an Identity.

The Persona defines the rules of engagement. It dictates how the Context is interpreted and what parametric modifications are permitted on the Canvas. It acts as the routing layer between human intent and structural change.

### 6. Blocks are Agnostic.

A well-architected system does not know its domain. A fitness workout, a financial budget, and an educational syllabus are simply different flavors injected into the exact same underlying state machine. Build the block, and the domain will follow.

---

## Vocabulary (BuddyBubble mapping)

| PCC term    | BuddyBubble meaning (typical)                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------ |
| **Canvas**  | Durable card / task state: `tasks.metadata`, structured `workout_set`, board-visible fields.     |
| **Rail**    | Chat surface that streams turns: `StandardTaskChatRail`, `WorkoutCoachRail`, bubble chat.        |
| **Persona** | Agent strategy + schema + guards: Coach, Buddy, Organizer (`agents/*`, Vertex structured JSON).  |
| **Context** | Task snapshot + thread + profile/history injected into `build-context` / Coach prompts.          |
| **Block**   | Validated parametric unit on the Canvas (e.g. `block_format` + `format_params` + `exercises[]`). |

When a design choice conflicts with this table, **update the implementation to match the manifesto**, or escalate an explicit product exception in the relevant epic README.

---

## Related implementation docs

| Doc                                                                          | Role                                                                               |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [Parametric workout blocks](../refactor/parametric-workout-blocks/README.md) | Closed-world `block_format` blueprints on the workout Canvas (principles 1, 3, 6). |
| [Workout metadata merge](../refactor/workout-metadata-merge/README.md)       | Coach JSON → canonical `workout_set` tree (principle 1).                           |
| [Standard task chat rail](../refactor/standard-task-chat-rail/README.md)     | Domain-neutral Rail for task-scoped co-pilot (principle 2).                        |
| [Coach live co-pilot](../refactor/coach-live-copilot/README.md)              | Live Canvas + Rail handshake for generated workouts (principles 1, 4).             |
| [Workout coach rail](../rails/workout-coach-rail/README.md)                  | Workout-specific Rail (principle 2; specialized Persona surface).                  |
| [BUBBLE_AGENTS_ARCHITECTURE_PLAN.md](../BUBBLE_AGENTS_ARCHITECTURE_PLAN.md)  | Pre-PCC agent plan (historical; defer to this manifesto for new work).             |

---
