# Workouts Bubble: architectural gap analysis

**Scope:** Read-only review of the **Workouts** channel (default Kanban path: [KanbanBoard.tsx](../../src/components/board/KanbanBoard.tsx)), the shell’s **workout player** handoff ([dashboard-shell.tsx](../../src/components/dashboard/dashboard-shell.tsx)), and [WorkoutPlayer.tsx](../../src/components/fitness/WorkoutPlayer.tsx).  
**Note:** There is no `src/components/workout-player.tsx`; the player lives under `src/components/fitness/`.

**Permissions in this path:** [ChatArea](../../src/components/chat/ChatArea.tsx) receives `canPostMessages` and `canWriteTasks` from the shell (from `usePermissions` → `resolvePermissions` in [permissions.ts](../../src/lib/permissions.ts)). [KanbanBoard](../../src/components/board/KanbanBoard.tsx) receives `canWrite` (same as `canWriteTasks` in practice) and passes it into cards/columns; it does not receive `canPostMessages` (chat is separate).

---

## High-priority risks (race conditions / state bugs)

1. **(Addressed)** **Unstable `exercises` reference reset in-progress set logs.**  
   Previously the shell passed a fresh `exercises` array from `metadataFieldsFromParsed` on every render. **Current behavior:** [WorkoutPlayer](../../src/components/fitness/WorkoutPlayer.tsx) accepts raw `metadata` and `sourceTaskId`, derives exercises with a `metadataDigest` / `exercisesStringDigest`, and resets session state only when `open`, `sourceTaskId`, or the exercise content digest changes.
2. `**handleFinish` dependency on `exercises` + `logs` vs async source task fetch.\*\*
   `handleFinish` re-fetches the source task if `sourceTaskId` is set, then inserts `workout_log`. The callback closes over `logs` and `exercises` from the latest render. The pattern is sound if no reset bug fires; if logs were reset (issue 1), the user could finish with empty or partial data.
3. **Kanban `loadTasks` vs drag race (mitigated, not zero risk).**
   [KanbanBoard.tsx](../../src/components/board/KanbanBoard.tsx) uses `loadTasksGenerationRef` to drop stale async results and `draggingRef` to **skip** applying `setColumns` if a drag is active (~560–565, ~608). This reduces column flicker; edge cases remain if drag state and load completion interleave in unexpected ways (e.g. rapid bubble switch + drag end).
4. **Scheduled → Today promotion on load only when `canWrite`.**
   If `canWrite` is false, the board **groups** with `tasksWithScheduledPromotedToTodayForGrouping` but does not persist `status: 'today'` ([KanbanBoard.tsx](../../src/components/board/KanbanBoard.tsx) ~569–605). The **Workouts** column semantics can diverge from DB for read-only users until a writer opens the space—intentional but easy to misread in support/debugging.

---

## UX / UI bottlenecks

1. **Z-order and focus stacking**
   [TaskModal](../../src/components/modals/TaskModal.tsx) uses `z-[150]`; [WorkoutPlayer](../../src/components/fitness/WorkoutPlayer.tsx) overlay/content use `z-[155]` / `z-[160]`. If a user had **both** open (e.g. odd navigation), the player sits above the task modal—generally good for “play on top,” but two modal roots can still create **competing focus traps** and scroll-lock behavior (Radix dialog behavior) unless one is closed.
2. **Workout player layout: fixed viewport, potential scroll/focus**
   Desktop: centered dialog, `h-[90dvh]`, `max-h-[90dvh]`, `overflow-hidden` on content. Mobile: bottom sheet `h-[92dvh]`, safe-area padding on footer. Risk areas: long exercise lists in **PlayerBody** may rely on **internal** scrolling; outer shell does not change layout, so **CLS on the main Kanban** is low—the player is a **portal** overlay, not in-flow. Jarring transitions are possible from **mobile bottom-sheet enter/exit** animations, not from Kanban reflow (Kanban is covered, not resized).
3. **Kanban re-render cost when unrelated shell state changes**
   `workspaceBoardEl` is `useMemo`’d and **does not** list `workoutPlayerTask` or `taskModalOpen` as dependencies ([dashboard-shell.tsx](../../src/components/dashboard/dashboard-shell.tsx) ~1142–1205). So opening **WorkoutPlayer** or **TaskModal** alone does not change the memo inputs and the **Kanban element reference can stay stable**—**good** for avoiding full board subtree churn from those flags.  
    However, **any** dependency change (e.g. `bubbles`, `canWriteTasks`, `taskViewsNonce`, `buddyBubbleTitle`, `handleStartWorkout` identity) still re-creates the board and re-renders [KanbanBoard](...). The board is a large client component (DndKit, many hooks, `loadTasks` on `taskViewsNonce`).
4. **Existing debug `console.log` in production path**
   [KanbanBoard `loadTasks](../../src/components/board/KanbanBoard.tsx)`~546–549 already logs`[DEBUG] Fetching tasks with updated multi-assignee filter...` on every load. This adds **noise and minor main-thread cost** on high-frequency refetches; it is not a structured tripwire for workout handoff.
5. **Prop drilling surface area**
   `canWriteTasks` / `canPostMessages` are passed explicitly into `ChatArea`; `canWrite` into `KanbanBoard`—**no** React Context for these flags in the shell. Stale UI is mitigated by `useCallback` on handlers and `useMemo` on board/chat props where used, but the shell remains a **large** coordinator.

---

## Recommended architectural fixes (directional only; no code here)

1. **Stabilize workout `exercises` for `WorkoutPlayer`:** pass `exercises` from a **memo keyed by `workoutPlayerTask.id` + stable serialized hash** of metadata, or move parsing **inside** `WorkoutPlayer` and depend on `workoutPlayerTask.id` + raw metadata string so the reset effect does not run on **reference-only** changes.
2. **Narrow `WorkoutPlayer` reset effect:** reset logs only when `**open` transitions false→true** or when **task id** (or canonical exercise blob) **meaningfully\*\* changes, not on every `exercises` array instance.
3. **Consider `React.memo` on `KanbanBoard` or a memoized child** for the column grid if prop references (`onOpenTask`, `handleStartWorkout`) are stabilized further—after fixing exercise stability, profile whether board still re-renders excessively from store subscriptions inside `KanbanBoard` (`useWorkspaceStore`, `useUserProfileStore`).
4. **Document modal policy:** e.g. auto-close `TaskModal` when starting `WorkoutPlayer` from a card, to avoid dual modals and double scroll lock.
5. **Replace ad-hoc Kanban `console.log` with opt-in dev-only logging or a small analytics/tripwire helper** (see below).

---

## Tripwire audit: top 3 critical execution paths

| Priority | Path                         | Suggested `console.log('[DEBUG] ...')` (or logger) focus                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | **Shell → player**           | **When** `setWorkoutPlayerTask(task)` runs (after `shouldBlockWorkoutForExpiredMemberPreview` is false): log `task.id`, `task.bubble_id`, `item_type`, and whether trial modal was **not** shown. Catches bad bubble/task pairing and trial gating mistakes. **Location:** `[handleStartWorkout](../../src/components/dashboard/dashboard-shell.tsx)` right before `setWorkoutPlayerTask`.                                                                                                          |
| 2        | **Player → DB log row**      | **When** `handleFinish` is about to `insert` the `workout_log`: log `sourceTaskId`, `insertedLog` bubble id, **count of completed set_logs**, and `durationMins`. Catches handoff from UI state to persistence and assignee sync. **Location:** `[WorkoutPlayer` `handleFinish](../../src/components/fitness/WorkoutPlayer.tsx)` after successful insert, before `onComplete`.                                                                                                                      |
| 3        | **Complete → board refresh** | **When** `bumpTaskViews` runs from `onComplete` (increments `taskViewsNonce`): log prior/next nonce and `workoutPlayerTask.id` that completed. Ties the new `**workout_log` visibility** to [KanbanBoard `loadTasks](../../src/components/board/KanbanBoard.tsx)`(effect on`taskViewsNonce`). Catches “finished workout but card list stale” if refetch fails silently. **Location:\*\* wrap or log inside `bumpTaskViews` in the shell for workout-complete path only (e.g. optional reason flag). |

**Secondary (already partially covered):** first line inside [KanbanBoard `loadTasks](../../src/components/board/KanbanBoard.tsx)`after a successful`query`(today’s`[DEBUG]`is fetch-side only—pair with a **“applied to columns”** log when`setColumns`runs, gated by`loadGen` match) to catch stale-generation overwrites.

---

_Generated as a read-only architecture assessment; no production behavior was changed in this pass._
