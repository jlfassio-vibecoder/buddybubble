# Workout viewer + task chat: architectural assessment

This document assesses evolving the workout quick-view dialog into a **two-pane** experience (task comments on one side, workout details on the other). **No implementation** is prescribed here—only layout, data, and component boundaries for review.

---

## 0. Component inventory (source of truth)

| Item                      | Location                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Workout viewer dialog** | [`src/components/fitness/workout-viewer-dialog.tsx`](../src/components/fitness/workout-viewer-dialog.tsx)                                                                                                                                                                                                                                                                                                                                            |
| **Note**                  | There is **no** `src/components/modals/WorkoutViewerDialog.tsx`; imports use `@/components/fitness/workout-viewer-dialog`.                                                                                                                                                                                                                                                                                                                           |
| **Current consumer**      | [`src/components/modals/TaskModal.tsx`](../src/components/modals/TaskModal.tsx) renders `<WorkoutViewerDialog />` as a **sibling** under the same React fragment as the main modal shell (after the task modal `div`).                                                                                                                                                                                                                               |
| **Open triggers**         | (1) **Task modal** — `TaskModalEditorChrome` “Workout viewer” control and `useTaskWorkoutAi` auto-open when `initialOpenWorkoutViewer` is true. (2) **Kanban** — [`kanban-task-card.tsx`](../src/components/board/kanban-task-card.tsx) calls `onOpenTask(task.id, { viewMode: 'full', openWorkoutViewer: true })`, which [`dashboard-shell.tsx`](../src/components/dashboard/dashboard-shell.tsx) maps to `TaskModal` + `initialOpenWorkoutViewer`. |
| **Task comments UI**      | [`src/components/modals/task-modal/TaskModalCommentsPanel.tsx`](../src/components/modals/task-modal/TaskModalCommentsPanel.tsx) — uses [`useMessageThread`](../src/hooks/useMessageThread.ts) with `filter: { scope: 'task', taskId }`, plus `workspaceId`, `bubbles`, and posting permission passed as `canWrite` (wired as `canPostMessages` internally).                                                                                          |

---

## 1. Layout and UI assessment

### 1.1 Current layout structure

`WorkoutViewerDialog` is a **Radix `Dialog`** with a **single-column, three-row CSS grid** on `DialogPrimitive.Content`:

- **Grid**: `grid-rows-[auto_minmax(0,1fr)_auto]` — header (title + View/Edit toggle + close), **one scrollable body** (`min-h-0 overflow-y-auto`), footer (Apply/Cancel or Close).
- **Width**: `max-w-xl` (~36rem), centered (`fixed` + translate), `max-h-[min(90vh,760px)]`.
- **Body**: In **view** mode, a vertical stack: `WorkoutViewHero` (cover) → padded block with title/description → “Workout plan” (`RichWorkoutReadView` or `FlatExercisesReadView`). In **edit** mode, form fields + `WorkoutExercisesEditor`.

**Stacking context**: Overlay `z-[155]`, content `z-[160]`. The task modal uses **`z-[150]`** for its root ([`TaskModal.tsx`](../src/components/modals/TaskModal.tsx)), so the workout viewer **always stacks above** the task modal when both are open.

### 1.2 Converting to two panes without squishing workout details

**Recommended shell change** (conceptual):

1. **Widen the dialog** for `md+` (e.g. `max-w-5xl` or `max-w-6xl`) so each pane has a usable minimum width.
2. Replace the **middle grid row** (currently one scroll column) with a **horizontal split**:
   - **Outer**: `flex flex-col md:flex-row md:min-h-0` (or `grid md:grid-cols-[minmax(280px,34%)_1fr]`).
   - **Left rail (chat)**: fixed **min-width** (e.g. `min-w-[280px]`), `max-w` cap optional, `min-h-0 flex-1 md:max-w-[40%]` with its **own** `overflow-y-auto` so the workout pane does not steal scroll height from the thread.
   - **Right pane (workout)**: `min-w-0 flex-1` (or `1fr` in grid), keep existing hero + sections inside a **nested** scroll container **or** keep one outer scroll only if you accept linked scrolling (less ideal for long threads + long workouts).

**Edit mode consideration**: Today, **edit** mode replaces the entire body with the editor. Product options:

- **A (simplest)** — Chat rail **only in view mode**; switching to **Edit** collapses or hides the rail (or shows a compact “Comments” tab) to preserve editing space.
- **B** — Chat remains visible in edit mode (narrower editor); higher risk of cramped UI on smaller laptops.

Default recommendation: **A** unless product explicitly wants comments while editing structure.

### 1.3 Responsive behavior

| Breakpoint      | Suggested behavior                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **`md` and up** | Side-by-side: chat left (~32–40%), workout right (~60–68%), both independently scrollable where needed.                                                                                           |
| **Below `md`**  | **Do not** force narrow side-by-side columns. Prefer one of: **(1)** stacked layout — chat block **above** workout (full width each, chat `max-h-[40vh]` or similar); **(2)** **tabs** (“Workout” | “Comments”) in the header area; **(3)** a **sheet** or slide-over for comments triggered from a header chip. |

Tabs or stack preserve touch targets and avoid horizontal scroll. Match patterns already used elsewhere (e.g. task modal tab strip) for familiarity.

**Safe area**: Reuse existing bottom padding patterns (`env(safe-area-inset-bottom)`) on the chat composer if it sits in a fixed footer inside the dialog.

---

## 2. Data and prop gap analysis

### 2.1 What `WorkoutViewerDialog` has today

From [`WorkoutViewerDialogProps`](../src/components/fitness/workout-viewer-dialog.tsx) (abridged):

| Prop                            | Present?                                 | Chat relevance                                                                                                                           |
| ------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `taskId`                        | **Optional** (`taskId?: string \| null`) | Required for task-scoped thread **when viewing an existing card**. Used today for exercise rows / image request context, not for chat.   |
| `canWrite`                      | Yes                                      | Aligns with **posting** permission used by `TaskModalCommentsPanel` today (`canPostMessages: canWrite`).                                 |
| `workspaceId`                   | **No**                                   | **Required** by `TaskModalCommentsPanel` and `useMessageThread` (for attachments, workspace-scoped storage paths, member loads).         |
| `bubbles`                       | **No**                                   | **Required** by `TaskModalCommentsPanel` / `useMessageThread` (bubble routing, task picker for `/` mentions, default bubble for writes). |
| `onMarkedRead` / Kanban refresh | **No**                                   | Optional but desirable for parity with task modal (`user_task_views` + parent `bumpTaskViews`).                                          |

### 2.2 Where the dialog is invoked and how to thread props

**Single call site today**: `TaskModal` passes `taskId`, `canWrite`, workout fields, `onApply`, `cardCoverPath`, etc. **`TaskModal` already owns** `workspaceId` and `bubbles`\*\* (see props on `TaskModal` and usage when rendering `TaskModalCommentsPanel`).

**Threading plan (minimal drift)**:

1. Extend **`WorkoutViewerDialogProps`** with `workspaceId: string` and `bubbles: BubbleRow[]` (and optionally `onTaskCommentsMarkedRead?: () => void` for parity with [`TaskModal` → `TaskModalCommentsPanel`](../src/components/modals/TaskModal.tsx)).
2. In **`TaskModal`**, when rendering `<WorkoutViewerDialog … />`, pass through the same `workspaceId`, `bubbles`, and `onTaskCommentsMarkedRead` (or `bumpTaskViews` callback) already available to the modal.
3. **Guardrails**: If `open && !taskId` (create flow with viewer somehow open—edge case), **do not mount** the chat rail or pass `filter: 'task'` until `taskId` exists; show workout-only UI.

**Kanban → viewer path**: Still lands in `TaskModal` with a real `taskId`, so no new shell wiring is strictly required **unless** you later extract a **standalone** workout viewer opened **without** `TaskModal` (then `dashboard-shell` would need to pass `bubbles` / `workspaceId` into that new entry point).

### 2.3 Permission nuance

Dashboard passes `canWrite={canWriteTasks}` into `TaskModal`. Comments use the same flag for `canPostMessages`. If product later distinguishes **“edit task”** vs **“post in bubble/task thread”**, you may need a separate prop; today they are **collapsed** in this path—document as **known coupling**.

---

## 3. Component reusability and interaction with `TaskModal`

### 3.1 Drop-in `<TaskModalCommentsPanel />` vs extracted `<TaskChatPanel />`

**Can you drop `TaskModalCommentsPanel` directly into `WorkoutViewerDialog`?**

**Technically yes**, once `workspaceId`, `bubbles`, `taskId` (non-null), and `canWrite` are supplied. The panel is already a self-contained client component with `useMessageThread`, composer, thread drill-in, and optional `onMarkedRead`.

**Reasons you might still extract `TaskChatPanel` (or rename/slim the existing panel):**

| Concern                | Notes                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Naming / semantics** | “TaskModal\*” inside a non-modal workout viewer is confusing in imports and for future contributors.                                                                                                                                                                                                                                                                   |
| **Chrome coupling**    | `TaskModalCommentsPanel` exposes `onThreadViewChange` so **`TaskModal` can retitle** the modal header when drilling into a thread. The workout viewer has its **own** title row (“Workout card” + View/Edit). Either **wire** `onThreadViewChange` to adjust viewer chrome (subtitle / second line) or **disable** thread depth UI in this context (product decision). |
| **Layout props**       | A generic panel might accept `variant="embedded" \| "modalTab"` for density, `className` on scroll root, or `showBackToThreadChrome` flags without forking two large files.                                                                                                                                                                                            |

**Pragmatic path**:

1. **Phase 1**: Embed **`TaskModalCommentsPanel`** inside `WorkoutViewerDialog` with minimal props + `onThreadViewChange` mapped to local state (e.g. show “Replies” in header or a small banner). Fastest to validate UX.
2. **Phase 2** (optional refactor): Move shared markup + `useMessageThread` wiring into **`TaskChatPanel`**; keep **`TaskModalCommentsPanel`** as a thin wrapper for modal-specific chrome, or delete the wrapper after rename.

### 3.2 Interaction with the existing `TaskModal` (stacking and lifecycle)

**Observed behavior**:

- `WorkoutViewerDialog` is **not** a child of the task modal DOM node; it is a **second portal** after the main modal in `TaskModal`’s return fragment.
- **Higher z-index** on the workout viewer ⇒ it **sits on top** of the task modal; **the task modal stays mounted and open** underneath.
- Closing the workout viewer **only** runs `onOpenChange(false)` for the viewer; it **does not** automatically close `TaskModal` unless you add that logic.

**UX implications**:

- Users can have **Task modal (Details)** + **Workout viewer** + (after implementation) **Comments in the viewer** while the **Comments tab** of the task modal is still available underneath—potentially **two surfaces** for the same thread. Mitigations to consider later: opening the viewer could **switch** the underlying tab away from Comments, or opening Comments in the viewer could **close** the task modal (aggressive). **Default recommendation**: keep current stacking for v1; add a short **copy hint** in viewer (“Comments here match the card’s Comments tab”) if confusion appears in testing.

---

## 4. Implementation checklist (for a future PR)

- [ ] Widen dialog + two-pane layout + responsive stack/tabs.
- [ ] Pass `workspaceId`, `bubbles`, stable `taskId`, `canWrite`, optional `onMarkedRead` from `TaskModal` into `WorkoutViewerDialog`.
- [ ] Decide edit-mode behavior for chat rail (hide vs persist).
- [ ] Map `onThreadViewChange` to workout viewer header or suppress thread depth.
- [ ] Verify `z-index` still clears `TaskModal` and mobile tab bars (`TaskModal` comment in code references z-order).
- [ ] Optional later: standalone viewer entry without `TaskModal` (would duplicate prop sourcing at shell level).

---

## 5. References (code)

- Workout viewer layout and props: [`workout-viewer-dialog.tsx`](../src/components/fitness/workout-viewer-dialog.tsx) (e.g. `DialogPrimitive.Content` class around `max-w-xl`, `grid-rows-[…]`).
- Viewer mount + props from task modal: [`TaskModal.tsx`](../src/components/modals/TaskModal.tsx) (`<WorkoutViewerDialog … taskId={taskId} />`).
- Comments data contract: [`TaskModalCommentsPanel.tsx`](../src/components/modals/task-modal/TaskModalCommentsPanel.tsx), [`useMessageThread.ts`](../src/hooks/useMessageThread.ts).
