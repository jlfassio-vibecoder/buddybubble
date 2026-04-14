# Technical design: chat feed & Kanban card embed (“tweet” format) — v1

## 1. Problem

The Messages rail (`src/components/chat/ChatArea.tsx`, with threading in `src/components/chat/ThreadPanel.tsx`) behaves like a linear channel: fast text, attachments, and `/task`-style mentions, but it is **not** a first-class surface for **structured Kanban cards** (`public.tasks`).

When someone creates or cares about an **Event**, **Idea**, **Memory**, **Experience**, **Program**, etc., they still have to **describe it manually** in chat. The board and the stream stay mentally separate.

We want the rail to support a **rich feed** (timeline-style): messages can **embed** a real task row so the stream shows **who posted**, **when**, optional **caption text**, and a **readable card preview**—while **threads** (`messages.parent_id`) remain the place for focused discussion on that post.

## 2. Goals

| Goal                     | Description                                                                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Embedded cards**       | A chat message may reference one **task** (`TaskRow`) and render a **read-only preview** for all polymorphic `tasks.item_type` values used today.                                        |
| **Tweet-like layout**    | Clear author row (avatar, name, time), optional body text, then a **distinct** card block (`bg-card`, border, shadow) so embeds read as “posts,” not only bubbles.                       |
| **Composer integration** | From the chat composer, users can **create a card** via the existing `TaskModal` (`src/components/modals/TaskModal.tsx`), then **auto-send** a message that attaches the new `tasks.id`. |
| **Threads unchanged**    | Thread open/reply flows stay the same; a message with an embed may be a **thread parent** or a **reply**, and replies remain plain messages unless they also attach a task.              |
| **Graceful deletion**    | If the task is removed from the board, the message **remains**; the embed shows a **tombstone** (e.g. “Card removed”) instead of breaking the stream.                                    |

## 3. Non-goals (v1)

- Embedding **multiple** tasks per message.
- Full **inline editing** of the task inside the chat stream (editing stays in `TaskModal`).
- Changing **Kanban** or **calendar** behavior beyond new message metadata.
- **Storefront** / `storefront_sandbox_messages` (out of scope).

## 4. Definitions

| Term              | Meaning in this codebase                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Messages rail** | The chat UI: `ChatArea` + `ThreadPanel`.                                                                             |
| **Card / task**   | A row in `public.tasks` (`TaskRow`), including polymorphic `item_type` and `metadata`.                               |
| **Feed message**  | A `messages` row with optional `attached_task_id` pointing at a task in the **same bubble** as `messages.bubble_id`. |

## 5. Data model

### 5.1 No new table

Link **`messages`** → **`tasks`** with a nullable foreign key on `messages`.

### 5.2 Schema change: `public.messages`

Add:

- **`attached_task_id`** `uuid` **nullable**  
  **`references public.tasks (id) on delete set null`**

**Semantics:**

- **`null`**: plain text/attachment message (today’s behavior).
- **Non-null**: this message **embeds** that task for display; `content` may still be empty or hold a short caption.

**Referential integrity (bubble alignment):**

- A message must only attach a task where **`tasks.bubble_id = messages.bubble_id`**.
- Enforce in the **application** on insert/update at minimum.
- **Optional (recommended):** a small `BEFORE INSERT OR UPDATE` trigger on `public.messages` that raises if `attached_task_id` is set and bubble ids mismatch—defense in depth under RLS.

**Indexing:**

- Optional btree on `messages (attached_task_id)` where not null—helps admin/debug queries; low priority for v1.

### 5.3 Types and codegen

After the migration:

- Update **`src/types/database.ts`** (`Database['public']['Tables']['messages']['Row']` / `Insert` / `Update`) to include `attached_task_id: string | null`.
- **`MessageRow`** (alias from `@/types/database`) picks this up automatically.

### 5.4 Fetch strategy (Supabase / PostgREST)

Extend message loads from a flat `select('*')` to a query that embeds the related task, e.g. (exact embed name follows generated FK relationship—verify in Supabase dashboard or `supabase gen types`):

```ts
// Illustrative — adjust FK alias to match PostgREST relationship name after migration.
supabase.from('messages').select(
  `
    *,
    users:user_id (...),
    tasks:attached_task_id ( ... )
  `,
);
```

**Important:** `ChatArea` today hydrates `ChatMessage` via `rowToChatMessage` / search helpers. Plan to:

- Either extend **`ChatMessage`** (`src/components/chat/ChatArea.tsx`) with `attachedTask?: TaskRow | null` (and optionally `attachedTaskId` if you need loading states), **or**
- Keep parallel state maps `taskByMessageId`—prefer **embedding on the row** for simpler realtime merges.

**Realtime (`postgres_changes`):** payloads for `messages` **do not** include joined `tasks`. On `INSERT`/`UPDATE`, **merge** the embedded task by refetching that message with select+embed, or by client-side insert of the task you just created (composer path).

## 6. UI / architecture

### 6.1 Composer — `ChatArea.tsx`

- Add a control **left of the text input** (e.g. `Plus` or `LayoutGrid`) labeled in copy as **“Add card”** / **“Post a card”**.
- **Flow:** open `TaskModal` in **create** mode for the **active bubble** (same bubble as the channel being posted to—respect **All Bubbles** vs single-bubble selection via `useWorkspaceStore` / `activeBubble` already used in `ChatArea`).
- **On successful save:** receive the new `task.id`, then call the existing send path (`sendMessage` / insert into `messages`) with:
  - `attached_task_id: task.id`
  - `content`: optional string from a small caption field or the composer’s current text—product choice; document in implementation.

**Integration with existing APIs:** `ChatAreaProps.onOpenTask` already opens tasks; you may add something like `onTaskCreatedForChat?: (taskId: string) => void` or handle entirely inside `ChatArea` if `TaskModal` is local—**follow whichever pattern already wires `TaskModal` in the workspace shell** (minimize new global abstraction).

### 6.2 Stream card UI — new component

**Suggested file:** `src/components/chat/ChatFeedTaskCard.tsx`  
**Suggested export:** `ChatFeedTaskCard`

**Props (illustrative):**

- `task: TaskRow`
- `onOpen?: () => void` — typically calls `onOpenTask(task.id)` from `ChatAreaProps`

**Behavior:**

- **Read-only** preview: title, `item_type` affordance (reuse patterns from `ItemTypeSelector` / `itemTypeUiNoun` in `src/lib/item-type-styles.ts` where appropriate).
- **Body:** truncated `description` and/or **type-specific** lines from `metadata` (events: location/time hints; memories: image thumb if attachment metadata exists—match existing board card conventions).
- **Click:** opens **`TaskModal`** for edit (`onOpenTask`), consistent with the rest of the app.
- **Missing task:** if join returns null (deleted + `attached_task_id` cleared, or stale client state), show **tombstone** UI.

### 6.3 Rendering the stream

**Primary loop:** `displayMessages.map` in `ChatArea.tsx` (main rail).

For each `ChatMessage`:

1. Keep existing **header** (avatar, sender, `formatMessageTimestamp`, bubble badge when `ALL_BUBBLES_LABEL`).
2. **Body:** `renderMessageContent(msg.content)` as today.
3. **If** `msg.attachedTask` (or equivalent) **is set:** render `<ChatFeedTaskCard task={...} />` **below** text (or above attachments—pick one order and keep it consistent in **ThreadPanel**).
4. **Attachments:** existing `MessageAttachmentThumbnails` unchanged.

**Thread rail:** `ThreadPanel.tsx` receives `threadMessages: ChatMessage[]` and the same `renderMessageContent`; extend the thread message row markup to include **`ChatFeedTaskCard`** when the parent/replies carry `attachedTask`, so **threaded discussion around a card** works without new thread-specific state.

### 6.4 Search results

Search currently maps DB rows into `ChatMessage`. Ensure the **search query** (where `SearchMessageJoinRow` / `ChatMessage` is built) also selects/embeds **`attached_task_id`** + task so previews are consistent.

## 7. Security & RLS

- **`messages_insert` / `messages_update`:** today scoped by bubble membership. New column must **not** allow attaching a task from **another** bubble—**app validation + optional trigger** (see §5.2).
- **`tasks_select`:** users who can see the bubble can read tasks in that bubble; embedded task in chat should match the same visibility. If `TaskModal` enforces extra rules (e.g. `visibility`), mirror those rules in what you render on the card preview (or hide embed if policy denies—unlikely if message insert succeeded).

## 8. Implementation phases

| Phase              | Scope                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — DB & types** | Migration: `attached_task_id`; update `src/types/database.ts`; extend `ChatArea` fetch + any search fetch to embed `tasks`; extend `ChatMessage` + `rowToChatMessage`. |
| **2 — Feed UI**    | Add `ChatFeedTaskCard.tsx`; render in main list and in `ThreadPanel`; tombstone when task missing.                                                                     |
| **3 — Composer**   | “Add card” control → `TaskModal` → on save, insert message with `attached_task_id` (+ caption).                                                                        |

## 9. Acceptance criteria

- [ ] Migration applied; `MessageRow` includes `attached_task_id`.
- [ ] Messages load with optional nested `TaskRow`; UI shows embed + tombstone on delete.
- [ ] Composer can create a task and post a message referencing it in one flow.
- [ ] Threads display embeds for parent and replies consistently.
- [ ] No regression to attachment upload, `/task` mentions, or realtime without embeds.

## 10. Open questions

1. **Caption vs empty body:** Is the card-only post allowed with `content = ''` (today `content` has `default ''` in DB—confirm app accepts empty visible line)?
2. **All Bubbles aggregate channel:** When posting from the aggregated view, which `bubble_id` wins for the **new task**—active bubble, or require picking a bubble?
3. **Notifications:** Should `thread_reply` copy mention “replied to a card post” for clarity?

---

**Document version:** v1  
**Last updated:** 2026-04-13  
**Related code:** `src/components/chat/ChatArea.tsx`, `src/components/chat/ThreadPanel.tsx`, `src/components/modals/TaskModal.tsx`, `src/types/database.ts` (`MessageRow`, `TaskRow`), `public.messages`, `public.tasks`
