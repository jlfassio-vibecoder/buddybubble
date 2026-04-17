# Bubble Agents — Architecture Plan

This document proposes how to evolve the normalized Chat Rail into an **Agentic Workspace**: users mention **Bubble Agents** (for example `@coach` in Fitness, `@organizer` in Community) in the rail; a backend pipeline interprets the thread, may call tools, and inserts **Kanban cards** that appear as **embedded task messages** (`attached_task_id`), consistent with today’s chat model.

**Scope:** architecture only (database, webhooks, Edge Functions, transactional semantics, and frontend UX hooks). No implementation code here.

**Related baseline docs:** `[CHAT_ARCHITECTURE_ASSESSMENT.md](./CHAT_ARCHITECTURE_ASSESSMENT.md)`.

---

## Current baseline (relevant facts)

### Database

- `**public.messages`:** `bubble_id`, `user_id` (FK → `public.users`, which FKs `auth.users`), `content`, `parent_id`, `created_at`, `attachments`, `**attached_task_id`** (embed Kanban row in chat), `**target_task_id**`(task-scoped comment thread). Trigger enforces`bubble_id`alignment when`target_task_id` is set.
- `**public.users`:** `id` **must** exist in `auth.users` (enforced at initial schema). There is **no\*\* `is_bot` column today.
- `**public.tasks`:** Kanban row with `bubble_id`, polymorphic `item_type` / `metadata`, `visibility`, `priority`, scheduling fields, etc. `**tasks_insert`** RLS (for normal clients) requires `public.can_write_bubble(bubble_id)`.
- `**public.messages` RLS (post-RBAC):** `messages_insert` requires `user_id = auth.uid()` and `public.can_view_bubble(bubble_id)` (see `20260427100000_rbac_granular_permissions.sql`). **Human clients cannot insert a row authored as another user.\*\*

### Edge Functions (today)

- Only `**supabase/functions/generate-message-video-poster`** is present. It uses **user JWT** + anon client for auth, then **service role\*\* for storage work — a useful precedent for split clients inside an Edge Function.

### Chat UI (today)

- `**useMessageThread`** loads `**teamMembers**`exclusively from`**workspace_members`→`users**`, not from message authors. Mention dropdown in `**RichMessageComposer\*\*`filters`mentionConfig.members`by display`name`.
- **Realtime:** `postgres_changes` on `messages` scoped by `bubble_id` or `target_task_id`, plus `tasks` subscriptions for embedded card freshness — agent replies and new tasks will show up **without new transport** if rows are inserted in ways clients already subscribe to.
- `**sendMessage`** inserts with the signed-in `**user.id**`; card embed path sets `**attached_task_id\*\*`after verifying the task’s`bubble_id` matches the message bubble.

These facts drive the recommendations below (especially **service-role** server writes and **bot `users` rows** tied to `auth.users`).

---

## 1. The Identity Layer (Database & Mentions)

### 1.1 Representing agents in the database

**Recommendation: catalog table + real `auth.users` / `public.users` rows per agent identity (or per “agent persona” you want to show as the author).**

| Approach                                                                                                                                    | Pros                                                                                                                                             | Cons                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. `public.bubble_agents` (or `system_agents`) + `user_id` FK to `public.users`, each user backed by `auth.users` created via Admin API** | Reuses `**messages.user_id`\*\*, `useMessageThread` author hydration (`users` select), avatars, and RLS patterns with minimal conceptual change. | Requires provisioning **service-created** `auth.users` (one per distinct author surface, or one shared “BuddyBubble Bot” user if you denormalize label elsewhere). |
| **B. Seed `public.users` with `is_bot` only (no matching `auth.users`)**                                                                    | —                                                                                                                                                | **Not viable** with the current FK: `public.users.id` references `auth.users(id)`.                                                                                 |
| **C. Nullable `user_id` + new `agent_id` on `messages`**                                                                                    | Clear separation of bot vs human.                                                                                                                | Larger migration; every read path (`ChatMessageRow`, mappers, RLS) must handle two author shapes.                                                                  |

**Suggested tables (conceptual):**

1. `**public.agent_definitions`\*\* (global catalog)

- Stable `**slug**` (e.g. `coach`, `organizer`), `**mention_handle**` (display token without `@`), `**display_name**`, `**avatar_url**`, model/routing metadata (Vertex model id, temperature caps, system prompt version), `**auth_user_id**` (FK → `users.id` / `auth.users`).

2. `**public.bubble_agent_bindings**` (many-to-many)

- `bubble_id`, `agent_definition_id`, optional `**is_default**` per bubble, `**sort_order**`, enabled flag.
- Enforces “which agents exist in this bubble’s rail.”

Optional: `**workspace_agent_bindings**` if some agents are workspace-wide rather than per bubble.

### 1.2 Mapping agents to bubbles

- **Primary:** `bubble_agent_bindings` as above (explicit, admin-configurable, easy to query from Edge Function given `bubble_id` from the inserted message).
- **Secondary defaults:** you can _seed_ bindings when a bubble is created from a template (Fitness vs Community) without hard-coding behavior only in app code.

### 1.3 Injecting agents into `teamMembers` for `RichMessageComposer`

Today, `useMessageThread` sets `teamMembers` only from `**workspace_members`\*\* (`src/hooks/useMessageThread.ts`). Agents will never appear unless merged in.

**Plan:**

1. **Fetch bindings** for the active bubble (and optionally workspace defaults): `bubble_id` from `MessageThreadFilter` when `scope === 'bubble'`; for `scope === 'all_bubbles'`, either union agents for all visible bubble ids or only inject “global” agents — product choice; simplest v1 is **active bubble only** (matches `@coach` in one channel).
2. **Map each binding** to `MessageThreadTeamMember`:

- `id` = `**auth_user_id`\*\* (stable UUID used in `messages.user_id` when the agent posts).
- `name` = the string `**RichMessageComposer**` inserts for mentions — **must match** what `ChatArea`’s `renderMessageContent` uses for highlight/token detection (today that path resolves mentions against **member display names**, not arbitrary handles). Align on `**display_name`** (e.g. `Coach`) or store a dedicated `**mention_label\*\*` used in both composer and feed regex.

3. **Merge order:** `[...agentMembers, ...humanMembers]` or sorted with agents grouped at top — UX preference; avoid duplicate `id`s if a human somehow collides.
4. `**userById`:** ensure the agent’s `users` row is **selectable** under RLS for chat clients. Today, `users_select_workspace_peers` only exposes users who share a `**workspace_members`** row with the viewer. A bot user **not** in `workspace_members` will **not** load via the existing peer policy. **Mitigation (pick one):**

- Add bots as **workspace members** with a dedicated role (e.g. `member` + flag in metadata), **or**
- Add a narrow RLS policy: allow `select` on `public.users` where `id` in (select `auth_user_id` from visible bubble agents for workspaces the viewer belongs to), **or**
- Denormalize `agent_display` onto `messages` (last resort; duplicates data).

### 1.4 Mentions remain plain text

Keep the product constraint from the chat assessment: `**content` stays text**. The composer continues to insert `@DisplayName`; the Edge Function parses `**content`** for **handles or slugs** mapped to `agent_definitions`for the bubble. No new`mentions` JSON column is required for v1.

---

## 2. The Trigger & AI Layer (Backend)

### 2.1 Supabase Database Webhook on `public.messages` INSERT

- Configure a **Database Webhook** (Supabase dashboard or config) on `**INSERT`** into `**public.messages\*\*`, POSTing to a new Edge Function URL (e.g. `bubble-agent-dispatch`).
- **Security:** use the webhook **secret** header (or HMAC) and `**verify_jwt: false`\*\* for this function only, validating the secret on every request (pattern differs from `generate-message-video-poster`, which expects a user JWT).

### 2.2 Filtering to avoid wasted compute

The webhook fires for **every** message insert. Minimize work with a **fast reject** path inside the Edge Function (and optionally in SQL):

**Inside Edge Function (first milliseconds):**

1. Parse JSON payload → `record.content`, `record.user_id`, `record.bubble_id`, `record.parent_id`, `record.target_task_id`, `record.id`.
2. If `content` does not match a cheap check (e.g. **regex for `@` + known handle** or `content includes '@'`), **return 200 immediately** without DB round-trips, or with a single cheap lookup.
3. **Ignore** rows where `user_id` equals any **agent** `auth_user_id` (prevent infinite loops when the agent posts a reply or card message).
4. **Optional DB-side guard (advanced):** a small `**BEFORE INSERT`** trigger or **partial index** cannot easily “filter webhooks only,” but you *can* add a `**messages.agent_processing`\*\* flag — usually unnecessary if Edge rejects quickly.

**Stronger optimization (optional phase 2):** maintain a `**bubble_agent_mention_pattern`** view or store `**mention_prefixes[]\*\*`on`agent_definitions` and load once per cold start / cache in Edge memory — still requires one query to resolve bindings unless you embed a static map in the function for v0.

### 2.3 Resolving “which agent” was invoked

1. Load `**bubble_agent_bindings` + `agent_definitions**` for `record.bubble_id`.
2. Match **first** eligible agent whose handle appears in `content` (product rule: single agent per message, or deterministic priority order).
3. If no match → exit.

### 2.4 Fetching thread history for Vertex (Gemini on Vertex)

Define a **canonical context pack** built server-side (never trust the client to send history):

| User message shape                                       | History query (conceptual)                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Root rail** (`parent_id` null, `target_task_id` null)  | Last **N** messages for `**bubble_id = $bubble`** where `**target_task_id`is null** and`**parent_id` is null** (root-only), ordered by `created_at`, plus the triggering row. Optionally include **recent thread replies** in the same bubble as a second block if you want cross-thread context (higher token cost). |
| **Thread reply** (`parent_id` not null)                  | Load **root** `parent_id` chain up to the top message (max depth 2 today — cheap), then all messages with `**parent_id = root_id`** OR `**id = root_id\*\*`, ordered by `created_at`.                                                                                                                                 |
| **Task modal / task-scoped** (`target_task_id` not null) | Last **N** messages with `**target_task_id = $task`\*\*, ordered by `created_at`.                                                                                                                                                                                                                                     |

Use the **service role** Supabase client in Edge for these reads to avoid RLS complexity; still enforce **authorization in application logic**: verify the **triggering user** (`record.user_id`) was allowed to post in that bubble/task (mirror `can_view_bubble` / task visibility rules) before calling Vertex.

### 2.5 Vertex AI invocation

- Edge Function holds **GCP service account** or **Workload Identity** credentials as secrets; call Vertex **Gemini** with the context pack + tool definitions (`create_kanban_card`).
- Log `**message_id`**, `**bubble_id**`, `**agent_definition_id**`, latency, and token usage to `**agent_invocation_logs\*\*` (new table) for debugging and billing — not strictly required for v1 but valuable when webhooks retry.

### 2.6 Idempotency & webhooks retries

Supabase may **retry** webhook delivery. Before doing heavy work:

- `**INSERT ... ON CONFLICT DO NOTHING`** into `**agent_message_runs**`keyed by`**trigger_message_id\*\*` (unique), or
- Transactional check: “if a reply message from this agent with `parent_id` / correlation already exists, skip.”

This prevents duplicate cards on retries.

---

## 3. The Action Layer (Tool Calling & DB Inserts)

### 3.1 Tool: `create_kanban_card`

The model returns structured fields, for example: `title`, `description`, optional `item_type`, `status`, `priority`, `metadata`, optional `assigned_to` (human uuid), `visibility`.

Validate against allowlists that match `**tasks` CHECK constraints\*\* (`item_type`, `status` slugs, etc.).

### 3.2 Why the Edge Function must use the service role

- `**messages_insert`** requires `user_id = auth.uid()` for JWT-backed clients, so the **agent cannot post as itself\*\* through PostgREST with a user JWT unless you weaken RLS (not recommended).
- `**tasks_insert`\*\* requires `can_write_bubble` for humans; the agent is not a bubble member.

**Use a Supabase client initialized with `SUPABASE_SERVICE_ROLE_KEY`** for the transactional block only, after authorization checks.

### 3.3 Postgres transaction (single round-trip via RPC recommended)

Implement as `**SECURITY DEFINER**` Postgres function `**public.agent_create_card_and_reply(...)**` invoked from Edge with **service role**, so all work is **one atomic transaction** and easier to audit:

**Parameters (illustrative):** `p_bubble_id`, `p_agent_user_id`, `p_trigger_message_id`, `p_parent_id`, `p_target_task_id`, `p_reply_content`, task fields JSON.

**Steps inside the function (single transaction):**

1. **Lock / idempotency:** `SELECT ... FROM agent_message_runs WHERE trigger_message_id = p_trigger_message_id FOR UPDATE` or rely on unique constraint insert at end.
2. `**INSERT INTO public.tasks`\*\*

- Required: `bubble_id`, `title`, sensible defaults for `status`, `position` (e.g. max(position)+1 or `0`), `item_type`, `metadata`, `visibility`, `priority`, etc.
- Do **not** set fields the product forbids for AI (e.g. `program_id`) unless explicitly allowed.

3. `**INSERT INTO public.messages`\*\* (agent reply)

- `bubble_id` = `p_bubble_id` (must match task’s bubble; same as trigger message in normal flows).
- `user_id` = `**p_agent_user_id**` (the catalog’s `auth_user_id`).
- `content` = model-generated text (can be short explanation).
- `**attached_task_id**` = newly inserted `tasks.id` (embed card in chat).
- `**parent_id**` = product choice: `**p_trigger_message_id**` if replies should thread under the user ping; or `**null**` if the card should appear as a root feed item. Default recommendation: **reply under the user message** in threads; **root** in bubble rail unless the user message was itself a reply (match `parent_id` of trigger).
- `**target_task_id`\*\* = copy from trigger when the user spoke inside a task-scoped thread so the card lands in the same modal context (and satisfies DB trigger alignment with `bubble_id`).

4. `**INSERT INTO agent_message_runs**` (or update status) marking **completed** with `reply_message_id` and `created_task_id`.

**On any error:** full rollback; Edge returns 500 so the platform may retry — idempotency then prevents duplicate tasks.

**Alternative:** Edge runs multiple `.from('tasks').insert` / `.from('messages').insert` calls; harder to keep atomic without RPC.

### 3.4 RLS and side effects

- Service role **bypasses RLS**; therefore **all** bubble/workspace checks must live **inside the definer function** (compare `bubble_id` to allowed workspace, verify triggering user membership) or strictly before the RPC in Edge with redundant checks.
- **Realtime:** clients already listen for `**messages` INSERT** on their `bubble_id` / `target_task_id` filters — the new agent message should appear like any other insert. `**tasks`INSERT** on that`bubble_id` will refresh embedded payloads for listeners.

### 3.5 “Add to the board”

Today’s UX already treats `**attached_task_id`** as a card shown in chat that exists on the board once the `**tasks**`row exists in that`bubble_id`. No extra insert is strictly required unless you want a `**task_bubble_ups\*\*`-style engagement row — only add if product analytics require it.

---

## 4. The Frontend UX Layer (“Typing” State)

### 4.1 Goal

Show a **typing / working** indicator from the moment the user sends a message that mentions an agent until the **agent’s message** (or failure) arrives via **Realtime**.

### 4.2 Extending `useMessageThread`

**Return new state:** e.g. `isAgentTyping: boolean` and optionally `typingAgentLabel: string | null`.

**Set `true` (optimistic):**

- In a thin wrapper around `**sendMessage`** (preferred) or inside `sendMessage` after successful `**messages` insert\*\*:
  - If `content` matches a **client-side** predicate (same rules as server: known agent handles for the active bubble), set `isAgentTyping` to `true` and store `**pendingAgentKey`** + `**pendingCorrelationMessageId\*\*`(the user message id returned from`.select().single()`— today`sendMessage`already has`inserted.id`).

**Set `false`:**

- **Primary:** On `**postgres_changes` INSERT** for `messages`, if `new.user_id` is an **agent user id** and the message is **in the same thread context\*\* as the pending trigger (same `bubble_id`, and either same `parent_id` / `target_task_id` heuristic, or `attached_task_id` not null), clear typing.
- **Safety:** `setTimeout` fallback (e.g. 60–120s) to clear stuck state; optional toast on timeout.
- **Error path:** if `sendMessage` fails before insert, do not set typing; if webhook/LLM fails with no agent message, consider writing a **small system message** from the agent (“I couldn’t complete that”) _or_ only clear on timeout — product decision.

**Multi-tab:** Realtime insert clears typing in all tabs naturally; optimistic state is local per tab unless you add a `**agent_typing`\*\* Realtime broadcast (optional, not required for v1).

### 4.3 Where to render the indicator

- **Rail:** In `**ChatArea`**, immediately **below the last `displayMessages` row** (or inside the scroll container as a **non-persisted footer row\*\* above the composer). That matches chat-app conventions and avoids polluting `messages` state with synthetic rows.
- **Thread panel:** Same pattern inside `**ThreadPanel`\*\*’s message list footer if agent mentions are enabled there later.

**Do not** push a fake `ChatMessage` into `displayMessages` unless you want it in history; a **ephemeral UI row** keeps analytics and reply-count logic clean.

### 4.4 Composer interplay

- `**sending`** already reflects user message submission; `**isAgentTyping\*\*`is orthogonal (agent still “working” after`sending` flips false).
- Optionally disable **another** `@agent` ping while `isAgentTyping` is true (product guard).

---

## 5. Implementation checklist (ordered)

1. **Auth + users:** provision `**auth.users` + `public.users`\*\* for each agent author; optional `is_bot` / `agent_slug` column on `public.users` for clarity (requires migration).
2. **Catalog + bindings:** `agent_definitions`, `bubble_agent_bindings`, unique constraints, seed data per template.
3. **RLS:** policy so members can `**select`\*\* agent `users` rows needed for avatars in chat.
4. **RPC:** `agent_create_card_and_reply` (transactional task + message).
5. **Edge:** `bubble-agent-dispatch` webhook handler, fast filter, history builder, Vertex tool loop, idempotency.
6. **Frontend:** merge agents into `teamMembers`; extend `sendMessage` / hook for `**isAgentTyping`**; `**ChatArea\*\*` footer UI.
7. **Observability:** structured logs + optional `agent_invocation_logs` table.

---

## 6. Open decisions (for review)

- **One global bot user vs one user per agent definition** (affects how `userById` and message attribution look).
- **Threading:** agent reply `parent_id` under user vs new root card.
- **All Bubbles mode:** which agents appear in mentions when multiple bubbles are merged in the rail.
- **Guest / storefront bubbles:** whether agents are allowed at all under stricter RLS surfaces.
- **Cost control:** max `N` history messages, max tool calls per invocation, and per-workspace rate limits.

Once these are decided, the database migration + Edge Function + hook changes can follow as a phased PR sequence without revisiting the data model.
