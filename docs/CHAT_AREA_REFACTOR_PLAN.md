# Chat area refactor plan

**Branch context:** `refactor/chat-area-rail`  
**North star:** A unified social graph where the TaskModal **Comments** tab and the main Chat Rail share the same chat UI and the same `messages` table.

This document assesses the current `ChatArea` / `ThreadPanel` architecture and defines extraction targets **before** any implementation or schema work.

---

## 1. Monolith analysis (`ChatArea.tsx`)

`ChatArea.tsx` is a single ~2.1k-line client component that owns almost the entire vertical slice from Supabase to pixels. Responsibilities can be grouped as follows.

### 1.1 Data model and mapping

- Declares the UI-facing `ChatMessage` type (sender, content, thread metadata, attachments, embedded task).
- Maps `MessageRowWithEmbeddedTask` → `ChatMessage` (`rowToChatMessage`) and search join rows → `ChatMessage` (`searchJoinRowToChatMessage`).
- Maintains `replyCounts` from `parent_id` and merges user snapshots (`userById`, `myProfile` override).

### 1.2 Message loading and state

- **`dbMessages`:** canonical list of message rows for the active channel scope.
- **Initial fetch:** `messages` with `*, tasks!messages_attached_task_id_fkey(*)`, ordered by `created_at`, filtered by:
  - single `bubble_id` when a real bubble is selected, or
  - `.in('bubble_id', bubbleIds)` when the synthetic “All Bubbles” view is active.
- **User hydration:** after load, fetches `users` for distinct `user_id` values into `userById`.

### 1.3 Realtime (`postgres_changes`)

- Subscribes on a dedicated Supabase Realtime **channel** whose name encodes scope (`messages-rt:…` or `messages-rt-all:…`).
- For each relevant `bubble_id`, registers listeners for `INSERT` / `UPDATE` / `DELETE` on `public.messages` with filters `bubble_id=eq.{id}`.
- Mirrors task-card freshness by also subscribing to `public.tasks` (same `bubble_id` filters) so embedded Kanban rows update when the task row changes without a `messages` update.
- Handlers merge rows into `dbMessages`, refetch embedded tasks when needed (`fetchEmbeddedTaskForMessage`), and extend `userById` on new senders.

### 1.4 Auxiliary data for composer and rendering

- **Team members:** loads `workspace_members` + nested `users` for `workspaceId` to drive @-mention suggestions and `renderMessageContent` highlighting.
- **Task picker (`/` tokens):** loads all non-archived `tasks` across workspace bubbles (with guest visibility OR) into `allTasks` for slash-style linking in the composer and in rendered message bodies.
- **`useTaskBubbleUps`:** derives Bubble Up control props for every `attached_task_id` present in the loaded messages.

### 1.5 Workspace / bubble coupling

- Reads **`useWorkspaceStore`:** `activeBubble`, `activeWorkspace` (`id`, `name`, `role`).
- Channel scope, inserts, search scope, and “default bubble for writes” when in “All Bubbles” all depend on this store plus the `bubbles` prop.

### 1.6 Send pipeline (`sendMessage`)

- Validates permissions (`canPostMessages`), workspace presence, text vs attachment vs `attached_task_id` rules.
- Resolves **`targetBubbleId`:** from thread parent row, else `activeBubble` (with `ALL_BUBBLES_BUBBLE_ID` → `defaultBubbleIdForWrites(bubbles)`).
- Inserts into `messages` (`bubble_id`, `user_id`, `content`, `parent_id`, `attached_task_id`).
- **Attachment pipeline:** classifies files, validates limits, uploads to Supabase Storage (`MESSAGE_ATTACHMENTS_BUCKET`), PDF first-page thumbnails, video metadata/posters (client or Edge Function), then PATCHes `messages.attachments` JSON. On failure, deletes the message and storage prefix.
- Optimistically updates `dbMessages` and refreshes the current user row in `userById`.

### 1.7 “Create and attach card” handoff

- `handleComposeChatCard` resolves the same `targetBubbleId` rules, opens `onOpenCreateTaskForChat`, and on save calls `sendMessage` with `attachedTaskId` and caption from `latestInputRef` (composer text).

### 1.8 Search UX

- Local state for query, sender, date, results, loading, recent searches (localStorage).
- **`performSearch`:** builds a PostgREST query on `messages` with joins to `users`, `bubbles`, `tasks`, scoped by active bubble vs all real bubble IDs; supports `from:`, `in:`, `has:attachment`, date bounds, `ilike` on content.
- Renders a search results list (partial duplicate of feed card patterns).

### 1.9 Threading

- **`activeThreadParent`**, `threadMessages` derived from `allMessages` / `parentId`.
- Renders **`ThreadPanel`** with callbacks that delegate back to `sendMessage` and shared `renderMessageContent` / media modal.

### 1.10 Message body rendering

- **`renderMessageContent`:** regex splits for @displayName (against `teamMembersResolved`) and `/TaskTitle` (against `allTasks`), producing inline spans and “open task” buttons. Used by main feed, thread panel, and search results.

### 1.11 Shell UI beyond chat

- Header: collapse control, channel title, decorative icons, **search** toggle, **notifications** popover (join-request stubs + `useRouter` navigation), workspace title strip.
- **`MessageMediaModal`** for full-screen attachment viewing.

### 1.12 Main composer (inline `<input>`)

- Controlled `input` + hidden file input; pending file chips; paperclip, “create card”, submit.
- **`handleInputChange`:** @-mention detection (token after `@` without spaces) and `/` task-mention detection (`lastTaskMentionSlashIndex`).
- Popovers for member and task suggestions; keyboard navigation (arrows, Enter/Tab, Escape).
- Submit wired to `sendMessage` for root messages only (thread replies use `ThreadPanel`’s separate state machine).

### 1.13 `ThreadPanel.tsx` (satellite monolith pattern)

- Owns **duplicate** message row layout (avatar, timestamp, body, `ChatFeedTaskCard`, thumbnails) and a **second, simpler composer:** local `threadInput`, `pendingFiles`, plain `<input>`, no @ or `/` popovers.
- Depends on **`ChatMessage` type from `ChatArea`** (coupling direction: thread → parent file).

---

## 2. Gap analysis: why this cannot drop into `TaskModal` today

### 2.1 Comments are a different data model

- TaskModal comments live in **`tasks.comments`** (JSON array) via `useTaskEmbeddedCollections` / `TaskModalCommentsPanel` — not in `messages`.
- There is **no** `target_task_id` (or equivalent) on `public.messages` in the current generated types; every message is scoped by **`bubble_id`** (required on insert). Unifying on `messages` is a **schema + RLS + migration** project, not a pure UI extract.

### 2.2 Hard bubble and workspace assumptions

- Loads and subscribes with **`bubble_id` filters only**; realtime channel setup loops per bubble id. A task-scoped thread would need a different filter key (future column) or a different subscription strategy.
- **`sendMessage`** always writes `bubble_id` derived from `activeBubble` / thread parent / default bubble for “All Bubbles.” TaskModal already knows `taskId` and `bubbleId` but ChatArea never accepts an override thread key from outside the store.

### 2.3 Tight coupling to `useWorkspaceStore`

- Active channel, workspace id/name/role, and “which bubble label to show” are all store-driven. The modal does not use this store slice the same way; embedding ChatArea would either fight the global active bubble or require fragile overrides.

### 2.4 Duplicated and uneven composer behavior

- **Rail composer:** @ mentions, `/` task links, Kanban attach, rich attachment pipeline.
- **Thread composer:** text + files only, implemented separately inside `ThreadPanel`.
- TaskModal comments: **textarea**, no attachments, no mentions, no threads. Three divergent UX/data paths.

### 2.5 Inline layout and absolute positioning

- Mention popovers are **`absolute bottom-24 left-6`** relative to the full `ChatArea` column. Dropping the same JSX into a modal tab would misalign overlays unless layout is refactored to anchor popovers to the composer (portal or floating UI).

### 2.6 Type and import coupling

- `ChatMessage` and `parseSearchFilters` are exported from the same file as the page-sized component, so consumers pull the entire module graph risk. `ThreadPanel` imports types from `ChatArea`, which discourages reuse from other trees (e.g. modals) without circular dependency risk.

### 2.7 Search and notifications are rail-specific

- Message search assumes **workspace-wide bubble id lists** and bubble name joins (`in:` operator). Notifications UI is partially stubbed but wired to rail concepts (collapse, thread parent from notification). None of this is optional or pluggable for a “comments only” surface.

### 2.8 Side-effect surface area in one callback

- `sendMessage` bundles **auth, RLS-sensitive inserts, storage, edge invokes, and optimistic cache updates**. Reuse in a modal requires the same invariants (workspace id, storage paths, attachment RLS) but **different scoping rules** once messages can anchor on a task.

---

## 3. Component extraction strategy

Goal: **presentational** composers and feeds that accept data and callbacks, plus **orchestration** in parent pages (`ChatArea` shell, future `TaskModal` tab) or in hooks.

### 3.1 `<RichMessageComposer />` — proposed prop contract

Design principle: the composer **does not** call Supabase or read `useWorkspaceStore`. It emits intents; the parent or a thin adapter performs I/O.

| Concern                | Props / pattern                                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Text value**         | Controlled: `value`, `onChange` (or uncontrolled with `defaultValue` + `onSubmit` only — prefer controlled for mention math).                                                                                                                                      |
| **Submit**             | `onSubmit({ text, files, attachedTaskId? })` or `onSend` returning `Promise<boolean>` so the parent can clear state on success.                                                                                                                                    |
| **Disabled / loading** | `disabled`, `isSending`, `placeholder`.                                                                                                                                                                                                                            |
| **Attachments**        | Optional: `pendingFiles`, `onPendingFilesChange`, `accept`, `maxFiles` / validation errors passed down as `error?: string` from parent after parent runs shared validators. Alternatively composer owns file picking UI but still uses callbacks for “add/remove”. |
| **@ Mentions**         | `mentionConfig?: { members: MentionMember[]; onInsertMention: (name: string) => void }` or render-prop `renderMentionPopover({ query, onPick, highlightedIndex })` so different hosts can supply workspace members vs task assignees later.                        |
| **`/` commands**       | `slashCommandConfig?: { tasks: SlashTaskItem[]; onInsertTaskLink: (title: string) => void }` — same separation: data in, text mutation out.                                                                                                                        |
| **“Create card”**      | `slotActions` or explicit `onRequestCreateCard?: () => void` + `createCardDisabledReason?: string` so TaskModal can hide or repurpose.                                                                                                                             |
| **Keyboard**           | Composer owns local key handling for popovers **if** it also owns the input ref; expose `inputRef` for parents that need focus management.                                                                                                                         |
| **Anchoring**          | `popoverAnchor?: 'composer' \| 'portal'` (implementation detail) — ensures overlays work inside modals.                                                                                                                                                            |

**Rendering location:** The same component can sit in the rail footer, inside `ThreadPanel`, or in TaskModal as long as the parent passes the right `mentionConfig` / `slashCommandConfig` and implements `onSubmit` against the unified messages API (once schema exists).

### 3.2 `<MessageFeed />` — proposed prop contract

| Concern             | Props / pattern                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Items**           | `messages: ChatMessage[]` (or a renamed shared type moved to `types/chat.ts` to break the `ChatArea` import).                                                                                           |
| **Row renderer**    | **Default:** internal `<ChatMessageRow />`. **Override:** `renderMessage?: (msg: ChatMessage) => ReactNode` for one-off hosts, or composition: `MessageFeed` maps to `<ChatMessage message={msg} … />`. |
| **Thread actions**  | `onOpenThread?(msg)`, `activeThreadId?: string`, `threadUnreadHint?(msgId): boolean` so notification logic stays in the shell.                                                                          |
| **Embeds**          | `onOpenTask`, `bubbleUpPropsFor` (or a single `getTaskCardProps(taskId)`), `onOpenAttachment` — same as today but passed from parent.                                                                   |
| **Scroll**          | `scrollRef` forwarded, or `onAutoScroll?: 'bottom' \| 'none'` to preserve current “stick to bottom on new message” behavior.                                                                            |
| **Empty / loading** | `isLoading`, `emptyState`.                                                                                                                                                                              |

**`<ChatMessage />` (new leaf):** One message: avatar, header (name, optional channel badge for “All Bubbles”), timestamp, body via **`renderMessageContent` passed as prop** `renderContent: (text: string) => ReactNode` so mention/task highlighting stays shared without duplicating `ThreadPanel` markup.

### 3.3 Extraction order (suggested)

1. Move **`ChatMessage`**, mappers, and `parseSearchFilters` to **`src/types/chat.ts`** / **`src/lib/chat-message-mapper.ts`** (no behavior change).
2. Extract **`<ChatMessageRow />`** used by feed + thread + search result rows to remove triplicated JSX.
3. Extract **`<RichMessageComposer />`** from `ChatArea` and replace **`ThreadPanel`**’s form with the same component in a **“thread mode”** (fewer actions: hide slash/Kanban if product dictates).
4. Keep **`ChatArea`** as a **layout shell**: header, search overlay, `MessageFeed`, `ThreadPanel`, wiring hooks — until the hook below absorbs data effects.

---

## 4. Data hook strategy: `useMessageThread(filter)`

Naming: **`useMessageThread`** emphasizes thread replies via `parent_id`; it can still power a flat “channel” view by exposing `rootMessages` and `repliesByParentId` or by letting the UI filter `parent_id == null`.

### 4.1 Filter shape (discriminated union)

```ts
type MessageThreadFilter =
  | { scope: 'bubble'; bubbleId: string }
  | { scope: 'bubbles'; bubbleIds: string[] } // “All Bubbles” aggregate
  | { scope: 'task'; taskId: string }; // future: requires DB support on `messages`
```

The hook returns a stable object, for example:

- `messages: MessageRowWithEmbeddedTask[]` (or mapped `ChatMessage[]` behind a flag)
- `isLoading`, `error`
- `refresh()` optional
- **`sendMessage(payload)`** mirroring today’s semantics but taking explicit `bubbleId` / `parentId` / `attachedTaskId` from the caller when scope is task-centric
- Realtime subscription lifecycle keyed on **`filter` + workspace id** (or a hash of bubble ids for aggregate)

### 4.2 Flexibility: bubble rail vs future task modal

| Mode                     | Query                                                             | Realtime                                                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Single bubble**        | `.eq('bubble_id', id)`                                            | `filter: bubble_id=eq.{id}` on `messages` + `tasks`                                                                                                                                             |
| **Many bubbles**         | `.in('bubble_id', ids)`                                           | One channel, multiple `channel.on` registrations (same as today)                                                                                                                                |
| **Task-scoped (future)** | `.eq('target_task_id', taskId)` **once the column and RLS exist** | `filter: target_task_id=eq.{taskId}` on `messages`; task row updates may still use `bubble_id=eq.{bubble}` on `tasks` **or** filter tasks by id list if realtime supports `id=eq.{taskId}` only |

**Important:** Supabase Realtime filters are string equality on columns. Until `messages` carries a task anchor, **you cannot** implement the task branch purely in the hook; the plan assumes a follow-up migration adding something like `target_task_id uuid null` (name TBD) with indexes and RLS aligned to “can view task → can view messages.”

### 4.3 Keeping realtime intact

- Move the **exact** `channel.on('postgres_changes', …)` setup from `ChatArea` into the hook with **no behavioral regression** for bubble scopes.
- For task scope, prefer **one pair of filters** (`INSERT`/`UPDATE`/`DELETE` on `messages` by task id) over over-subscribing to unrelated bubbles.
- Preserve the **tasks table listeners** for embedded cards: when scope is task-centric, subscribe to **`tasks` where `id = taskId`** (if supported) or keep a narrow bubble-based task subscription if that is the only policy that matches RLS publication settings.

### 4.4 Hook boundaries

- **`useMessageThread`** owns: Supabase client calls for load + realtime + optimistic merge patterns for `dbMessages` / `userById` hydration (or split `useMessageAuthors` if needed).
- **Does not** own: workspace member directory for mentions (separate `useWorkspaceMentionDirectory(workspaceId)`), task list for slash commands (`useTasksForSlashCommands(bubbleIds)`), or dashboard header UI.

### 4.5 Relation to TaskModal migration path

1. Introduce hook + UI extractions **while** Comments still use JSON — no user-visible change to modal.
2. Add `messages.target_task_id` (or equivalent), backfill from `tasks.comments`, switch RLS, then point **`useMessageThread({ scope: 'task', taskId })`** at the new filter and reuse **`RichMessageComposer` + `MessageFeed`** in the Comments tab.
3. Deprecate writes to `tasks.comments` once parity is verified.

---

## 5. Summary

| Layer        | Today                                | Target                                                  |
| ------------ | ------------------------------------ | ------------------------------------------------------- |
| **Data**     | `ChatArea` effects + realtime        | `useMessageThread(filter)` (+ small helper hooks)       |
| **Feed**     | Inline `map` in `ChatArea`           | `<MessageFeed />` + `<ChatMessage />`                   |
| **Composer** | Inline input + duplicate thread form | `<RichMessageComposer />` (thread mode vs full mode)    |
| **Comments** | JSON on `task` row                   | Same UI + `messages` with task scope (schema follow-up) |

This establishes shared vocabulary for the `refactor/chat-area-rail` work: **extract UI first**, **centralize data in a filter-aware hook second**, and **unify TaskModal comments with `messages` only after** the database exposes a task anchor that realtime and RLS can enforce.
