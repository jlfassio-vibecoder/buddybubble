# Coach Agent — implementation reference

This document describes the **current** BuddyBubble **Coach** (`slug: coach`) end-to-end: identity, dispatch, Gemini contract, Postgres RPCs, and client surfaces. It supersedes conceptual-only material in:

- [`docs/BUBBLE_AGENTS_ARCHITECTURE_PLAN.md`](../docs/BUBBLE_AGENTS_ARCHITECTURE_PLAN.md) — pre-implementation architecture (e.g. single-tool `create_kanban_card` story).
- [`docs/agents/adding-a-coach.md`](../docs/agents/adding-a-coach.md) — Phase-4 checklist (still useful for **provisioning** a new agent slug; see [Adding or extending coaches](#adding-or-extending-coaches) below for Coach-specific reality).
- [`docs/refactor/agent-routing-audit.md`](../docs/refactor/agent-routing-audit.md) — resolver / typing-indicator refactor notes (aligned with `resolveTargetAgent` + `useAgentResponseWait`).
- [`docs/agents/adding-an-organizer-variant.md`](../docs/agents/adding-an-organizer-variant.md) — Organizer is a **separate** dispatcher; not covered here.
- [`coach/ARCHITECTURE_ASSESSMENT.md`](./ARCHITECTURE_ASSESSMENT.md) — gap analysis and recommendations against the implementation described here.

When in doubt, **trust the code** paths cited here.

---

## Role in the product

Coach is the **fitness** Bubble Agent: consultative workout guidance, optional Kanban **workout** cards (`tasks.item_type = 'workout'`), **task-scoped draft proposals** the user finalizes, **silent workout-player** open greets, and **live in-session** log updates via `execution_patch` on agent messages.

It is **not** the Organizer (community) agent or the Buddy (general / app help) agent; those use different dispatchers and prompts.

---

## Identity and database

| Piece                          | Purpose                                                                                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.agent_definitions`     | Catalog row for Coach: `slug`, `mention_handle`, `display_name`, `avatar_url`, `auth_user_id`, `is_active`, `response_timeout_ms`, etc.                                                 |
| `public.bubble_agent_bindings` | Which agents are enabled **per bubble** (`enabled`, `sort_order`). Coach must be bound for the bubble to receive Coach dispatch and for the client to list Coach in `useMessageThread`. |
| `public.users` + `auth.users`  | Coach posts messages as a real user id (`auth_user_id`), same as the architecture plan.                                                                                                 |
| `response_timeout_ms`          | Drives client typing-indicator failsafes via `useAgentResponseWait` (see migration `20260722120000_agent_definitions_response_timeout.sql`).                                            |

**Fitness bubbles:** Coach bindings are **automatically** ensured for fitness template bubbles (migration `20260726120000_backfill_fitness_coach_bubble_bindings.sql` and bubble-creation paths). New non-fitness spaces still use the manual binding pattern from the “adding a coach” doc.

---

## Dispatch: webhook → Edge Function

1. **Trigger:** Supabase **database webhook** on `public.messages` **INSERT** (payload filtered to `schema=public`, `table=messages`, `type=INSERT` in code).
2. **Handler:** [`supabase/functions/bubble-agent-dispatch/index.ts`](../supabase/functions/bubble-agent-dispatch/index.ts) (service role + shared secret, `verify_jwt: false` — see `supabase/config.toml`).
3. **Secrets:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BUBBLE_AGENT_WEBHOOK_SECRET`, `GEMINI_API_KEY`; optional `GEMINI_MODEL` / `VERTEX_GEMINI_MODEL`, `GEMINI_FETCH_TIMEOUT_MS`.

**Not handled here**

- **Organizer** — slug `organizer` is **filtered out** of the binding list so the shared webhook does not double-fire with `organizer-agent-dispatch` (see `DISPATCHER_EXCLUDED_SLUGS` in `bubble-agent-dispatch`).
- **Buddy** — product pipeline is [`buddy-agent-dispatch`](../supabase/functions/buddy-agent-dispatch/index.ts). The client may merge Buddy from `agent_definitions` without a per-bubble binding; Coach resolution in the Edge Function uses **`bubble_agent_bindings` only** (so `@Buddy` in a bubble is not the same as Coach routing in this function — Buddy’s mentions are intended to be served by the Buddy webhook).

**Loop prevention:** Messages whose `user_id` matches an **active** `agent_definitions.auth_user_id` are skipped (`skipped: 'author_is_agent'`).

---

## How the target agent is resolved (server)

Order of operations (must stay aligned with [`src/lib/agents/resolveTargetAgent.ts`](../src/lib/agents/resolveTargetAgent.ts) on the client):

1. **@mention** — first `\w+` handle in `content` that matches a **bound** agent’s `mention_handle` (order from `sort_order` then `slug`, after excluding `organizer`).
2. **Root default** — for **root** messages (`parent_id` empty), read `metadata.default_agent_slug` (lowercased). If that slug exists among bound agents, it selects Coach when the user did not type `@...`. This is the **server-side** counterpart to `contextDefaultAgentSlug` in the client resolver.
3. **Thread continuation** — for replies with `parent_id` set, if no mention/default, walk recent thread history and if an **earlier** message in the thread was authored by a bound agent, continue with that agent.

If nothing matches → `skipped: 'no_agent_mention'` (no Gemini call).

---

## Coach flow modes (implementation, not a single “tool”)

The architecture plan’s “one tool / create card” model is **narrower** than production. Coach behavior is actually **four** intertwined modes.

### 1) New workout card (Kanban `workout` task)

- Model may set `create_card: true` with `task_title`, `task_description`, and optional `coach_task_notes` (seeded as a **task comment** on create).
- Persisted via **`agent_create_card_and_reply`** (see [Postgres RPCs](#postgres-rpcs)).
- **Layer B turn gate (server, overrides model):** if `user_requested_immediate_card` is false:
  - **First human user turn in the thread** (`priorUserMessageCount === 0`) → **never** create a card (`create_card` forced false; title/description/seed cleared). So even a confident model output cannot create a card on the first message.
  - If `session_request` is true and there are **fewer than two** user messages, card creation is also blocked (`session_request_turn_gate`).
- Waivers: `user_requested_immediate_card: true` skips that gate.

### 2) Revise an **existing** workout card — draft in chat, user finalizes

- When the thread is tied to a **known task** (`knownTargetTaskId` from `target_task_id` / task context) and the model returns `update_existing_task: true` with title, description, and/or `proposed_workout_metadata`, the Edge Function calls **`agent_insert_coach_workout_draft_reply`**.
- That inserts a Coach **reply** with `messages.metadata.coach_draft` (`pending` / `accepted` / `superseded` — see [`src/types/coach-draft.ts`](../src/types/coach-draft.ts)) and does **not** mutate `tasks` until the user accepts.
- The user calls **`apply_workout_draft(p_message_id)`** (authenticated RPC) from the UI ([`src/components/chat/CoachDraftCard.tsx`](../src/components/chat/CoachDraftCard.tsx)) to merge the draft into the task and mark the draft applied.

### 3) Workout player **silent sentinel** (opening greeting)

- The workout rail sends a **hidden** one-shot user message: content **`[SYSTEM_EVENT: WORKOUT_CONTEXT]`** (must match the Edge constant and `WorkoutCoachRail`).
- Metadata carries `workoutContext`, `workout_task_title`, `is_silent_sentinel: true`, session/class ids, etc.
- The function handles this **before** the main JSON coach flow: a **dedicated** small Gemini call (`geminiGenerateWorkoutOpenGreeting`) produces a short human greeting; persistence uses **`agent_create_card_and_reply`** with `p_create_card: false`.
- The sentinel path requires resolved agent slug **`coach`**; otherwise `workout_context_sentinel_not_coach`.
- The rail **filters** the sentinel string out of the visible transcript (users never see the token).

### 4) Mid-workout support + **execution_patch** (live `WorkoutPlayer` grid)

- **CURRENT WORKOUT CONTEXT** is built from `metadata.workoutContext` / `workout_context` on thread messages (latest non-empty payload wins) plus a fixed **mid-workout directive** in the system prompt.
- The model can return `execution_patch`: an array of `{ exerciseIndex, setIndex, weight?, reps?, rpe?, done? }` (0-based indices aligned with the player).
- After `agent_create_card_and_reply` (or draft RPC) succeeds, the function may **`mergeExecutionPatchIntoAgentReplyMetadata`** to attach `execution_patch` to the **agent’s reply** row in `messages.metadata`.
- The client does **not** re-fetch exercises from this alone: [`WorkoutCoachRail`](../src/components/chat/WorkoutCoachRail.tsx) watches the **latest** Coach message and, if valid, calls `onApplyExecutionPatch` → [`WorkoutPlayer`](../src/components/fitness/WorkoutPlayer.tsx) `handleApplyExecutionPatch` updates the **local** set grid.

---

## Gemini: structured JSON (not in the old plan)

Coach uses the **Generative Language API** with `responseMimeType: application/json` and a **large `responseSchema`** (object with required fields such as `reply_content`, `create_card`, `intake_phase`, `session_readiness_score`, `missing_intake_categories`, `user_requested_immediate_card`, `session_request`, pre-draft confirmation rules, `proposed_workout_metadata`, `execution_patch`, etc.).

Notable **schema / prompt concepts** (see `geminiGenerateJson` and `baseCoachPrompt` in `bubble-agent-dispatch`):

- **Intake:** `intake_phase`, `session_readiness_score`, `missing_intake_categories` (enum lists defined in the Edge file).
- **Pre-draft confirmation** — human-in-the-loop: model must not claim a draft is already saved; uses `pre_draft_confirmation` style behavior described in the long system prompt.
- **Coach task notes** — when creating a card, `coach_task_notes` seeds the task thread; server may append a standard CTA paragraph if missing (`ensureCoachTaskNotesCta`).

The architecture plan does **not** list these fields; the **file header** and `CoachGeminiJsonResponse` type in `bubble-agent-dispatch` are authoritative.

---

## Postgres RPCs

| RPC                                      | Who invokes                            | Role                                                                                                                                                                                                                         |
| ---------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent_create_card_and_reply`            | `bubble-agent-dispatch` (service role) | Atomic: insert Coach reply; optionally create `workout` task; optional task-comment seed. Early migrations: `20260528100000_…`, thread id `20260530120000_…`, task type `20260529120000_…`, seed comment `20260531100000_…`. |
| `agent_insert_coach_workout_draft_reply` | `bubble-agent-dispatch` (service role) | Insert reply with `metadata.coach_draft` only (no direct `tasks` update). Migration: `20260623120000_coach_workout_draft_messages_metadata.sql`.                                                                             |
| `apply_workout_draft`                    | Authenticated user (client)            | Merge `coach_draft` into the task; update draft state. Same migration file.                                                                                                                                                  |

---

## Client routing and “typing” UX (agent-agnostic layer)

| Piece                                                              | Role                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`resolveTargetAgent.ts`](../src/lib/agents/resolveTargetAgent.ts) | First `@mention` wins, else `contextDefaultAgentSlug` if that agent exists in the loaded list.                                                                                                                                                                 |
| [`useAgentResponseWait.ts`](../src/hooks/useAgentResponseWait.ts)  | After send, shows pending typing state until an agent message arrives or `response_timeout_ms` elapses.                                                                                                                                                        |
| [`useMessageThread.ts`](../src/hooks/useMessageThread.ts)          | Loads `bubble_agent_bindings` + `agent_definitions`, merges **Buddy** globally, ordered for consistent mention resolution.                                                                                                                                     |
| [`resolveAgentAvatar.ts`](../src/lib/agents/resolveAgentAvatar.ts) | Avatars for agent messages.                                                                                                                                                                                                                                    |
| `messages.metadata.default_agent_slug`                             | **Root-only** server hint: matches resolver default so “no @mention” messages still dispatch to Coach. **Without this metadata on the insert, plain-text routing may not hit Coach on the server** even if the client resolved Coach for the typing indicator. |

**Surfaces that set `contextDefaultAgentSlug` / `default_agent_slug` to `coach`**

- [`ChatArea.tsx`](../src/components/chat/ChatArea.tsx) — `CHAT_AREA_DEFAULT_AGENT_SLUG = 'coach'`; sends `metadata: { default_agent_slug: 'coach' }` for Coach sends where applicable.
- [`TaskModalCommentsPanel.tsx`](../src/components/modals/task-modal/TaskModalCommentsPanel.tsx) — `TASK_COMMENTS_DEFAULT_AGENT_SLUG = 'coach'`.
- [`WorkoutCoachRail.tsx`](../src/components/chat/WorkoutCoachRail.tsx) — same default for Coach tab; **Buddy** tab prefixes `@Buddy` so the Buddy pipeline can own routing without relying on `default_agent_slug` for that send.

---

## File map (Coach-related)

| Area                            | Path                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| Edge dispatch                   | `supabase/functions/bubble-agent-dispatch/index.ts`                                               |
| Workout rail UI                 | `src/components/chat/WorkoutCoachRail.tsx`                                                        |
| Draft card + finalize           | `src/components/chat/CoachDraftCard.tsx`, `src/types/coach-draft.ts`                              |
| Live player patch types / apply | `src/types/execution-patch.ts`, `src/components/fitness/WorkoutPlayer.tsx`                        |
| Default Coach in main/task chat | `src/components/chat/ChatArea.tsx`, `src/components/modals/task-modal/TaskModalCommentsPanel.tsx` |

---

## Adding or extending coaches

For a **new** agent slug (e.g. another vertical), follow the operational steps in [`docs/agents/adding-a-coach.md`](../docs/agents/adding-a-coach.md) (provision user, `agent_definitions`, `bubble_agent_bindings`, and surface `contextDefaultAgentSlug`).

**Coach-specific note:** the **fitness** Gemini prompt, JSON schema, RPC branching (`workout` task type, draft RPCs, execution_patch), and WorkoutPlayer wiring are **coupled to the `coach` slug and fitness UX**. Reusing the same Edge Function for a second “coach” slug would require explicit product/engineering work (prompt branching, binding surfaces, and possibly separate RPCs).

---

## Changelog of doc vs code (why this README exists)

| Doc / plan                        | Mismatch (fixed here)                                                                                                                                                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BUBBLE_AGENTS_ARCHITECTURE_PLAN` | Suggested mention-only gating; production also uses `metadata.default_agent_slug` and thread continuation. No `execution_patch`, `coach_draft`, or sentinel. Single-tool story; production uses `responseSchema` + **Layer B** + multiple RPCs. |
| `adding-a-coach.md`               | Implies `default` is only in ChatArea and TaskModal; **`WorkoutCoachRail`** is also a first-class `coach` surface, plus sentinel + Buddy toggle.                                                                                                |
| “@Coach tool”                     | Actual contract is **Gemini JSON** with many fields and **server-side** turn gates, not a single tool name.                                                                                                                                     |

---

_Last reviewed against the repository layout and `bubble-agent-dispatch` implementation as of the document’s author date; when behavior shifts, update this file and prefer linking migrations by filename from `supabase/migrations/`._
