# Phase 2 — TaskModal integration behind a feature flag

> Wire `StandardTaskChatRail` into both `TaskModal` chat mount points behind
> `NEXT_PUBLIC_STANDARD_TASK_CHAT_RAIL`. Keep `TaskModalCommentsPanel` mounted
> when the flag is off so rollback is one env flip away.

## Locked decisions (Phase 2 planning — do not revisit without amending Phase 0)

1. **Composer portal.** On the **flag-on** path, **drop** `composerPortalHost`,
   `unifiedScrollLayout`, `scrollContainerRef`, and `hideThreadBackRow`. The
   rail’s own composer footer sits in the same flex column **directly above**
   `TaskModalTabBar`. This preserves [README](./README.md) principle 5 (“rail
   owns its footer”). The **flag-off** path stays byte-identical to today’s
   `TaskModalCommentsPanel` wiring (including the portal host div in
   `comments-only` mode).
2. **Thread sub-view.** On the **flag-on** path there is **no** secondary
   drill-down thread pane. The rail renders **root + replies inline** (same
   transcript model as Phase 1). `commentsPanelRef.exitThread()` remains on the
   imperative handle contract but is a **no-op** for caller compatibility.
   `onThreadViewChange?.(false)` should be invoked once when the adapter mounts
   so `TaskModal`’s `commentsInThreadView` state matches the simplified UX.
3. **Buddy sentinel.** Hide via optional rail prop `transcriptFilter` (Phase 0
   §4 amendment). The rail must **not** embed `BUDDY_ONBOARDING_SYSTEM_EVENT`;
   the adapter passes the predicate. Silent sentinel **insert** stays in the
   adapter (mirror
   [`TaskModalCommentsPanel.tsx`](../../../src/components/modals/task-modal/TaskModalCommentsPanel.tsx)
   ~440–499).
4. **TaskModal-only row callbacks.** Pass via optional `chatRowExtras` (Phase 0
   §4 amendment) — not as top-level rail props.

## Inputs

- Phase 1 complete (`StandardTaskChatRail.tsx` shipped, tests green, sandbox
  proves end-to-end send works).
- Phase 0 §4 amended with `transcriptFilter` + `chatRowExtras` and §5 re-signed
  in the **same PR** as this phase’s code.
- The two existing TaskModal chat mount branches in
  [`src/components/modals/TaskModal.tsx`](../../../src/components/modals/TaskModal.tsx):
  - `viewMode === 'comments-only'` (`TaskModalCommentsPanel` ~1256–1276)
  - `viewMode === 'full' && tab === 'comments'` (`TaskModalCommentsPanel` ~1554–1582)

## Deliverables

### Files to **create**

1. [`src/lib/feature-flags/standardTaskChatRail.ts`](../../../src/lib/feature-flags/standardTaskChatRail.ts) —
   export `isStandardTaskChatRailEnabled(): boolean` reading
   `process.env.NEXT_PUBLIC_STANDARD_TASK_CHAT_RAIL === '1'`. Centralizes the
   toggle so Phase 4 is a one-import sweep.

2. [`src/components/modals/task-modal/TaskModalChatRailAdapter.tsx`](../../../src/components/modals/task-modal/TaskModalChatRailAdapter.tsx) —
   `forwardRef` adapter implementing
   [`TaskModalCommentsPanelHandle`](../../../src/components/modals/task-modal/TaskModalCommentsPanel.tsx)
   (`{ exitThread: () => void }`).

   **Props:** mirror everything `TaskModal` currently passes to
   `TaskModalCommentsPanel` that the adapter still needs (taskId, workspaceId,
   bubbles, canWrite → `canPostMessages`, taskBubbleIdHint, initialCommentThreadMessageId,
   onThreadViewChange, onMarkedRead, onCoachDraftFinalizeSuccess,
   chatCardWorkoutActions, etc.). Omit portal-only props on the flag-on path
   (they are not passed from `TaskModal` when branching to the adapter).

   **Rail mount:** `<StandardTaskChatRail … defaultAgentSlug={null} />` until
   Phase 3. Pass:
   - `transcriptFilter={(row) => row.content !== BUDDY_ONBOARDING_SYSTEM_EVENT}`
     (constant imported from the same string as
     `TaskModalCommentsPanel` / `ChatArea`, or a tiny shared module to avoid
     drift).
   - `chatRowExtras` with at least:
     `onCoachDraftFinalizeSuccess`, `chatCardWorkoutActions`,
     `bubbleUpPropsFor` (adapter computes via
     [`useTaskBubbleUps`](../../../src/hooks/use-task-bubble-ups.ts) over
     `embeddedTaskIds` derived from the adapter helper `useMessageThread.messages`
     — same pattern as
     [`TaskModalCommentsPanel.tsx`](../../../src/components/modals/task-modal/TaskModalCommentsPanel.tsx)
     ~544–552; `TaskModal` does not pass this prop today),
     `onOpenAttachment` (wire to the same `MessageMediaModal` pattern
     `TaskModalCommentsPanel` uses, or lift modal state into the adapter).

   **Buddy sentinel insert:** dedicated `useEffect` mirroring
   `TaskModalCommentsPanel` (~462–499): raw `messages.length === 0`,
   `buddyTriggerFiredRef`, `sendMessageRef`, `waitMainRegisterIntent` /
   `waitMainRegisterSuccessfulSend` on the **Buddy** agent from
   `agentsByAuthUserId`. The adapter may use a **second** `useMessageThread`
   instance scoped to the same task **only** for this one-shot insert; the
   rail keeps its own hook for transcript + send. Two realtime channels per task
   are acceptable (`channelInstanceIdRef` in
   [`useMessageThread.ts`](../../../src/hooks/useMessageThread.ts) prevents name
   collisions).

   **`onMarkedRead`:** copy the debounced `user_task_views` upsert + callback
   from `TaskModalCommentsPanel` (~178–212). Rail stays unaware.

   **`initialCommentThreadMessageId`:** after messages load, `querySelector`
   `[data-message-id="<id>"]` and `scrollIntoView` / highlight. **No**
   `setActiveThreadParent` — thread sub-view is removed on flag-on.

   **`useImperativeHandle`:** `{ exitThread: () => {} }`.

   **`onThreadViewChange`:** call `onThreadViewChange?.(false)` once on mount.

### Files to **modify**

1. [`src/components/modals/TaskModal.tsx`](../../../src/components/modals/TaskModal.tsx)

   At **both** chat mount points:

   ```tsx
   {standardRailEnabled ? (
     <TaskModalChatRailAdapter ref={commentsPanelRef} ... />
   ) : (
     <TaskModalCommentsPanel ref={commentsPanelRef} ... />
   )}
   ```

   - **`viewMode === 'comments-only'` + flag on:** do **not** render the empty
     `composerPortalHost` div (the sibling above `TaskModalTabBar` today).
     Render the adapter inside the same flex column so the rail footer precedes
     `<TaskModalTabBar />`.
   - **`viewMode === 'comments-only'` + flag off:** unchanged (keep portal host
     div + all `TaskModalCommentsPanel` props).

2. [`src/components/chat/StandardTaskChatRail.tsx`](../../../src/components/chat/StandardTaskChatRail.tsx)
   (Phase 2 code PR — not Phase 1)
   - Accept optional `transcriptFilter` and `chatRowExtras` per Phase 0 §4.
   - Apply `transcriptFilter` when building the mapped transcript (after
     `rowToChatMessage`, filter source rows or filter `chatMessages` — document
     whichever preserves `replyCounts` consistency; simplest: filter
     `messages` before `map`).
   - Spread `chatRowExtras` onto each `ChatMessageRow`.
   - Wrap each row in `<div data-message-id={msg.id}>` (or add an equivalent
     stable selector) so the adapter’s deep-link scroll works.

3. [`.env.example`](../../../.env.example) — add:

   ```bash
   # TaskModal: 1 = StandardTaskChatRail + TaskModalChatRailAdapter; 0 = TaskModalCommentsPanel. See docs/refactor/standard-task-chat-rail/phase-2-task-modal-integration.md
   NEXT_PUBLIC_STANDARD_TASK_CHAT_RAIL=
   ```

### Files **not** touched

- [`TaskModalCommentsPanel.tsx`](../../../src/components/modals/task-modal/TaskModalCommentsPanel.tsx) (flag off).
- [`WorkoutCoachRail.tsx`](../../../src/components/chat/WorkoutCoachRail.tsx) /
  [`WorkoutPlayer.tsx`](../../../src/components/fitness/WorkoutPlayer.tsx) (Phase 5).
- [`useMessageThread.ts`](../../../src/hooks/useMessageThread.ts) — no semantic
  changes (channel suffixing already prevents collisions).
- Anything under `supabase/functions/**`, agent RPCs, RLS, or DB schema.

## Feature porting matrix

| Feature                                           | Flag-on disposition                                      |
| ------------------------------------------------- | -------------------------------------------------------- |
| Hide Buddy onboarding sentinel from transcript    | `transcriptFilter` on rail                               |
| Buddy silent sentinel insert                      | Adapter `useEffect` + optional second `useMessageThread` |
| `initialCommentThreadMessageId`                   | Scroll to `[data-message-id="…"]`; no thread pane        |
| `commentsPanelRef.exitThread()`                   | `useImperativeHandle` **no-op**                          |
| `onMarkedRead` (`user_task_views`)                | Adapter debounced upsert only                            |
| `onCoachDraftFinalizeSuccess`                     | `chatRowExtras`                                          |
| `chatCardWorkoutActions`                          | `chatRowExtras`                                          |
| `composerPortalHost` / `unifiedScrollLayout`      | **Dropped** on flag-on                                   |
| `showInlineGenerateWorkout` / `onGenerateWorkout` | **Deferred** to Phase 3+ (workout adornment slot)        |
| `onMessagesScroll` / `scrollContainerRef`         | **Dropped** on flag-on (rail scroll is internal)         |

## Tests

1. **Flag off (default):** all existing `TaskModalCommentsPanel` / TaskModal
   tests pass unchanged. Capture `git diff` on test files — expect **no**
   changes.
2. **Flag on:**
   - Both `viewMode` branches render `TaskModalChatRailAdapter` (which wraps
     `StandardTaskChatRail`).
   - `commentsPanelRef.current?.exitThread()` does not throw (no-op).
   - Rail receives `defaultAgentSlug={null}`, `transcriptFilter`, `chatRowExtras`.
   - Sentinel content never appears in the DOM transcript.
   - User send: `metadata.default_agent_slug` **absent** on insert.
   - `user_task_views` upsert fires after debounce (mock Supabase or spy).
   - Deep-link: after load, the target `data-message-id` row is scrolled into
     view (Testing Library + `scrollIntoView` mock).
3. **Layout guard (comments-only + flag on):** document order — last composer
   `form` (or `formTestId="standard-task-chat-rail-composer"`) appears **before**
   `<TaskModalTabBar />`; no `composerPortalHost` sibling.

## Operational checklist (per environment)

- [ ] Flag added to `.env.example` and to staging as `0`.
- [ ] Smoke: TaskModal flag off — post, tab switch, deep-link URL.
- [ ] Flip flag to `1` in one dev workspace; repeat smoke; flip back.

## Acceptance criteria

- [ ] Both TaskModal chat mount points flag-branched.
- [ ] Default flag off; CI covers both paths (env var in test matrix).
- [ ] Adapter uses `defaultAgentSlug={null}`; `transcriptFilter` + `chatRowExtras` wired.
- [ ] Phase 0 §4 includes new props; §5 re-signed same PR.
- [ ] README status row Phase 2 → **in review** same PR.
- [ ] No edits to `TaskModalCommentsPanel.tsx`, `WorkoutCoachRail.tsx`, or
      `useMessageThread` semantics; no `agent-dispatch` / DB changes.

## Risk + rollback

Rollback = `NEXT_PUBLIC_STANDARD_TASK_CHAT_RAIL=0` + redeploy. No code revert.
Soak flag-on in staging ≥1 day before per-workspace enable.
