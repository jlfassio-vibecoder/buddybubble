# Coach Agent — implementation reference

This document describes the **current** BuddyBubble **Coach** (`slug: coach`) end-to-end: identity, dispatch, Gemini contract, Postgres RPCs, and client surfaces. It supersedes conceptual-only material in:

- [`docs/BUBBLE_AGENTS_ARCHITECTURE_PLAN.md`](../../BUBBLE_AGENTS_ARCHITECTURE_PLAN.md) — pre-implementation architecture (e.g. single-tool `create_kanban_card` story).
- [`docs/agents/adding-a-coach.md`](../adding-a-coach.md) — Phase-4 checklist (still useful for **provisioning** a new agent slug; see [Adding or extending coaches](#adding-or-extending-coaches) below for Coach-specific reality).
- [`docs/refactor/agent-routing-audit.md`](../../refactor/agent-routing-audit.md) — resolver / typing-indicator refactor notes (aligned with `resolveTargetAgent` + `useAgentResponseWait`).
- [`docs/agents/adding-an-organizer-variant.md`](../adding-an-organizer-variant.md) — Organizer is a **separate** dispatcher; not covered here.
- [`docs/agents/coach/ARCHITECTURE_ASSESSMENT.md`](./ARCHITECTURE_ASSESSMENT.md) — gap analysis and recommendations against the implementation described here.
- [`docs/agents/vertex-setup.md`](../vertex-setup.md) — GCP project, Service Account, IAM, key rotation, and quotas for the consolidated `agent-dispatch` Edge Function (the only agent dispatcher post-Phase 6).
- [`docs/agents/observability.md`](../observability.md) — copy-paste Supabase Logs queries for error budget, latency (LLM and end-to-end), fallback rate, and Vertex token usage.

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
2. **Handler:** [`supabase/functions/agent-dispatch/index.ts`](../../../supabase/functions/agent-dispatch/index.ts) routes to the per-slug strategy at [`supabase/functions/agents/coach/strategy.ts`](../../../supabase/functions/agents/coach/strategy.ts) (service role + shared secret, `verify_jwt: false` — see `supabase/config.toml`).
3. **Secrets** (consolidated Phase 1 bundle): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AGENT_WEBHOOK_SECRET`, `GCP_PROJECT_ID`, `GCP_LOCATION`, `GCP_SERVICE_ACCOUNT_JSON`, `LLM_TIMEOUT_MS`. The legacy `BUBBLE_AGENT_WEBHOOK_SECRET` / `GEMINI_API_KEY` / `GEMINI_MODEL` / `VERTEX_GEMINI_MODEL` / `GEMINI_FETCH_TIMEOUT_MS` envs were retired in Phase 6 — see [`secrets-matrix.md`](../../refactor/vertex-agent-dispatch-consolidation/secrets-matrix.md).

**Not handled here**

- **Organizer** — the shared webhook now proceeds only for resolved slug `coach`, so Organizer and any other non-Coach slug short-circuit with `skipped: 'not_handled_by_coach_dispatcher'`.
- **Buddy** — product pipeline is [`buddy-agent-dispatch`](../../../supabase/functions/buddy-agent-dispatch/index.ts). The client may merge Buddy from `agent_definitions` without a per-bubble binding; Coach resolution in the Edge Function uses **`bubble_agent_bindings` only** (so `@Buddy` in a bubble is not the same as Coach routing in this function — Buddy’s mentions are intended to be served by the Buddy webhook).

**Loop prevention:** Messages whose `user_id` matches an **active** `agent_definitions.auth_user_id` are skipped (`skipped: 'author_is_agent'`).

---

## How the target agent is resolved (server)

Order of operations (must stay aligned with [`src/lib/agents/resolveTargetAgent.ts`](../../../src/lib/agents/resolveTargetAgent.ts) on the client):

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
- That inserts a Coach **reply** with `messages.metadata.coach_draft` (`pending` / `accepted` / `superseded` — see [`src/types/coach-draft.ts`](../../../src/types/coach-draft.ts)) and does **not** mutate `tasks` until the user accepts.
- The user calls **`apply_workout_draft(p_message_id)`** (authenticated RPC) from the UI ([`src/components/chat/CoachDraftCard.tsx`](../../../src/components/chat/CoachDraftCard.tsx)) to merge the draft into the task and mark the draft applied.

### 3) Workout player **silent sentinel** (opening greeting)

- The workout rail sends a **hidden** one-shot user message with user-facing content **`Started a workout session.`**; routing and filtering use metadata, not the displayed body. Legacy rows with **`[SYSTEM_EVENT: WORKOUT_CONTEXT]`** are still treated as sentinels.
- Metadata carries `workoutContext`, `workout_task_title`, `is_silent_sentinel: true`, session/class ids, etc.
- The function handles this **before** the main JSON coach flow: a **dedicated** small Gemini call (`geminiGenerateWorkoutOpenGreeting`) produces a short human greeting; persistence uses **`agent_create_card_and_reply`** with `p_create_card: false`.
- The sentinel path requires resolved agent slug **`coach`**; otherwise `workout_context_sentinel_not_coach`.
- The rail **filters** the sentinel row out of the visible transcript and does **not** arm `useAgentResponseWait` for this bootstrap send; only explicit user messages show the typing indicator.

### 4) Mid-workout support + **execution_patch** (live `WorkoutPlayer` grid)

- **CURRENT WORKOUT CONTEXT** is built from `metadata.workoutContext` / `workout_context` on prior messages (latest non-empty payload wins), with a **`tasks.metadata` fallback** when the 50-message history no longer contains a valid payload (so the sentinel is not required to stay in-window), plus a fixed **mid-workout directive** in the system prompt.
- History loading is **task-aware**: when the trigger row has `target_task_id`, the Edge Function loads recent messages for that full task-scoped conversation instead of only Slack-style `parent_id` replies. This keeps live workout turns aligned with what `WorkoutCoachRail` shows the user.
- The model can return `execution_patch`: an array of `{ exerciseIndex, setIndex, weight?, reps?, rpe?, done? }` (0-based indices aligned with the player).
- The mid-workout prompt no longer nudges Coach to ask about moving to the next exercise after every patch; transitions should follow the user's conversational flow.
- **`agent_create_card_and_reply`** and **`agent_insert_coach_workout_draft_reply`** accept `p_execution_patch` and write `messages.metadata.execution_patch` on the **same INSERT** as the agent reply (migration `20260729120000_agent_rpcs_persist_execution_patch.sql`) — a single `postgres_changes` event for clients.
- The client does **not** re-fetch exercises from this alone: [`WorkoutCoachRail`](../../../src/components/chat/WorkoutCoachRail.tsx) watches the **latest** Coach message and, if valid, calls `onApplyExecutionPatch` → [`WorkoutPlayer`](../../../src/components/fitness/WorkoutPlayer.tsx) `handleApplyExecutionPatch` updates the **local** set grid.

### 5) **personal_cues_patch** (saved cues — user + catalog exercise)

- Mid-workout (and other turns), the model may return **`personal_cues_patch`**: short text keyed by **`exerciseIndex`** (same roster as `execution_patch`). The dispatcher resolves each index to an **`exercise_dictionary`** id once per request (`loadExerciseDictionaryByIndex`); **custom** exercises without a catalog match are dropped server-side (see `cue_unanchored` logging).
- Parsed rows are passed as **`p_personal_cues`** into the same agent RPCs as replies; Postgres runs **`apply_personal_cues_for_user`** to upsert **`public.user_exercise_notes`** (`user_id`, `exercise_dictionary_id`) with append/replace semantics. **`tasks.metadata.exercises`** is not modified — this avoids the shallow JSON merge in **`apply_workout_draft`** wiping enrichment fields (known limitation for the **draft-card** path only; personal cues never go through that merge).
- Reply metadata can include the patch for observability (`personal_cues_patch` / related keys depending on RPC). The **WorkoutPlayer** loads notes via [`useUserExerciseNotes`](../../../src/hooks/useUserExerciseNotes.ts) (dictionary lookup + Realtime on `user_exercise_notes`).
- **`assertCoachReplySelfAttestation`** rejects replies whose **`reply_content`** claims a write without a matching structured field (`execution_patch`, **`personal_cues_resolved`**, card/draft fields) → fallback-eligible **`self_attestation_mismatch`**.

### 5b) **workout_cues_patch** (workout-scoped cues — M3)

- Distinct from **`personal_cues_patch`** (user-scoped → `user_exercise_notes`). **`workout_cues_patch`** is keyed by **`resolution_key`** (flat/block exercise identity) and is written to **reply metadata only** via **`p_workout_cues_patch`** on agent RPCs.
- Triggered when the user clicks **Ask Coach** in the workout viewer: the client sends hidden **`messages.metadata.exercise_cue_request`** (`ExerciseCueRequestV1`) with a short visible `@coach` line. Coach prompts with **`EXERCISE_CUE_REQUEST`** rules (proactive confirm first turn; generate on affirm).
- **`useAgentEffectSweep`** delivers **`onWorkoutCuesPatch`** → Task Modal **`handleWorkoutViewerCuePatches`** → [`applyCuePatchesToMetadata`](../../../src/lib/workout-factory/apply-cue-patches-to-metadata.ts). User still **Save**s the task footer to persist DB rows.

---

## Gemini: structured JSON (not in the old plan)

Coach uses the **Generative Language API** with `responseMimeType: application/json` and a **large `responseSchema`** (object with required fields such as `reply_content`, `create_card`, `intake_phase`, `session_readiness_score`, `missing_intake_categories`, `user_requested_immediate_card`, `session_request`, pre-draft confirmation rules, `proposed_workout_metadata`, `execution_patch`, `personal_cues_patch`, etc.).

Notable **schema / prompt concepts** (see `geminiGenerateJson` and `baseCoachPrompt` in `bubble-agent-dispatch`):

- **Intake:** `intake_phase`, `session_readiness_score`, `missing_intake_categories` (enum lists defined in the Edge file).
- **Pre-draft confirmation** — human-in-the-loop: model must not claim a draft is already saved; uses `pre_draft_confirmation` style behavior described in the long system prompt.
- **Coach task notes** — when creating a card, `coach_task_notes` seeds the task thread; server may append a standard CTA paragraph if missing (`ensureCoachTaskNotesCta`).

The architecture plan does **not** list these fields; the **file header** and `CoachGeminiJsonResponse` type in `bubble-agent-dispatch` are authoritative.

---

## Postgres RPCs

| RPC                                      | Who invokes                     | Role                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent_create_card_and_reply`            | `agent-dispatch` (service role) | Atomic: insert Coach reply; optionally create `workout` task; optional task-comment seed; optional `p_execution_patch` and **`p_personal_cues`** on reply metadata; applies personal cues via **`apply_personal_cues_for_user`**. See `20260813120000_user_exercise_notes_and_personal_cues_rpc.sql` and earlier migrations. |
| `agent_insert_coach_workout_draft_reply` | `agent-dispatch` (service role) | Insert reply with `metadata.coach_draft` (and optional `execution_patch` / **`p_personal_cues`** on the same row); no direct `tasks` update.                                                                                                                                                                                 |
| `apply_workout_draft`                    | Authenticated user (client)     | Merge `coach_draft` into the task; update draft state. Same migration file.                                                                                                                                                                                                                                                  |
| `exercise_dictionary_lookup_by_names`    | Authenticated + service role    | Resolves exercise **names** → dictionary ids (used by WorkoutPlayer hook and Coach dispatch). **`authenticated` execute** granted in `20260813120200_grant_exercise_dictionary_lookup_authenticated.sql`.                                                                                                                    |
| `apply_personal_cues_for_user`           | Service (internal)              | **`security definer`**: merge **`p_personal_cues`** jsonb into **`user_exercise_notes`** for a user; invoked from agent RPCs above.                                                                                                                                                                                          |

**Known issue (`apply_workout_draft`):** shallow JSONB merge can drop nested enrichment on `tasks.metadata.exercises`. Unrelated to personal cues; track as a follow-up.

---

## Client routing and “typing” UX (agent-agnostic layer)

| Piece                                                                    | Role                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`resolveTargetAgent.ts`](../../../src/lib/agents/resolveTargetAgent.ts) | First `@mention` wins, else `contextDefaultAgentSlug` if that agent exists in the loaded list.                                                                                                                                                                 |
| [`useAgentResponseWait.ts`](../../../src/hooks/useAgentResponseWait.ts)  | After explicit user sends, shows pending typing state until an agent message arrives or `response_timeout_ms` elapses. Hidden sentinel bootstrap sends intentionally do not arm this hook.                                                                     |
| [`useMessageThread.ts`](../../../src/hooks/useMessageThread.ts)          | Loads `bubble_agent_bindings` + `agent_definitions`, merges **Buddy** globally, ordered for consistent mention resolution.                                                                                                                                     |
| [`resolveAgentAvatar.ts`](../../../src/lib/agents/resolveAgentAvatar.ts) | Avatars for agent messages.                                                                                                                                                                                                                                    |
| `messages.metadata.default_agent_slug`                                   | **Root-only** server hint: matches resolver default so “no @mention” messages still dispatch to Coach. **Without this metadata on the insert, plain-text routing may not hit Coach on the server** even if the client resolved Coach for the typing indicator. |

**Surfaces that set `contextDefaultAgentSlug` / `default_agent_slug` to `coach`**

- [`ChatArea.tsx`](../../../src/components/chat/ChatArea.tsx) — `CHAT_AREA_DEFAULT_AGENT_SLUG = 'coach'`; sends `metadata: { default_agent_slug: 'coach' }` for Coach sends where applicable.
- [`TaskModalCommentsPanel.tsx`](../../../src/components/modals/task-modal/TaskModalCommentsPanel.tsx) — `TASK_COMMENTS_DEFAULT_AGENT_SLUG = 'coach'`.
- [`WorkoutCoachRail.tsx`](../../../src/components/chat/WorkoutCoachRail.tsx) — same default for Coach tab; **Buddy** tab prefixes `@Buddy` so the Buddy pipeline can own routing without relying on `default_agent_slug` for that send.
- [`StandardTaskChatRail.tsx`](../../../src/components/chat/StandardTaskChatRail.tsx) — TaskModal task-scoped rail (`metadata.surface = standard_task_chat_rail`). Composer tokens (`@`, `#`, future block blueprints): see [`rail-composer-tokens.md`](./rail-composer-tokens.md).

---

## File map (Coach-related)

| Area                            | Path                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Edge dispatch                   | `supabase/functions/agent-dispatch/index.ts` + Coach strategy at `supabase/functions/agents/coach/strategy.ts`           |
| Workout rail UI                 | `src/components/chat/WorkoutCoachRail.tsx`                                                                               |
| TaskModal standard rail         | `src/components/chat/StandardTaskChatRail.tsx` — composer tokens: [`rail-composer-tokens.md`](./rail-composer-tokens.md) |
| Draft card + finalize           | `src/components/chat/CoachDraftCard.tsx`, `src/types/coach-draft.ts`                                                     |
| Live player patch types / apply | `src/types/execution-patch.ts`, `src/components/fitness/WorkoutPlayer.tsx`                                               |
| Personal cues hook + storage    | `src/hooks/useUserExerciseNotes.ts`, `public.user_exercise_notes`                                                        |
| Default Coach in main/task chat | `src/components/chat/ChatArea.tsx`, `src/components/modals/task-modal/TaskModalCommentsPanel.tsx`                        |

---

## Adding or extending coaches

For a **new** agent slug (e.g. another vertical), follow the operational steps in [`docs/agents/adding-a-coach.md`](../adding-a-coach.md) (provision user, `agent_definitions`, `bubble_agent_bindings`, and surface `contextDefaultAgentSlug`).

**Coach-specific note:** the **fitness** Gemini prompt, JSON schema, RPC branching (`workout` task type, draft RPCs, execution_patch), and WorkoutPlayer wiring are **coupled to the `coach` slug and fitness UX**. Reusing the same Edge Function for a second “coach” slug would require explicit product/engineering work (prompt branching, binding surfaces, and possibly separate RPCs).

---

## Changelog of doc vs code (why this README exists)

| Doc / plan                        | Mismatch (fixed here)                                                                                                                                                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BUBBLE_AGENTS_ARCHITECTURE_PLAN` | Suggested mention-only gating; production also uses `metadata.default_agent_slug` and thread continuation. No `execution_patch`, `coach_draft`, or sentinel. Single-tool story; production uses `responseSchema` + **Layer B** + multiple RPCs. |
| `adding-a-coach.md`               | Implies `default` is only in ChatArea and TaskModal; **`WorkoutCoachRail`** is also a first-class `coach` surface, plus sentinel + Buddy toggle.                                                                                                |
| “@Coach tool”                     | Actual contract is **Gemini JSON** with many fields and **server-side** turn gates, not a single tool name.                                                                                                                                     |

---

## Observability

The consolidated `agent-dispatch` function emits one structured JSON line per
phase (`received` → `routed` → `preflight` → `llm_call` → `llm_done` →
`parsed` → `guarded` → `persisted` → `done`, plus `fallback` on recovered
errors). `request_id` is present on every line emitted after the webhook is
parsed; `slug`, `message_id`, and `bubble_id` are attached starting with the
`routed` phase (once routing has resolved a strategy). The `llm done` and
`dispatch done` lines also carry `latency_ms`, and `llm done` carries
`token_in` / `token_out` when Vertex returns `usageMetadata`. Pre-routing
lines (`webhook received`, `dispatcher env invalid`) intentionally lack
`slug`; see [`docs/agents/observability.md`](../observability.md) §1 for the
full per-`msg` field guarantees.

Copy-paste Supabase Logs queries for the four operational questions —
**error budget**, **latency** (Vertex round-trip and end-to-end),
**fallback rate**, and **token usage / GCP cost projection** — live in
[`docs/agents/observability.md`](../observability.md). When the queries
return surprising numbers, that doc also shows how to trace a single
`request_id` across all of its phase log lines.

For deep-dive debugging, set `LLM_DEBUG=1` in the function's Edge secrets to
raise the shared LLM modules to debug-level emission (full Vertex request
bodies, retry deltas). Unset it once the investigation is finished — the
volume is high and the request bodies contain prompts. This single flag
replaces the legacy per-agent `BUDDY_AGENT_DEBUG` and `ORGANIZER_AGENT_DEBUG`
toggles, which were retired with the legacy dispatcher functions in Phase 6.

---

_Last reviewed against the repository layout, the consolidated `agent-dispatch` function, and the Coach strategy at `supabase/functions/agents/coach/strategy.ts` on the Phase 7b PR; when behavior shifts, update this file and prefer linking migrations by filename from `supabase/migrations/`._
