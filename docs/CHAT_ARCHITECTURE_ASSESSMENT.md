# Chat Architecture Assessment (Chat Rail Baseline)

This report documents the current “Chat Rail” implementation so we can later refactor `TaskModal` Comments to reuse the same system (nested replies + `@` mentions) **while explicitly preventing chat from creating new cards inside the task modal**.

Scope: code + generated DB types + Supabase migrations. No refactor code is proposed here—just baseline facts and implications.

---

## 1. Database Schema (`messages` table)

### 1.1 Source of truth (Supabase migrations)

The initial `public.messages` table is created in `supabase/migrations/20260404140000_initial_schema.sql`:

- **id**: `uuid` PK, default `gen_random_uuid()`
- **bubble_id**: `uuid` FK → `public.bubbles(id)` (cascade delete)
- **user_id**: `uuid` FK → `public.users(id)` (restrict delete)
- **content**: `text not null default ''`
- **parent_id**: `uuid` FK → `public.messages(id)` (`on delete set null`)
- **created_at**: `timestamptz not null default now()`

Then later migrations add:

- **attachments**: `jsonb not null default '[]'::jsonb` via `supabase/migrations/20260414120000_messages_attachments_and_storage.sql`
- **attached_task_id**: `uuid` FK → `public.tasks(id)` (`on delete set null`) via `supabase/migrations/20260518130000_messages_attached_task_id.sql`

### 1.2 Schema as consumed by the app (generated types)

`src/types/database.ts` currently exposes:

- `Database['public']['Tables']['messages']['Row']` with:
  - `id: string`
  - `bubble_id: string`
  - `user_id: string`
  - `content: string`
  - `parent_id: string | null`
  - `created_at: string`
  - `attachments: Json`
  - `attached_task_id: string | null`

### 1.3 Nesting/threading model

**Threading is handled exclusively via `parent_id`.**

- A “root” message is a row with `parent_id = null`.
- A “reply” is a row with `parent_id = <root_message_id>` (or potentially another reply’s id, but the UI currently treats threads as “parent + replies,” not arbitrary-depth trees).
- There is **no** `thread_id`, `reply_to_id`, `root_id`, or `path` column today.

Implication: Nested replies beyond one level would require either:

- **Schema extension** (e.g. `root_id`, `path`, `depth`) for efficient retrieval/rendering, or
- Client-side tree build with multiple queries / constraints (harder to do efficiently with PostgREST pagination).

### 1.4 How cards are attached to chat messages

Cards are linked via **`messages.attached_task_id`** (nullable FK to `tasks.id`).

In the UI:

- `ChatArea` uses a PostgREST embed to load the task row when present:
  - `const MESSAGES_SELECT_WITH_TASK = '*, tasks!messages_attached_task_id_fkey(*)'`
- Each message is mapped to `ChatMessage.attachedTask` for rendering an embedded card preview (via `ChatFeedTaskCard`).

The “Create and attach card” flow is explicitly built around this link:

- The composer’s “grid” button triggers `onOpenCreateTaskForChat(...)` (parent-owned).
- After the task is created, it posts a message with `{ attachedTaskId: taskId }` in the insert payload.

This is important for the TaskModal plan: **the chat system already supports “message ↔ task” linking**, but only as “message embeds a task,” not “task has its own message thread” (there is no `target_task_id` / `thread_task_id` today).

### 1.5 `@` mentions storage

There is **no structural mentions column** in `messages`:

- No `mentioned_user_ids` array
- No `entities` JSON
- No `mentions` join table

Mentions are currently **presentation-only**, derived by parsing the raw `content` string at render time:

- `ChatArea.renderMessageContent` builds a regex from known workspace member names and wraps `@Name` tokens in a styled `<span>`.
- Mention suggestions are also client-side: when typing `@` the composer shows a dropdown, but it inserts raw text `@${userName}` into the input.

Result: the app can _display_ highlighted mentions, but it cannot reliably:

- query “messages that mention user X,”
- notify users based on a normalized mention entity,
- handle renames robustly (mentions are name-text based).

### 1.6 Attachments storage

Message attachments are stored as JSON metadata in `messages.attachments` (array) and files live in a private bucket `message-attachments` with RLS keyed by `{workspace_id}/{message_id}/...` (see `docs/tdd-message-attachments.md` for the design and `20260414120000_messages_attachments_and_storage.sql` for policies).

---

## 2. The Compose UI

### 2.1 Primary input component

There is **not** a standalone `ChatInput.tsx` / `ComposeBox.tsx` component.

The composer is implemented **inline** inside:

- `src/components/chat/ChatArea.tsx` (main channel composer)
- `src/components/chat/ThreadPanel.tsx` (thread reply composer)

Both are standard `<input type=\"text\" ... />` driven by local state.

### 2.2 Reusability inside `TaskModal.tsx`

Today the composer logic is **not drop-in reusable** for TaskModal Comments because `ChatArea` is a large, stateful component coupled to:

- workspace/bubble selection (`activeBubble` from `useWorkspaceStore`)
- “All bubbles” aggregation behavior
- permissions split: `canPostMessages` vs `canWriteTasks`
- embedded-card creation (`onOpenCreateTaskForChat`)
- attachments flow + message storage bucket management
- mention dropdown UI (workspace members) and `/` task-link dropdown (tasks list)
- realtime subscriptions and local message caches (`dbMessages`, `userById`)
- thread panel state (open/close, parent selection)

It _is_ extractable, but the current composition suggests that to reuse chat inside `TaskModal`, you’ll likely want to carve out:

- **a generic composer component** (UI + keyboard handling + suggestion dropdowns) and
- **a transport layer/hook** (sendMessage, upload attachments, realtime).

### 2.3 Mention support today

The composer supports `@` mentions in the UX sense:

- Typing `@` at a token boundary opens a member dropdown.
- Selecting a member inserts raw `@Name` into the text input.

However, as noted in §1.5, mentions are **not persisted structurally**—they are only text.

### 2.4 `/` commands scaffolding

There is partial scaffolding, but it is **not a general command system**:

- Typing `/` at a token boundary opens a **task link** picker (it inserts `/${task.title}`).
- Render-time parsing turns `/Exact Task Title` into a clickable UI element that opens the task.

This behaves like a very specific `/` “entity mention” feature, not a flexible `/command` architecture.

Also: because it matches by **exact title**, it’s fragile under renames and collisions (two tasks with the same title).

---

## 3. Data Fetching & Realtime

### 3.1 How messages are fetched

Message loading is done directly inside `ChatArea`:

- `supabase.from('messages').select(MESSAGES_SELECT_WITH_TASK).order('created_at', { ascending: true })`
- Scoped by:
  - `eq('bubble_id', bubbleId)` for a single bubble, or
  - `in('bubble_id', bubbleIds)` for the “All bubbles” aggregate view

Users (senders) are then loaded separately from `public.users` by `in('id', ids)` and cached in `userById`.

### 3.2 Realtime subscriptions

Realtime is also managed in `ChatArea` via a Supabase channel:

- Subscribes to `messages` INSERT/UPDATE/DELETE with `filter: bubble_id=eq.<id>` (or one subscription per bubble in aggregate view).
- On INSERT/UPDATE, it fetches an embedded task row if needed (`fetchEmbeddedTaskForMessage`) and merges into `dbMessages`.

Additionally, `ChatArea` subscribes to `tasks` INSERT/UPDATE/DELETE for the same bubble(s) to keep embedded cards in sync even if the message row didn’t change.

### 3.3 Coupling to `workspace_id` / `bubble_id`

The primary chat partition key is **`bubble_id`**.

There is no built-in way to fetch “messages for a task thread” because:

- `messages` has **no** `target_task_id` (or similar)
- `attached_task_id` is for “message embeds a task,” not “message belongs to task”

Could it be filtered by `attached_task_id`? Yes technically (`eq('attached_task_id', taskId)`), but that would represent **only messages that embed that task**, not a true “task discussion thread.”

Implication for TaskModal Comments: if the goal is “comments are chat messages tied to a task,” you’ll need either:

- a new column on `messages` (e.g. `target_task_id`) and an index, or
- a join table (message ↔ task), or
- a dedicated `task_threads` table and reference from messages.

---

## 4. Nesting UI (Threads)

### 4.1 Primary renderer

The main feed is rendered directly inside `ChatArea` by mapping `displayMessages` (root messages only):

- `displayMessages = allMessages.filter((m) => !m.parentId)`
- Reply counts are computed by scanning raw rows: `buildReplyCounts(rows)` increments on `parent_id`.

### 4.2 How nesting is visually represented

Nesting is **not rendered inline** as a recursive tree.

Instead:

- Root messages show a “Reply in thread” affordance or a “N replies” button.
- Clicking opens `ThreadPanel` (a right-side panel) that shows:
  - the parent message
  - a flat list of replies (`threadMessages = allMessages.filter((m) => m.parentId === activeThreadParent.id)`)
  - its own reply composer

This is a **two-level UI model** (parent → replies) even though the DB could technically represent deeper nesting with `parent_id`.

---

## Key takeaways for “TaskModal Comments → Chat system”

- **Schema baseline:** chat messages are in `public.messages` with `parent_id` threads and optional `attached_task_id` embeds. No structural mentions.
- **Compose is monolithic:** there is no reusable composer component; extracting one is likely prerequisite for embedding chat in TaskModal.
- **Realtime is bubble-scoped:** current subscriptions and queries are keyed to `bubble_id`; you’ll need a new filter key (e.g. `target_task_id`) for task-centric chat.
- **Threading exists but is 2-level in UI:** DB supports `parent_id`; UI uses a thread side panel, not recursive inline nesting.
- **Mentions are text-only:** highlighted via regex on known names; no normalized mention entities.
