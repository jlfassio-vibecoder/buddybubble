# Coach (Gemini) ↔ Vertex workout factory — handoff assessment and roadmap

## 1. Architecture snapshot

| Layer                                         | Role                                                | Key outputs                                                                                                    |
| --------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Edge** `bubble-agent-dispatch`              | @Coach (Gemini JSON)                                | `tasks.title`, `tasks.description`, optional seed `messages` (`coach_task_notes` → `p_seed_task_comment_text`) |
| **Task modal**                                | User edits card, clicks **AI workout**              | Calls `postGenerateWorkoutChain` with `workspace_id` + `persona` (title, description, duration)                |
| **API** `POST /api/ai/generate-workout-chain` | Auth, loads `fitness_profiles`, builds persona      | Delegates to `runGenerateWorkoutChain`                                                                         |
| **Vertex chain**                              | 4-step factory (`generate-workout-chain-runner.ts`) | Architect → Biomechanist → Equipment Coach → Mathematician                                                     |

The Kanban **brief** lives in `tasks.title` / `tasks.description`. The **executable** prescription is produced by Vertex into `metadata` + exercise rows after the user runs **AI workout**.

## 2. Gap analysis (root cause)

### 2.1 Equipment and intent drift

`buildBuddyWorkoutPersona` always set `availableEquipmentNames` from `**fitness_profiles.equipment`**, independent of the task brief. That list feeds `prepareWorkoutChainRequest` → `availableEquipment` → **Step 3 (Equipment Coach)**, which instructs the model to pick exercises **only from that list\*\*. Result: Vertex could honor the profile inventory even when the Coach brief specified different modalities (e.g. bands-only outdoor session).

### 2.2 Prompt hierarchy

Step 1 (Workout Architect) included Title/Description under “USER PROFILE” but did not state that the Kanban brief **overrides** profile goals/equipment. Demographics/medical remained appropriate as safety context; goals + equipment were not clearly secondary for the Coach-handoff path.

### 2.3 UI vs CTA copy

The task modal button label is **AI workout** (`TaskModalWorkoutFields.tsx`). Seed comments and prompts may say **Generate Workout** for product consistency — consider renaming the button or aligning CTA text in a follow-up.

## 3. Refactors implemented (Vertex handoff)

### 3.1 `WorkoutPersona.kanbanBriefAuthoritative`

Optional flag: when true, the Vertex chain treats **title + description** as the strict prescription brief; profile equipment is not injected as the equipment list.

### 3.2 `buildBuddyWorkoutPersona` (`buddy-persona.ts`)

- New param `workoutBriefAuthoritative` (API) and/or inference: long `description` (≥80 chars) or title+description (≥40 chars).
- When authoritative: `availableEquipmentNames` is replaced by a **single constraint sentence** telling Vertex to infer tools only from the brief (not catalog defaults).
- Sets `persona.kanbanBriefAuthoritative = true`.

### 3.3 API route (`generate-workout-chain/route.ts`)

- Request body: optional `workout_brief_authoritative`.
- Server also infers brief mode when `persona.description` is long (≥80 chars) even if the client omits the flag.

### 3.4 Client (`useTaskWorkoutAi.ts` + `api-client.ts`)

- Sends `workout_brief_authoritative: true` when **both** title and description are non-empty (typical Coach card before **AI workout**).

### 3.5 Prompts

- **Step 1** (`step1-workout-architect.ts`): “WORKOUT BRIEF (PRIMARY)” preamble + brief-first equipment section when `kanbanBriefAuthoritative` (and zone-aware secondary note if `zoneContext` exists).
- **Step 3** (`step3-coach.ts`): Extra preamble + rule text when `kanbanBriefAuthoritative` is passed from the runner.

### 3.6 Runner (`generate-workout-chain-runner.ts`)

- Passes `kanbanBriefAuthoritative` into `buildCoachPrompt`.

## 4. @Coach seed comment CTA (Edge)

In `bubble-agent-dispatch/index.ts`:

- System prompt and Gemini `responseSchema` for `coach_task_notes` require ending with the agreed CTA (Generate Workout wording).
- `**ensureCoachTaskNotesCta`\*\* appends the CTA server-side if the model omits it, capped by `COACH_TASK_NOTES_MAX_CHARS`.

## 5. V2 proposal — Coach updates an existing card

### 5.1 Problem

Today the Edge path only **creates** tasks via `agent_create_card_and_reply`. Thread follow-ups cannot update `tasks.description` / `tasks.title` when the user asks for changes.

### 5.2 Design options

| Approach                                               | Pros                                  | Cons                                               |
| ------------------------------------------------------ | ------------------------------------- | -------------------------------------------------- |
| **A. Extend Gemini JSON + single RPC**                 | One webhook completion; transactional | Larger RPC; more validation in PL/pgSQL            |
| **B. New Edge branch + `tasks.update` (service role)** | Simple SQL from Edge                  | Duplicate idempotency logic vs RPC; two code paths |
| **C. Client-only edit**                                | No backend change                     | Does not help @Coach driving edits from chat       |

**Recommendation: A** — extend structured output and add `**agent_update_task_from_agent_thread`\*\* (or extend existing RPC with optional update branch).

### 5.3 Suggested Gemini schema additions (Edge only, later)

- `update_existing_task: boolean` (default false)
- `target_task_id: string | null` — must be `messages.target_task_id` of trigger **or** `attached_task_id` from thread context when user is discussing a card (define strict allowlist to prevent cross-bubble writes)
- `updated_task_title: string | null`, `updated_task_description: string | null` — only when `update_existing_task`

Layer B / safety:

- Require bubble membership + task belongs to same `bubble_id` as message.
- Optional: only allow update when `tasks.item_type = 'workout'` and author is invoker.

### 5.4 RPC sketch

`agent_update_task_and_reply(p_trigger_message_id, p_thread_id, p_agent_auth_user_id, p_invoker_user_id, p_target_task_id, p_reply_text, p_new_title text default null, p_new_description text default null)`

- Advisory lock on `(trigger, agent)` (same pattern as card RPC).
- Verify agent bound to bubble; verify task in bubble; verify invoker is human member.
- `UPDATE tasks SET title = coalesce(p_new_title, title), description = coalesce(p_new_description, description) WHERE id = p_target_task_id`.
- Insert agent chat reply row (same `parent_id` / thread semantics as today).

### 5.5 Edge routing logic

After Gemini parse:

1. If `update_existing_task` and valid `target_task_id` → call update RPC (no card insert).
2. Else if `create_card` → existing `agent_create_card_and_reply`.
3. Else → reply-only variant (today you may only hit RPC with `p_create_card: false` — confirm current RPC supports reply without card; if not, split “reply only” path).

### 5.6 Milestones

1. Ship Vertex brief-authoritative path (this doc §3) — **done**.
2. Add assessment + CTA — **done**.
3. V2: schema + RPC + Edge branch + tests + prompt: “When user asks to revise the workout on the card, set `update_existing_task`…”

## 6. Verification

1. **Coach path:** Create card with brief mentioning specific equipment; open task; **AI workout**; confirm Vertex output uses brief-consistent movements (manual review).
2. **API flag:** `POST` with short description without flag — legacy profile-driven behavior preserved unless description ≥80 chars triggers inference.
3. **Seed comment:** New task comment ends with CTA; optional: align button label with CTA copy.
