# Smart Task Modal Panels — Architectural Assessment

This document evaluates how to evolve `TaskModalCommentsPanel`, `TaskModalSubtasksPanel`, and `TaskModalActivityPanel` from presentational components (large prop surfaces from `TaskModal.tsx`) toward **autonomous** components that own interaction state and mutations, **without** breaking the existing single-row model, `applyRow` hydration, or Supabase realtime refresh.

**Current facts (codebase):**

- One `tasks` row is loaded (`select('*')`) and applied via `applyRow` in `TaskModal`, which among many fields calls `hydrateFromTaskRow` from `useTaskEmbeddedCollections` to parse JSON columns into `comments`, `subtasks`, `activityLog`, and `attachments`.
- Mutations for comments and subtasks live in `useTaskEmbeddedCollections`: **read–modify–write** on the whole JSON array (`comments`, `subtasks`), then local `setState`.
- Realtime: `useTaskLoadAndRealtime` subscribes to `UPDATE` on `tasks` for the open `taskId` and calls `loadTask` → `applyRow` again, re-hydrating embedded collections from the server.
- **Activity log is not display-only.** `activityLog` and `setActivityLog` are passed into `useTaskSaveAndCreate` / `task-modal-save-utils` (`buildActivityLogForCoreFieldChanges`), which **append** synthetic entries when core fields (title, status, schedule, etc.) are saved. The Activity **panel** only renders the array; the **save pipeline** mutates the same column. Any “smart panel” design must preserve a single coherent story for `activity_log` or explicitly split “user-visible log” vs “persisted JSON” (not recommended without a schema change).

---

## 1. Prop Drilling vs. Context

### Current pattern

`TaskModal` pulls everything from `useTaskEmbeddedCollections` and forwards a wide surface: lists, draft fields (`newComment`, `newSubtaskTitle`), `commentUserById`, handlers, `canWrite`, `taskId`, `isCreateMode`, `typeNoun`, etc. That couples the shell to collection shape and makes panels hard to reuse or test in isolation.

### Options

| Approach                                           | Pros                                                                                                                                                    | Cons                                                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Keep props, slim panels**                        | No new abstraction                                                                                                                                      | Does not meet “smart panel” goal.                                                                                                |
| **Composition-only: panel wraps an internal hook** | Panels import `useTaskComments(taskId)` etc.; parent only passes `taskId`, `canWrite`, `workspaceId` (or nothing if hook reads context).                | Parent must still trigger hydration on `applyRow` unless hook subscribes to row updates.                                         |
| **`TaskModalProvider` (React Context)**            | Single place for `taskId`, `canWrite`, `workspaceId`, `refreshTask`, optional `lastAppliedRow` ref, shared error/toast. Panels consume small selectors. | Easy to over-contextualize; needs clear split between **server snapshot** vs **local draft**; testing requires provider wrapper. |

### Recommendation

**Prefer “smart hook + thin panel” first; add Context only when it removes real duplication.**

- **Phase A:** Each panel file (or sibling `useXxxPanel.ts`) owns `useState` for drafts (`newComment`, …) and mutations, receiving **`taskId`, `canWrite`, `workspaceId`** plus a stable **`onHydrateFromRow(row)`** or **`subscribeToTaskRow`** callback from the parent **or** from a narrow `TaskModalCollectionsProvider` that only exposes identifiers + `applyRow` side effects.
- **Introduce `TaskModalProvider`** when at least two of the following are true: (1) panels need user/display data beyond ids, (2) you want to avoid threading `setError`/`setSaving` through every hook, (3) multiple siblings outside `TaskModal` must read the same task session.

If you add Context, keep it **task-scoped** (provider mounts when modal opens with `taskId`) and **split contexts** if needed (e.g. `TaskModalSessionContext` for ids + refresh, separate from unrelated UI), to avoid broad re-renders.

**Cleanest decoupling from drilling:** panels stop taking `comments` / `onPostComment`; they take **either** minimal props (`taskId`, `canWrite`) **or** one context consumer. Hydration after fetch/realtime should still funnel through **one** path (see roadmap) so `applyRow` remains the authority for replacing embedded JSON from the server.

---

## 2. Pushing Mutations Down — Safety and Races

### Can handlers move into panels?

**Yes, with constraints.** The logic in `addComment` / `addSubtask` / `toggleSubtask` is already localized; moving it to `useTaskComments` (etc.) inside or beside the panel is mechanically safe **if** the following remain true:

1. **Hydration contract:** After every successful `UPDATE`, local state matches what you would get from `asComments(row.comments)` (or you immediately refetch / merge from response). Today you optimistically `setComments(next)` after update; realtime may also refire `loadTask` — both should converge.
2. **Attachments and other JSON columns:** A comment update must **not** accidentally send stale `subtasks` or `attachments` unless the `UPDATE` payload is scoped to `{ comments: … }` only — which it already is. **Risk is concurrent writes**, not wrong column in a single handler (assuming each handler only patches its column).

### Race conditions (two writers, one row)

Two panels (or panel + save) can interleave:

1. Panel A reads JSON v1, builds v2, writes `comments`.
2. Panel B reads JSON v1 (before A’s write visible), builds v2’, writes `subtasks` — **OK** if Postgres merges at row level… but actually each `update()` sends **only one column**; the other column is untouched **unless** a stale full-row client does a multi-column update. Current code updates **one** JSON column per handler → **cross-column races are mostly avoided**.
3. **Same column:** two rapid comment posts both read `comments` v1, each appends one comment, each writes — **last write wins**; one comment can be lost.

**Mitigations (in order of pragmatism):**

- **Per-task mutation queue (mutex):** serialize all `tasks` updates for that `taskId` in the client (queue: comments, subtasks, save-core, attachments). Simple and matches “single modal” UX.
- **Optimistic UI + refetch on conflict:** after `update`, if error or optional `updated_at` mismatch, `loadTask` and reconcile (heavier).
- **Server-side:** Postgres function that appends to `jsonb` atomically, or normalized tables — correct but is a **schema / API** change, out of scope for “push down panels” only.

**Save path vs. panels:** `useTaskSaveAndCreate` already performs multi-field `update` including `activity_log`. That can still race with a comment `update` on `comments` if both hit the network unsynchronized — the **queue** should include save operations too, or save should **read latest row** (refetch) immediately before building the patch (adds latency, reduces clobber risk).

**Activity log specifically:** Do not let Activity panel own exclusive `activity_log` state while `useTaskSaveAndCreate` appends in parallel without coordination. Either:

- Keep **one module** (e.g. extended `useTaskEmbeddedCollections` or `useTaskActivityLog`) that both **save** and **Activity panel** use, with a single setter/queue, or
- Move append-only activity helpers next to save and expose **read-only** derived list to the panel via context.

---

## 3. The Role of `TaskModal.tsx` After Panels Become Autonomous

The shell should become:

1. **Orchestrator of the task session:** `open`, `taskId` / create mode, `applyRow` from `useTaskLoadAndRealtime`, dirty/save for **core scalar + metadata** fields, and **one** hydration entry that updates any remaining shared state (or notifies context).
2. **Layout and tab routing:** Hero, header copy, tab strip, which panel mounts — not the full list of comment props.
3. **Cross-cutting concerns:** `setError` / `setSaving`, `canWrite`, workspace/bubble ids passed down shallowly or via provider.
4. **Owner of “save core fields”** until that too moves to a dedicated hook — including **`activity_log` mutations driven by field diffs**, which is **not** the Activity panel’s concern today.

**Explicitly not the shell’s job (post-refactor):** per-comment draft state, comment POST handler implementation, subtask list local edits — those live with the panel or its colocated hook.

---

## 4. Refactoring Roadmap (3 Steps)

### Step 1 — Extract colocated hooks; keep a single hydration spine

- Add `useTaskCommentsPanel`, `useTaskSubtasksPanel` (names illustrative) **next to** the panel components (or under `task-modal/hooks/`). Move state for `comments` + `newComment` + `addComment` + `commentUserById` effect into the comments hook; same for subtasks.
- **`TaskModal` still owns `applyRow`:** after `hydrateFromTaskRow(row)`, either keep calling a **single** `hydrateFromTaskRow` that internally delegates, or have `applyRow` call `commentsHydrate(row)`, `subtasksHydrate(row)`, … via refs/callbacks registered by hooks — simplest is **one** `useTaskEmbeddedCollections` split internally into smaller hooks called from `TaskModal` in fixed order, **or** replace with three hooks that each expose `hydrateFromRow(row)` and `TaskModal`’s `applyRow` invokes all three.
- **Do not change** `useTaskLoadAndRealtime` contract: `loadTask` → `applyRow` → embedded JSON in sync with DB.
- **Activity:** leave read path in panel; keep `activityLog` state where `useTaskSaveAndCreate` can still read/update it (or extract `useTaskActivityLog` shared by save + `applyRow` hydration only).

**Exit criteria:** `TaskModal` JSX for Comments/Subtasks passes minimal props; behavior and realtime unchanged.

### Step 2 — Mutations and optional Context / queue

- Move Supabase `update` calls fully into the panel hooks; thread `setError`/`setSaving` via args or small context.
- Introduce a **`TaskMutationCoordinator`** (hook or module): `enqueue(() => supabase.from('tasks').update(...))` per `taskId` to eliminate same-column lost updates.
- Wire **`useTaskSaveAndCreate`** through the same coordinator (or refetch-before-save).

**Exit criteria:** No lost comments under double-submit; save + comment still consistent with realtime refetch.

### Step 3 — Panel components as thin UI shells

- Panels become mostly JSX: `const { … } = useTaskCommentsPanel(...); return (…);`
- Optionally add **`TaskModalProvider`** if prop drilling for ids/error remains noisy.
- **Documentation:** document hydration order (`applyRow` vs optimistic updates) for future contributors.

**Exit criteria:** `TaskModalActivityPanel` receives no giant objects beyond what a hook wrapper needs; activity log writes remain coordinated with save utils; `npx tsc --noEmit` and manual regression on realtime two-tab edit.

---

## Summary

| Question                        | Short answer                                                                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Context vs drilling?            | Start with **colocated smart hooks** + minimal props; add **`TaskModalProvider`** only when shared session data justifies it.                         |
| Mutations in panels?            | **Yes**, via hooks inside/near panels; use a **per-task update queue** or refetch-before-write to mitigate JSON same-column races.                    |
| `TaskModal` role?               | **Session orchestration**, `applyRow` / realtime, core-field save + **activity_log append**, layout/tabs — not comment/subtask mechanics.             |
| Don’t break hydration/realtime? | **Step 1** preserves `applyRow` → row hydration; **Step 2** hardens writes; **Step 3** thins UI. Respect **activity_log** shared ownership with save. |

No component implementation is prescribed here; this is the structural roadmap for a safe transition.
