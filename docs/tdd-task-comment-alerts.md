# Technical design: task comment alerts & “open comments” on Kanban cards

## 1. Problem

Today, task **comments** live in `public.tasks.comments` (JSON array) and are edited in **`TaskModal`** on the **Comments** tab. When user A posts a comment, other users in the workspace have **no signal** that anything changed unless they open the task and check the tab. There is also **no dedicated affordance** on the Kanban card to jump straight to the Comments tab.

## 2. Goals

1. **Alert** relevant users when a **new comment** is added to a task (define “relevant” and delivery channel below).
2. **Kanban card UX**: add a **default control** (e.g. icon button) that opens **`TaskModal`** (the app’s task editor modal—not a separate “KanbanModal”) with the **Comments** tab selected.

Non-goals for v1 (unless product explicitly expands scope):

- Threading / @mentions UI (can be layered later).
- Email or mobile push (unless infra already exists).

## 3. Current implementation map

| Area                 | Location                  | Notes                                                                                                              |
| -------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Comment storage      | `tasks.comments` (`Json`) | Array of `TaskComment` (see `src/types/task-modal.ts`).                                                            |
| Post comment         | `TaskModal`               | Updates row via Supabase `.update({ comments: … })`.                                                               |
| Modal tabs           | `TaskModal`               | `TabId = 'details' \| 'comments' \| 'subtasks' \| 'activity'`; `tab` is **local `useState`**, default `'details'`. |
| Open task from board | `dashboard-shell.tsx`     | `openTaskModal(id)` sets `taskId` + opens modal; **no initial tab**.                                               |
| Kanban card          | `kanban-task-card.tsx`    | Whole-card click calls `onOpenTask(task.id)`; no comments-specific entry.                                          |
| Realtime (tasks)     | `KanbanBoard.tsx`         | `postgres_changes` on `tasks` reloads board; **does not** surface “new comment” toasts.                            |

## 4. Design: open TaskModal on Comments tab

### 4.1 API shape

Extend modal wiring so the shell can request an initial tab when opening an existing task:

- **`TaskModal`**: add optional prop, e.g. `initialTab?: TabId` (or only `'comments'` if you want to narrow the surface).
- When **`open` becomes true** and **`taskId` is set**, run an effect (or derive in render) to `setTab(initialTab ?? 'details')`, then **clear** the need for `initialTab` on the parent so reopening the same task later defaults to Details unless specified again.

Suggested parent API in **`dashboard-shell.tsx`**:

- Change `openTaskModal` from `(id: string)` to `(id: string, opts?: { tab?: TabId })` (or overload with `{ initialTab: 'comments' }`).
- Pass `initialTab` into `TaskModal` from state that is reset when the modal closes (same pattern as `initialCreateStatus`).

### 4.2 Kanban card button

- Add a **secondary control** (e.g. **`MessageCircle`** / **`MessageSquare`** from `lucide-react`) in a consistent corner (e.g. next to the drag handle row or bottom-right), **visible when** `onOpenTask` exists.
- **`onClick` / `pointerdown`**: `stopPropagation()` so choosing “comments” does not also fire the card’s main “open details” click.
- **`onOpenTask`** cannot distinguish tabs today; extend the callback to something like `onOpenTask?.(task.id, { tab: 'comments' })` **or** add a separate optional prop `onOpenTaskComments?: (taskId: string) => void` to keep call sites simple. Prefer **one callback with optional options** to avoid prop duplication.

### 4.3 Optional: badge count

- Derive **comment count** from `asComments(task.comments).length` on the card (same helper as the modal).
- Show a small **numeric badge** on the icon when `count > 0` (and optionally when `count === 0` for discoverability—product choice).

## 5. Design: alerting other users

### 5.1 Who should be notified?

Reasonable default:

- All **workspace members** who can see the task **except the comment author**, or
- Narrower: members of the **bubble** that owns the task (if that matches your RLS and product).

Define explicitly in implementation (query membership via existing workspace/bubble tables).

### 5.2 Delivery channels (phased)

| Phase  | Mechanism                                                                                                                           | Pros                                                              | Cons                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **P0** | **In-app toast / banner** when a **Realtime** `tasks` UPDATE is received where `comments` JSON changed and `event` is not from self | Fast, no new tables; fits existing Supabase subscription patterns | Only users **online** with app subscribed see it; need to diff comments or use metadata |
| **P1** | **`notifications` table** + insert on comment (or trigger) + poll / Realtime subscription in a small bell UI                        | Persistent, works across sessions                                 | Schema + RLS + read path                                                                |
| **P2** | Email / push via Edge Functions + queue                                                                                             | True async delivery                                               | Cost, templates, opt-out                                                                |

### 5.3 P0: Realtime-driven “new comment” without a new table

**Idea:** On the client, subscribe to `tasks` for the workspace/bubble scope (similar to `KanbanBoard`, or a **single lightweight** channel in `DashboardShell` / layout). On `UPDATE` payload:

1. If `new` row’s `comments` length **>** `old` row’s (or deep-compare last comment id/timestamp), treat as “new comment(s)”.
2. If `new.comments` author of the latest entry **is current user**, skip.
3. If **current user** has **`TaskModal` open** on that `taskId` and **Comments tab** active, optionally **skip toast** (or show a subtle inline refresh only).

**Caveat:** Postgres `postgres_changes` payloads may not always include old row; if not, you may only detect “task changed” and re-fetch task to diff comments, or add a **`comment_count`** column maintained by trigger to simplify comparison (optional migration).

### 5.4 P1: Durable notifications (recommended if you need “unread”)

- Add `notification` rows: `{ id, user_id, workspace_id, task_id, type: 'task_comment', created_at, read_at, payload: { author_id, snippet } }`.
- Insert from:
  - **Server action / Edge Function** invoked after comment save, or
  - **DB trigger** on `tasks` update (complex with JSON diff) — often simpler to **insert from app** right after successful `update` in `TaskModal` with a **server-side** helper that enumerates recipients.

**RLS:** users can `select` their own notifications; service role or security definer function for insert.

### 5.5 Chat integration (optional)

If BuddyBubble chat should show “Someone commented on task X”:

- Post a **system message** or **structured card** into the relevant thread (requires chat data model support). Treat as **P2** unless chat already has hooks for system events.

## 6. Security & privacy

- Reuse existing **task visibility** rules: only users who can `select` the task should receive alerts about it.
- Avoid leaking comment **body** in toast if policy requires; show “New comment on **{task title}**” only.

## 7. UX copy (toast)

- Example: **“Alex commented on ‘Wire up API’.”** with action **Open** → calls `openTaskModal(taskId, { tab: 'comments' })`.

## 8. Testing & QA

- Post comment as user A; user B receives toast (P0) or notification (P1).
- Card button opens modal on **Comments** tab; card body still opens **Details** (or same default as today).
- No double-open when clicking icon + card (use `stopPropagation` on icon).
- Guest / read-only: icon can open **read-only** Comments tab if `onOpenTask` allowed; hide post button (already gated by `canWrite` in modal).

## 9. Summary

| Deliverable            | Approach                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open modal on Comments | `initialTab` (or equivalent) on `TaskModal` + `openTaskModal(id, opts)` in `dashboard-shell`; Kanban passes `tab: 'comments'` from new icon button. |
| Alert others           | Start with **Realtime + diff + toast** (P0); add **notifications table** if you need unread/offline (P1).                                           |

This document is intentionally incremental: ship **open comments from the card** first (isolated UI change), then layer **alerts** with the smallest subscription/notification path that matches product expectations.
