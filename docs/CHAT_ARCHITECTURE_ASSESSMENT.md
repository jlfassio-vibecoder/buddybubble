# Chat Architecture Assessment (Chat Rail — post-refactor)

This document describes the **current** Chat Rail stack after the refactor of `ChatArea.tsx`: shared types, row mapping, a filter-based message hook, and a reusable composer. It still records **database facts** and **product constraints** (for example, TaskModal can turn off “create card” while reusing the same composer contract).

Scope: code + generated DB types + Supabase migrations. Deeper step-by-step plans live in [`CHAT_AREA_REFACTOR_PLAN.md`](./CHAT_AREA_REFACTOR_PLAN.md) and [`COMPOSER_EXTRACTION_PLAN.md`](./COMPOSER_EXTRACTION_PLAN.md).

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

Later migrations add:

- **attachments**: `jsonb not null default '[]'::jsonb` — `20260414120000_messages_attachments_and_storage.sql`
- **attached_task_id**: `uuid` FK → `public.tasks(id)` (`on delete set null`) — `20260518130000_messages_attached_task_id.sql`
- **target_task_id**: `uuid` FK → `public.tasks(id)` (`on delete cascade`), with RLS/trigger alignment for task-scoped threads — `20260416000000_normalize_task_collections_and_unified_chat.sql` (and follow-ups such as comment counts / views where applicable).

### 1.2 Schema as consumed by the app (`src/types/database.ts`)

`Database['public']['Tables']['messages']['Row']` includes at least:

- `id`, `bubble_id`, `user_id`, `content`, `parent_id`, `created_at`
- `attachments: Json`
- `attached_task_id: string | null` — “this message **embeds** a Kanban card preview”
- `target_task_id: string | null` — “this message **belongs to** a task’s comment thread” (still requires a `bubble_id` consistent with that task; enforced in DB)

### 1.3 Nesting / threading model

**Threading is still modeled only with `parent_id`.**

- Root: `parent_id = null`
- Reply: `parent_id = <parent message id>`
- The UI remains a **two-level** experience (root feed + `ThreadPanel` for replies), not an arbitrary-depth inline tree.

### 1.4 Two different “task” links on a message

| Column               | Meaning                                                                                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **attached_task_id** | Optional embedded card (`ChatFeedTaskCard`). Used for “create and attach card” and similar flows. PostgREST embed: `tasks!messages_attached_task_id_fkey(*)`.                                                                                  |
| **target_task_id**   | Optional anchor for **task-scoped** discussion. The rail continues to filter primarily by **bubble** (or all bubbles); `TaskModalCommentsPanel` uses `useMessageThread({ scope: 'task', taskId })` so loads and realtime use `target_task_id`. |

So: the system supports both “message that shows a card” and “message that is a comment on a task,” with different columns.

### 1.5 `@` mentions storage

Unchanged: **no structural mentions column**. Mentions are plain text in `content`, highlighted at render time (see §2).

### 1.6 Attachments storage

Unchanged: JSON on `messages.attachments`, files in the `message-attachments` bucket; see `docs/tdd-message-attachments.md` and the attachments migration.

---

## 2. Compose UI

### 2.1 Reusable composer

The rail and thread reply surfaces use **`RichMessageComposer`** (`src/components/chat/RichMessageComposer.tsx`):

- Controlled `value` / `onChange(next, { selectionStart })`
- Optional `@` mentions and `/` task-link pickers via `mentionConfig` / `slashConfig` and `features`
- Pending files, attach/create-card actions (create card is omitted when the prop is not passed)
- `density: 'rail' | 'thread'` and optional `popoverContainerRef` for portal-style popovers

**`ChatArea`** wires the rail instance: permissions, `pendingFiles`, `sendMessage` from the hook, `handleComposeChatCard`, and `composerPopoverRef`.

**`ThreadPanel`** wires a thread instance with mentions/slash disabled for parity-minimal replies unless you expand props later.

### 2.2 `ChatArea.tsx` role (orchestration shell)

`ChatArea` is no longer the single owner of fetch + realtime + send internals. It still owns **rail-only** concerns:

- Workspace store: `activeBubble`, `workspaceId`, role, profile overlay for “self” in the directory
- **`messageThreadFilter`**: `{ scope: 'bubble', bubbleId }` or `{ scope: 'all_bubbles', bubbleIds }` derived from `activeBubble` and `bubbles`
- **`useMessageThread`** — messages, authors, team list for mentions, `sendMessage`, errors, sending state
- Search UI, notifications stub/join-request preview, scroll behavior, `ChatMessageRow` mapping, `ThreadPanel`, media modal, task list for `/` **rendering** in `renderMessageContent`

### 2.3 Mention and `/` task link behavior

- **Composer:** inserts `@Name` or `/Task title` text; logic lives in `RichMessageComposer` + `src/lib/chat-composer-tokens.ts` (`lastTaskMentionSlashIndex`).
- **Feed rendering:** `ChatArea`’s `renderMessageContent` still regex-splits on member names and task titles for the rail (and `TaskModalCommentsPanel` may use a simpler renderer for the modal tab).

Mentions remain **not queryable as entities** (same limitation as before).

### 2.4 Reuse in `TaskModal`

`TaskModalCommentsPanel` uses the same **`useMessageThread`** + **`RichMessageComposer`** + **`ChatMessageRow`** pattern with `filter: { scope: 'task', taskId }` and without the rail’s “create card” action. “Prevent chat from creating new cards inside the task modal” is a **product wiring** choice (omit `onRequestCreateAndAttachCard` / gate `features`), not a separate chat stack.

---

## 3. Data fetching and realtime

### 3.1 Hook: `useMessageThread`

**Location:** `src/hooks/useMessageThread.ts`

**Inputs:** `filter` (`MessageThreadFilter` from `src/lib/message-thread.ts`), `workspaceId`, `bubbles`, `canPostMessages`.

**Responsibilities:**

- Initial load of `messages` with `MESSAGES_SELECT_WITH_TASK` (defined in `message-thread.ts`), ordered by `created_at`
- Scope:
  - **bubble:** `.eq('bubble_id', bubbleId)`
  - **all_bubbles:** `.in('bubble_id', bubbleIds)`
  - **task:** `.eq('target_task_id', taskId)` (and resolves the task’s `bubble_id` for inserts)
- Hydrates `userById` / `teamMembers` for the thread
- **Realtime:** one channel name from `messageThreadChannelName(filter)`; registers `postgres_changes` on `messages` (and task listeners for embedded card freshness) consistent with the prior `ChatArea` behavior, moved out of the component
- **`sendMessage`:** validation, insert, attachment pipeline (storage, PDF thumb, video metadata, etc.), optimistic updates — same semantics as before, centralized in the hook

### 3.2 Mapping and shared types

- **`src/types/chat.ts`:** `ChatMessage`, `ChatUserSnapshot`, `SearchMessageJoinRow`, etc.
- **`src/lib/chat-message-mapper.ts`:** `rowToChatMessage`, `searchJoinRowToChatMessage`
- **`src/lib/message-thread.ts`:** `MESSAGES_SELECT_WITH_TASK`, `buildReplyCounts`, `fetchEmbeddedTaskForMessage`, filter helpers

### 3.3 Partitioning keys

- **Bubble rail:** primary read/write partition remains **`bubble_id`** (plus synthetic “All Bubbles” = many bubble ids).
- **Task comments:** **`target_task_id`** on `messages`, with `bubble_id` still set to the task’s bubble for routing and triggers.

---

## 4. Nesting UI (threads)

### 4.1 Primary renderer

- Root list: `displayMessages` = mapped messages without `parentId`
- Rows: **`ChatMessageRow`** (`src/components/chat/ChatMessageRow.tsx`) for the main feed (and reused from `ThreadPanel` / search patterns where wired)

### 4.2 `ThreadPanel`

Still a **side panel**: parent message, flat replies, **`RichMessageComposer`** for replies. Reply counts come from **`buildReplyCounts`** over loaded rows (via hook → `replyCounts` → mapper into `ChatMessage`).

---

## 5. Narrow TypeScript scope (optional CI)

`tsconfig.chat.json` includes chat modules, the message hook, mappers, and related types so `npx tsc -p tsconfig.chat.json --noEmit` can validate this slice without pulling the whole app graph.

---

## Key takeaways

| Topic               | Current state                                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Schema**          | `messages` has `parent_id`, `attached_task_id`, and **`target_task_id`** for unified task comments; embed select still uses `MESSAGES_SELECT_WITH_TASK`. |
| **Compose**         | **`RichMessageComposer`** is the shared UI; **`ChatArea`** orchestrates rail-only shell + search + notifications.                                        |
| **Data path**       | **`useMessageThread(filter)`** owns load, realtime, and **`sendMessage`** for bubble, all-bubbles, and **task** scopes.                                  |
| **Types / mapping** | **`src/types/chat.ts`** + **`src/lib/chat-message-mapper.ts`** + **`src/lib/message-thread.ts`** replace inline definitions in `ChatArea`.               |
| **Threading**       | Still two-level UX; DB still single-parent chain via `parent_id`.                                                                                        |
| **Mentions**        | Still text-only; composer + `renderMessageContent` unchanged in that respect.                                                                            |
| **TaskModal**       | Same hook/composer/row stack with **`scope: 'task'`**; card creation is optional and typically off in the modal.                                         |
