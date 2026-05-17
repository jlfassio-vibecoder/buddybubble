# Phase 3.8 — Strict channel isolation (main bubble vs task thread)

## Problem

Unified chat stores **bubble channel** messages and **task-scoped** comments in the same `public.messages` table. Task comments **must** carry the parent task’s `bubble_id` (routing + RLS + `messages_target_task_bubble_match`), so they **match** naive queries of the form “all messages where `bubble_id = X`”.

Without an explicit **`target_task_id IS NULL`** partition for “main channel” semantics, task-modal traffic can appear in `ChatArea` (initial load, silent refresh, realtime, and any direct `messages` queries such as search).

## Verified baseline (Supabase MCP + CLI)

- **Schema:** `public.messages` includes nullable `target_task_id` (FK → `tasks.id`) and required `bubble_id` (FK → `bubbles.id`). Column comments in DB document the dual role.
- **Live distribution (example snapshot from project DB):**
  - `target_task_id IS NULL`: 891 rows — **main bubble channel** rows
  - `target_task_id IS NOT NULL`: 588 rows — **task thread** rows
- **CLI:** `supabase migration list` shows local and remote migrations aligned (no drift blocking this phase).

## Invariants (non-negotiable)

| Universe                   | `useMessageThread` scope | Row predicate               |
| -------------------------- | ------------------------ | --------------------------- |
| **Main Bubble Chat**       | `bubble`, `all_bubbles`  | `target_task_id IS NULL`    |
| **Task Modal / task rail** | `task`                   | `target_task_id = <taskId>` |

No cross-universe bleed in:

1. Initial PostgREST load
2. `silentRefreshMessages`
3. Realtime `postgres_changes` handlers (payload gate; subscription filter unchanged)
4. `ChatArea` message search (direct query bypasses the hook)

## Implementation rules

### PostgREST (`supabase-js`)

For `scope === 'bubble'` and `scope === 'all_bubbles'`, every `from('messages').select(...)` in [`src/hooks/useMessageThread.ts`](../../../src/hooks/useMessageThread.ts) appends:

```ts
.is('target_task_id', null)
```

Task scope continues to use `.eq('target_task_id', taskId)` only.

### Realtime

Supabase Realtime filters for `messages` remain `bubble_id=eq.<uuid>` (cannot express `IS NULL` in the filter string reliably for this use case).

Therefore, `onInsert` / `onUpdate` / `onDelete` in `useMessageThread` **must** drop payloads where `target_task_id` is non-null when the active filter is `bubble` or `all_bubbles`.

Shared predicate: [`shouldDropRealtimeMessagePayloadForMainBubbleScope`](../../../src/lib/message-thread.ts).

### Search bypass

[`src/components/chat/ChatArea.tsx`](../../../src/components/chat/ChatArea.tsx) `performSearch` queries `messages` directly — add the same `.is('target_task_id', null)` so search matches main-channel semantics.

## Acceptance criteria

- Posting in **Task Modal** / `StandardTaskChatRail` does **not** add rows to `ChatArea`’s message list for the same bubble.
- Realtime: task-scoped inserts/updates do **not** mutate `ChatArea` state.
- Search never returns task-scoped rows as bubble hits.
- Task rail / `TaskModalCommentsPanel` task scope unchanged.

## Smoke checklist (manual)

1. Open a bubble in main chat; note latest message id.
2. Open a task on that bubble; post in task comments.
3. Confirm main chat list **does not** show the new line (no scroll jump content match).
4. Run chat search for a phrase only in task comments — **no** hit in main results.
5. Confirm task rail still shows the line and receives realtime updates.

## Non-goals (this phase)

- Agent prompt / guard / dispatch behavior changes.
- DB migrations to rewrite legacy rows (optional hygiene later).
- New tables or `message_kind` enums (future hardening only if needed).

## Cross-references

- Hook: [`src/hooks/useMessageThread.ts`](../../../src/hooks/useMessageThread.ts)
- Predicate helpers: [`src/lib/message-thread.ts`](../../../src/lib/message-thread.ts)
- Main chat: [`src/components/chat/ChatArea.tsx`](../../../src/components/chat/ChatArea.tsx)
- Epic index: [`README.md`](./README.md)
