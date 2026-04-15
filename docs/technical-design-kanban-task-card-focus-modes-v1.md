# Technical design: Kanban task card focus modes — v1

## 1. Problem

On the main Kanban board, task cards expose **quick actions** (play for workouts, a **message** icon for discussion) and a **clickable body** that opens `TaskModal`. Today:

- The **comment** affordance calls `onOpenTask(taskId, { tab: 'comments' })`, which opens the same **`TaskModal` shell** used for editing.
- Inside `TaskModal`, **large “editor chrome” regions** (type selector, visibility, workout player triggers, and related controls) render **above** the tabbed content for every tab, including **Comments**.
- Users who intend to **only discuss** the card still see a form-like inspector first. That **breaks the mental model** (“I tapped comments, not edit”).

Separately, there is **no dedicated Edit control** on the card header row next to Play / Comments. Editing is implied by clicking the card title area, which is easy to miss and does not parallel the other explicit icons.

## 2. Goals (phase 1 — edit vs comments)

| Goal                             | Description                                                                                                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Explicit actions**             | On `KanbanTaskCard`, show three distinct affordances where applicable: **Play** (workout types), **Edit** (pencil → full inspector), **Comments** (thread → focused discussion).                                                                       |
| **Comments focus mode**          | When opening from the **Comments** icon, `TaskModal` enters a **focus mode** that **hides non-conversational chrome** (type, visibility, workout player strip in the header stack) so the dialog reads as a **discussion panel**, not a database form. |
| **Reuse `TaskModal`**            | Avoid new data APIs or a separate comments micro-app in v1; keep one modal host and one Supabase subscription path per open task.                                                                                                                      |
| **Backward compatible defaults** | Any caller that omits `viewMode` behaves as today: **full chrome**, default tab **Details** unless `initialTab` is set.                                                                                                                                |

## 3. Non-goals (v1)

- Replacing `TaskModal` with a standalone comments sheet/drawer (that remains a valid **phase 2+** option if focus modes become unwieldy).
- **New tables or RPCs** for comments.
- Changing **micro-density** card layouts beyond what is required to keep behavior consistent (see §7.2).
- **Storefront** or **chat embed** flows (they may adopt the same `OpenTaskOptions` later; not required for phase 1).

## 4. Definitions

| Term                  | Meaning                                                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Editor chrome**     | The blocks in `TaskModal` that primarily support **authoring / policy**: `ItemTypeSelector`, visibility controls, “Workout viewer” shortcut, `WorkoutPlayerTriggers`, and similar **non-tab** sections above the scrollable tab body. |
| **Focus mode**        | A `TaskModal` presentation flag that **suppresses** part of the UI so the user’s intent (e.g. comments-only) matches what they see first.                                                                                             |
| **`OpenTaskOptions`** | The optional second argument to `onOpenTask(taskId, opts?)` used by the board, shell, and (eventually) other surfaces.                                                                                                                |

## 5. Product behavior

### 5.1 Kanban card actions (full / detailed density)

| Control           | When shown                                                              | Action                                                                        |
| ----------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Play**          | `onStartWorkout` provided and `item_type` is `workout` or `workout_log` | Start workout player (existing).                                              |
| **Edit (pencil)** | `onOpenTask` defined                                                    | `onOpenTask(task.id, { tab: 'details', viewMode: 'full' })` (exact shape §6). |
| **Comments**      | `onOpenTask` defined                                                    | `onOpenTask(task.id, { tab: 'comments', viewMode: 'comments-only' })`.        |

**Card body click** (title / main hit target): continues to open the modal in **`viewMode: 'full'`** with **`tab: 'details'`** (same as today’s default path), so muscle memory is preserved.

### 5.2 What the user sees in `viewMode: 'comments-only'`

- Keep **`TaskModalHero`** (read-only title / description / cover) so context is not lost.
- **Hide** editor chrome blocks listed in §4 for the lifetime of that modal open.
- **Comments tab** is selected; the **thread + composer** occupy the primary scroll region without type/visibility clutter above.
- **Bottom tab strip** remains visible so the user may **self-escalate** to Details, Subtasks, or Activity without closing the modal (optional product tweak: default-hide tab strip in v2 if user testing shows confusion).

### 5.3 Edge cases

| Case                                   | Behavior                                                                                                                                                                                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Create mode** (`taskId === null`)    | `viewMode` **does not apply**; modal stays full create flow.                                                                                                                                                                                                                            |
| **Read-only member**                   | Comments-only mode still applies; composer already gated by `canWrite`.                                                                                                                                                                                                                 |
| **Open from notification / deep link** | Shell may pass `{ tab: 'comments', viewMode: 'comments-only' }` for parity with the card icon (already similar intent in `dashboard-shell.tsx` for comment alerts).                                                                                                                     |
| **User switches tab inside modal**     | When user selects **Details** from the tab strip while `viewMode === 'comments-only'`, either **(A)** auto-elevate to `viewMode: 'full'`, or **(B)** keep chrome hidden until close. **Recommendation for v1:** **(A)** — treat tab strip as explicit intent to use the full inspector. |

## 6. API and state design

### 6.1 Extended `onOpenTask` options

Extend the optional payload:

```ts
export type TaskModalViewMode = 'full' | 'comments-only';
// Future: 'subtasks-only' | 'activity-only' | 'player-first' | ...

export type OpenTaskOptions = {
  tab?: TaskModalTab;
  /** Controls TaskModal chrome density. Default: 'full'. */
  viewMode?: TaskModalViewMode;
};
```

- **`viewMode` omitted** → treat as **`'full'`**.
- **`viewMode: 'comments-only'`** should always pair with **`tab: 'comments'`** from card callers; if a caller sets comments-only without a tab, **normalize** to `tab: 'comments'` in the shell or modal bootstrap.

`TaskModal` gains a prop, e.g. **`initialViewMode?: TaskModalViewMode | null`**, set once when the modal opens (mirror pattern used for `initialTab`).

**Naming note:** `comments-only` describes **chrome**, not permissions — the user can still post comments when `canWrite` is true, and the bottom tab strip can remain visible (§5.2).

### 6.2 Shell state (`DashboardShell`)

- Add `taskModalViewMode` state alongside `taskModalInitialTab`.
- `openTaskModal(id, opts)` sets:
  - `taskModalInitialTab` from `opts?.tab ?? null` (existing),
  - `taskModalViewMode` from `opts?.viewMode ?? 'full'` (new).
- Reset `taskModalViewMode` when the modal closes (same place `taskModalInitialTab` is cleared).
- Pass **`initialViewMode={taskModalViewMode}`** into `TaskModal`.

### 6.3 `TaskModal` implementation notes

- Derive `const showEditorChrome = Boolean(taskId) && viewMode === 'full'` — **never** hide chrome in create mode.
- Wrap **Type**, **Visibility**, and **Workout player triggers** (the blocks currently always rendered for existing tasks above the tab panel) in `showEditorChrome`.
- **Do not** hide the modal title row / close button / error banners.
- On tab change: if `viewMode === 'comments-only'` and user selects **`details`**, set view mode to **`full`** (§5.3).
- `useEffect` syncing: when `[open, taskId, initialViewMode]` changes, reset internal view mode from props (same open/close semantics as `initialTab`).

## 7. Roadmap: focus modes beyond phase 1

Phase 1 proves the pattern: **one modal**, **`initialTab` + `initialViewMode`**, conditional chrome.

| Future focus     | Likely tab                                    | Chrome strategy                                                                                                 |
| ---------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Subtasks**     | `subtasks`                                    | Hide type/visibility/workout strip; optionally hide hero if too tall on mobile.                                 |
| **Activity**     | `activity`                                    | Same as subtasks.                                                                                               |
| **Player-first** | `details` or dedicated sheet                  | Show workout triggers **only**; hide unrelated metadata; may overlap with `WorkoutPlayer` route — decide later. |
| **Attachments**  | `details` (attachments live in Details today) | Scroll-to / future `tab: 'attachments'` if split.                                                               |

**Micro-density cards** already render text tabs (`Details`, `Comments`, …). Those should pass the same **`viewMode`** as the icon row so behavior is consistent (e.g. Comments pill → `comments-only`).

**Chat feed task card** (`ChatFeedTaskCard`) should eventually accept the extended options so thread UIs can open “comments-only” without duplicating logic.

## 8. Files touched (implementation checklist)

| Area           | File(s)                                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Card UI        | `src/components/board/kanban-task-card.tsx` — import `Pencil`; wire three buttons; pass `viewMode`.                                                               |
| Board plumbing | `src/components/board/KanbanBoard.tsx` — ensure `onOpenTask` type widens if defined locally.                                                                      |
| Shell          | `src/components/dashboard/dashboard-shell.tsx` — state + `TaskModal` props.                                                                                       |
| Modal          | `src/components/modals/TaskModal.tsx` — `initialViewMode`, conditional chrome, tab-to-full escalation.                                                            |
| Types          | Centralize `OpenTaskOptions` / `TaskModalViewMode` if duplicated (e.g. export from `TaskModal` or a tiny `task-modal-open.ts` module).                            |
| Other callers  | Grep `onOpenTask(` and update signatures (`ChatFeedTaskCard`, `ThreadPanel`, `ProgramsBoard`, etc.) — **optional** for v1 if options stay optional with defaults. |

## 9. Testing

| Scenario                                   | Expected                                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Click **Comments** icon                    | Modal opens, **Comments** tab, **`comments-only`** — **no** type/visibility/workout triggers above content. |
| Click **Edit** icon                        | Modal opens, **Details** tab, **full** chrome.                                                              |
| Click **card body**                        | Same as Edit (full + details).                                                                              |
| From comments focus, click **Details** tab | Chrome **reappears** (per §5.3 recommendation A).                                                           |
| Workout card: **Play**                     | Still starts player without opening modal.                                                                  |
| Close and reopen                           | View mode resets; no stale `comments-only` on next open.                                                    |

## 10. Risks and mitigations

| Risk                                    | Mitigation                                                                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hidden controls** confuse power users | Keep tab strip; document in release notes; consider a “Card settings” link later.                                                             |
| **Duplicate Play** (card vs modal)      | Acceptable; player on card is faster; modal triggers remain for discoverability inside full mode.                                             |
| **Large `TaskModal` file**              | Focus conditionals are a few wrappers; if the file grows further, extract “chrome sections” into subcomponents **without** changing behavior. |

## 11. Summary

Phase 1 aligns **user intent** with **UI chrome** by introducing **`viewMode`** (`full` vs `comments-only`) on the existing `TaskModal`, and restores parity among quick actions by adding an **Edit** button on the Kanban card. The same **`OpenTaskOptions`** pattern scales to **subtasks**, **activity**, and other card-driven entry points without committing to a second comments surface yet.
