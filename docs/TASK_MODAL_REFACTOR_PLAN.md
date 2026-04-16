# TaskModal refactor roadmap (Phase 3)

This document analyzes [`src/components/modals/TaskModal.tsx`](src/components/modals/TaskModal.tsx) (~2,790 lines) and proposes how to split it into smaller files **without changing business logic** or the **`viewMode` / tab focus** behavior introduced for Card surfaces.

---

## 1. Component boundary analysis

### 1.1 Already extracted (keep as imports)

| Piece                | Location                                                                                                  | Role                               |
| -------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Hero / cover preview | [`task-modal-hero.tsx`](src/components/modals/task-modal-hero.tsx), `TaskCardCoverModalPreview` (in-file) | Read-only hero; signed URL preview |
| Type picker UI       | [`item-type-selector.tsx`](src/components/board/item-type-selector.tsx)                                   | Segmented `item_type` control      |
| Exercise grid        | [`workout-exercises-editor.tsx`](src/components/fitness/workout-exercises-editor.tsx)                     | Workout / workout_log body         |
| Workout viewer       | [`workout-viewer-dialog.tsx`](src/components/fitness/workout-viewer-dialog.tsx)                           | Apply-from-viewer flow             |
| Player triggers      | [`WorkoutPlayer.tsx`](src/components/fitness/WorkoutPlayer.tsx) (`WorkoutPlayerTriggers`)                 | Visibility strip actions           |

These stay imported; the refactor **moves JSX orchestration and local glue** out of the monolith.

### 1.2 Top-level helpers today (easy first moves)

| Block                        | Lines (approx) | Extract target                                                                                                                              |
| ---------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `TaskAttachmentImagePreview` | ~L117–143      | [`task-modal-attachment-thumb.tsx`](src/components/modals/task-modal/task-modal-attachment-thumb.tsx) or `task-modal-media.tsx`             |
| `TaskCardCoverModalPreview`  | ~L146–163      | Same media module                                                                                                                           |
| `formatActivityLine`         | ~L2782–2789    | [`task-modal-activity-utils.ts`](src/components/modals/task-modal/task-modal-activity-utils.ts) (pure functions; used by Activity tab only) |

### 1.3 Tab bodies (high value, low coupling to `saveCoreFields`)

| Tab          | Approx region                    | Suggested file               | Depends on                                                                                                                           |
| ------------ | -------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Comments** | `tab === 'comments'` ~L2601–2673 | `TaskModalCommentsPanel.tsx` | `comments`, `commentUserById`, `newComment`, `setNewComment`, `addComment`, `canWrite`, `taskId`, `isCreateMode`, `typeNoun`         |
| **Subtasks** | `tab === 'subtasks'` ~L2676–2721 | `TaskModalSubtasksPanel.tsx` | `subtasks`, `toggleSubtask`, `newSubtaskTitle`, `setNewSubtaskTitle`, `addSubtask`, `canWrite`, `taskId`, `isCreateMode`, `typeNoun` |
| **Activity** | `tab === 'activity'` ~L2724–2740 | `TaskModalActivityPanel.tsx` | `activityLog` (read-only list); import `formatActivityLine` from utils                                                               |

**Safety:** These panels do **not** call `saveCoreFields` directly; they invoke small async helpers already defined on the parent. Extraction is **presentational + wiring**—pass `onPostComment`, `onAddSubtask`, etc., as stable `useCallback` props from `TaskModal`.

### 1.4 “Editor chrome” block (tied to `viewMode`)

| Region                                   | Approx region                       | Suggested file              | Notes                                                                                                                                           |
| ---------------------------------------- | ----------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Type + Visibility + workout viewer entry | `showEditorChrome` true ~L1873–1947 | `TaskModalEditorChrome.tsx` | Wraps `ItemTypeSelector`, private/public toggles, optional `WorkoutPlayerTriggers`. **Must only render when parent passes `showEditorChrome`.** |

### 1.5 Details tab — large sub-blocks (extract in sub-phases)

Inside `tab === 'details'` (~L1963–2598), natural seams:

| Sub-block                     | Content                                                                                                                  | Suggested file                                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core text                     | Title, description                                                                                                       | `TaskModalDetailsCoreFields.tsx`                                                                                                                                                                |
| Card cover                    | Board/chat cover copy, `TaskCardCoverModalPreview`, AI generate, upload/remove, preset UI                                | `TaskModalCardCoverSection.tsx`                                                                                                                                                                 |
| Type-specific metadata        | `event` / `experience` / `idea` / `memory` conditional sections (each already visually grouped with `rounded-lg border`) | `TaskModalEventFields.tsx`, `TaskModalExperienceFields.tsx`, `TaskModalMemoryFields.tsx` (or one `TaskModalItemMetadataSections.tsx` with `switch (itemType)` internally to avoid 8 tiny files) |
| Workout / log                 | AI button, template picker, duration/type inputs, `WorkoutExercisesEditor`                                               | `TaskModalWorkoutFields.tsx`                                                                                                                                                                    |
| Program                       | Personalize AI, goal, weeks, schedule readout                                                                            | `TaskModalProgramFields.tsx`                                                                                                                                                                    |
| Scheduling & core task fields | Status, priority, assignee, `scheduled_on` / `scheduled_time` (non-experience)                                           | `TaskModalSchedulingSection.tsx`                                                                                                                                                                |
| Attachments list + upload     | ~L2498–2547                                                                                                              | `TaskModalAttachmentsSection.tsx`                                                                                                                                                               |
| Primary actions + archive     | Save / Create, archive panel                                                                                             | `TaskModalDetailsFooterActions.tsx`                                                                                                                                                             |

**Program / workout AI:** `handleAiGenerateWorkout`, `handlePersonalizeProgram`, `applyWorkoutTemplate`, `viewerWorkoutSet`, `handleWorkoutViewerApply` stay in **`TaskModal`** (or a **`useTaskModalWorkoutProgramActions.ts`** hook colocated in `task-modal/`) so Supabase + toast + `loadTask` sequencing does not fragment. Presentational children receive **`onGenerate`**, **`aiWorkoutGenerating`**, **`aiProgramPersonalizing`**, etc.

### 1.6 Orchestration that should stay centralized (initially)

Keep in the shell `TaskModal.tsx` (or a single `useTaskModalController.ts`):

- `loadTask`, `applyRow`, `originalRef`, `coreDirty`, `metadataForSave`
- `saveCoreFields`, `createTask`, `archiveTask`
- `addComment`, `addSubtask`, `toggleSubtask`, `uploadAttachment`, `removeAttachment`, `uploadCardCover`, `generateCardCoverWithAi`, …
- Tab / modal open effects (`initialTab`, `initialViewMode`, `initialAutoEdit`, presence `updateFocus`)
- Realtime `postgres_changes` subscription for the open task (~L972–992)

Extracting these into a hook **after** UI panels move reduces risk: first PRs are **JSX moves**, not persistence moves.

### 1.7 Footer tab strip

The bottom **`role="tablist"`** (~L2747–2760) with `tabBtn` + `BubblyButton` is small but duplicated conceptually with `CardTabStrip` on cards. **Optional later:** reuse or mirror styling; not required for Phase 3 core.

---

## 2. State management strategy

### 2.1 Current state (representative groups)

| Group                      | Examples                                                                                                                         | Mutated by                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Shell / navigation         | `tab`, `viewMode`, `loading`, `saving`, `archiving`, `error`                                                                     | Effects, `selectTab`, saves             |
| Core task row              | `title`, `description`, `status`, `priority`, `scheduledOn`, `scheduledTime`, `itemType`, `visibility`, `assignedTo`, `metadata` | `applyRow`, inputs, saves               |
| Type-specific form mirrors | `eventLocation`, `workoutExercises`, `programSchedule`, …                                                                        | `metadataFieldsFromParsed` / user input |
| Lists                      | `comments`, `subtasks`, `activityLog`, `attachments`                                                                             | CRUD helpers + `saveCoreFields` merge   |
| Workout / program UI       | `workoutViewerOpen`, `templatePickerOpen`, `aiWorkoutGenerating`, …                                                              | AI flows, viewer                        |

**Single source of truth remains React `useState` in the parent** until a deliberate later refactor (e.g. `useReducer` for the details form).

### 2.2 Prop contract for extracted panels (recommended)

Use **grouped props** to avoid 30-argument components:

```typescript
// Example shape — not implementation
type TaskModalCommentsPanelProps = {
  comments: TaskComment[];
  commentUserById: Record<string, { displayName: string; avatarUrl: string | null }>;
  newComment: string;
  onNewCommentChange: (v: string) => void;
  onPostComment: () => void | Promise<void>;
  canWrite: boolean;
  taskId: string | null;
  isCreateMode: boolean;
  typeNoun: string;
};
```

**Rule of thumb:** If a child needs **more than ~12 scalar props**, split props into 2–3 objects (`listProps`, `actions`, `labels`) or extract a **hook** that returns handlers while state stays in parent.

### 2.3 When to introduce `TaskModalProvider` (React Context)

| Approach                                          | Use when                                                                                                                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plain props**                                   | Tab panels (Comments / Subtasks / Activity); `TaskModalEditorChrome` with one grouped `chrome` object                                                            |
| **Localized Context** (`TaskModalDetailsContext`) | If `TaskModalDetailsTab` is split into **4+ nested** components that all need the same 20 fields—**defer** until after first extractions show real drilling pain |
| **Zustand / global store**                        | **Not recommended** for this refactor; conflicts with current “modal owns ephemeral state” model                                                                 |

**Recommendation:** Start with **props + grouped interfaces**; add **`TaskModalShellContext`** only if a follow-up PR introduces deep nesting under Details (e.g. nested accordions) and duplication becomes worse than context overhead.

### 2.4 Types and public API

Keep **`TaskModalTab`**, **`TaskModalViewMode`**, **`OpenTaskOptions`** exported from **`TaskModal.tsx`** (re-export from [`task-modal-types.ts`](src/components/modals/task-modal/task-modal-types.ts) if you move them) so **`KanbanTaskCard`**, **`ChatFeedTaskCard`**, **`dashboard-shell`** imports stay stable (or update imports once in a dedicated “types-only” micro-PR).

---

## 3. Phased execution steps (PR-sized)

Each step should be **reviewable in isolation**, with `npx tsc --noEmit` green and manual smoke on **full** vs **comments-only** open paths.

### Step 1 — Utilities and dumb previews (low risk)

- Move `formatActivityLine` to `task-modal-activity-utils.ts`.
- Move `TaskAttachmentImagePreview` and `TaskCardCoverModalPreview` to `task-modal-media.tsx` (or split).
- **No** `viewMode` changes.

### Step 2 — Comments, Subtasks, Activity panels

- Add `TaskModalCommentsPanel`, `TaskModalSubtasksPanel`, `TaskModalActivityPanel` under `src/components/modals/task-modal/`.
- Replace inline JSX in `TaskModal` with these components; pass grouped props and parent `useCallback` handlers.
- **Verify:** `comments-only` mode still shows Comments content; switching tabs still promotes `viewMode` to `full` when leaving Comments (`selectTab` unchanged in parent).

### Step 3 — Editor chrome extraction

- Add `TaskModalEditorChrome.tsx` rendering the block gated by `showEditorChrome` (parent computes `showEditorChrome` and passes boolean + all needed state/setters for type, visibility, workout triggers).
- **Verify:** Open from Kanban “Comments” with `comments-only` — Type and Visibility sections **hidden**; open Details tab — chrome **reappears**.

### Step 4 — Details tab: attachments + cover + scheduling band

- Extract `TaskModalAttachmentsSection`, `TaskModalCardCoverSection`, `TaskModalSchedulingSection` (status / priority / assignee / dates).
- Leave workout/program/event/memory **inline** one more step, or move **memory/event/experience** first (smallest).

### Step 5 — Workout + program + remaining metadata + optional `useTaskModalController` hook

- Extract `TaskModalWorkoutFields` and `TaskModalProgramFields` (receive AI flags + handlers from parent).
- Optionally collapse persistence into `useTaskModalController.ts` **only after** JSX is split, to keep “logic move” PRs separate from “markup move” PRs.

---

## 4. Focus mode preservation (`full` vs `comments-only`)

### 4.1 Current behavior (must not regress)

| Mechanism          | Location (today)                                                   | Contract                                                                                  |
| ------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `viewMode` state   | `useState<TaskModalViewMode>('full')` ~L244                        | Parent owns                                                                               |
| `showEditorChrome` | `!taskId \|\| viewMode === 'full'` ~L1815                          | Hides Type, Visibility, workout strip for existing tasks in comments-only                 |
| `selectTab`        | ~L967–969                                                          | When user leaves Comments tab while in `comments-only`, `setViewMode` returns to `'full'` |
| Initial sync       | `useEffect` on `open` / `initialViewMode` / `initialTab` ~L952–965 | `comments-only` + null tab forces Comments                                                |

### 4.2 Rules for extracted components

1. **`showEditorChrome` is computed only in `TaskModal`** (or in a tiny `useTaskModalChromeVisibility.ts` colocated hook that takes `{ taskId, viewMode }` and returns the boolean). **Do not** duplicate this condition inside `TaskModalEditorChrome` without the parent’s explicit prop (`showChrome: boolean`).
2. **`TaskModalEditorChrome`** must render **nothing** (or `null`) when `showChrome === false`; it must not mount hidden-off-DOM interactive controls that still capture focus.
3. **Tab strip and `selectTab`** stay in the parent until a late optional cleanup, so **all tab / viewMode invariants** live in one file through Step 3–4.
4. **Create mode** (`!taskId`): today `showEditorChrome` is true whenever there is no `taskId`; extracted chrome must respect the same rule (pass `showEditorChrome` from parent, do not re-derive from `viewMode` alone in child).

### 4.3 Regression checklist (manual)

- Open task from **`CardTabStrip`** “Comments” → modal **`comments-only`**, no Type/Visibility.
- Switch to “Details” → chrome visible, `viewMode` full.
- Switch back to Comments → may stay full (current `selectTab` only forces full when **leaving** comments in comments-only); confirm product expectation unchanged.
- Create new card → full chrome, all tabs behave as today.

---

## 5. Target directory layout (after full refactor)

```text
src/components/modals/
  TaskModal.tsx                    # thin shell: state + persistence + composition
  task-modal-hero.tsx              # existing
  task-modal/
    index.ts                       # optional barrel re-exports
    task-modal-types.ts            # Tab / ViewMode / OpenTaskOptions (if moved)
    task-modal-activity-utils.ts
    task-modal-media.tsx           # attachment thumb + cover preview
    TaskModalEditorChrome.tsx
    TaskModalCommentsPanel.tsx
    TaskModalSubtasksPanel.tsx
    TaskModalActivityPanel.tsx
    TaskModalDetailsCoreFields.tsx
    TaskModalCardCoverSection.tsx
    TaskModalSchedulingSection.tsx
    TaskModalAttachmentsSection.tsx
    TaskModalWorkoutFields.tsx
    TaskModalProgramFields.tsx
    TaskModalItemMetadataSections.tsx   # event / experience / idea / memory
    useTaskModalController.ts      # optional final step: load/save/AI/archive
```

**Barrel file:** optional; avoid if the team prefers direct imports for tree-shaking clarity.

---

## 6. Out of scope for Phase 3 doc (later work)

- Changing **`OpenTaskOptions`** or **`CardTabStrip`** contracts.
- Moving persistence to **server actions** or **React Query** (different initiative).
- Merging **`WorkoutViewerDialog`** into a tab (UX change).

---

## 7. Summary

Split **`TaskModal.tsx`** by **vertical slices** (tab panels → editor chrome → details sections → workout/program) while **keeping all mutations and `loadTask` in the parent** until the tree is stable. Use **grouped props** for each extracted file; add **context only if** prop drilling becomes unmanageable after Step 4–5. Preserve **`viewMode` / `showEditorChrome` / `selectTab`** semantics by centralizing visibility logic in the shell and passing an explicit **`showChrome`** flag into **`TaskModalEditorChrome`**.
