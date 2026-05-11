# ADR: Custom Live Workout Builder (inline exercise injection)

Status: **Proposed** — direct blueprint for implementation.
Scope: **Pre-Live** ([`PreJoinBuilder.tsx`](../../../src/features/live-video/shells/huddle/PreJoinBuilder.tsx)) and **Active Live** ([`LiveSessionView.tsx`](../../../src/features/live-video/shells/huddle/LiveSessionView.tsx)) host shells. Class Builder may follow later under the same contract; not covered here.

Companion docs: [Unified workout builder layout](./unified-builder-layout.md), [Workout builder README](./README.md).

---

## 1. Overview & goal

**Goal:** Let the host **search [`exercise_dictionary`](../../../supabase/migrations/20260617130000_create_exercise_dictionary.sql) inline** from the live workout deck and **inject rich exercises** (instructions, form cues, equipment, media, injury tips) directly into the **active deck card’s** `WorkoutExercise[]` — without leaving the live shell to open the global Kanban or the Task modal.

This **applies to both** the **Pre-Live Builder** and the **Active Live Builder**, sharing one component and one persistence path. The Class Builder may opt in later by mounting the same component above its `LiveSessionWorkoutPlayer` slot.

Non-goals (this ADR):

- New tables, new RPCs, or any change to `live_session_deck_items` columns.
- Replacing the existing **+ Add from Board** Kanban pick flow (it stays as the way to import existing **Workout cards**).
- Mobile sheet refactors of the workout editor.

---

## 2. Selector strategy: reuse the chat `#` autocomplete

The chat composer already searches `exercise_dictionary` via:

- Hook: [`useExerciseDictionaryAutocomplete`](../../../src/hooks/useExerciseDictionaryAutocomplete.ts) — returns `{ id, name, slug, status }` rows scoped by RLS, deduped + cached.
- Cache: [`exercise-dictionary-autocomplete-cache.ts`](../../../src/lib/exercise-dictionary-autocomplete-cache.ts) — 5-minute TTL, in-flight coalescing, per-user invalidation on `SIGNED_OUT`.

We **adapt** (not fork) this hook for the live builder selector. The selector UI is a **typeahead command popover** (e.g. shadcn `Command` / `Popover`) with **multi-select** support so the host can stage several exercises before injecting.

### Why adapt and not duplicate

- One source of truth for RLS, caching, and refresh semantics.
- Cheap list payload (`id, name, slug, status`) is correct for the selector grid; we **only fetch the rich payload on confirm** to avoid pulling JSON-heavy `instructions`/`biomechanics` on every keystroke.

### Lightweight → rich data mapping

On **confirm** (host clicks **Add to deck**):

1. The selector returns the chosen `ExerciseDictionaryAutocompleteRow[]` (id + name).
2. We call **[`rpcExerciseDictionaryLookupByNames`](../../../src/lib/workout-factory/exercise-dictionary-bridge.ts)** (RPC `exercise_dictionary_lookup_by_names`, granted to `authenticated` in [`20260813120200_grant_exercise_dictionary_lookup_authenticated.sql`](../../../supabase/migrations/20260813120200_grant_exercise_dictionary_lookup_authenticated.sql)) to fetch full `ExerciseDictionaryRow`s for the picked names.
3. We map each row to a [`WorkoutExercise`](../../../src/lib/item-metadata.ts) using the existing helpers in [`exercise-dictionary-bridge.ts`](../../../src/lib/workout-factory/exercise-dictionary-bridge.ts):
   - `dictionaryRowToEnrichedExercise(row, order, name)` → `KanbanEnrichedExercise` (`detailed_instructions`, `biomechanical_cues`, `injury_prevention_tips`).
   - Then a thin shim (mirror of [`mergeKanbanExtractEnrichToTaskExercises`](../../../src/lib/workout-factory/map-kanban-extract-to-workout.ts)) yields a `WorkoutExercise` with `name`, optional default prescription fields blank, plus `instructions`, `form_cues`, `injury_prevention_tips`, `equipment` (when present in `biomechanics`/dictionary metadata), and `thumbnail_url` (when `media` resolves a URL).
4. The host can edit prescription (sets/reps/weight/RPE/duration) inline before or after injection in the existing [`WorkoutExercisesEditor`](../../../src/components/fitness/workout-exercises-editor.tsx) — this ADR does not change that editor’s API.

### Component placement

A new reusable client component (suggested name): **`LiveDeckExerciseInjector`** under `src/features/live-video/shells/huddle/` (alongside `LiveSessionWorkoutPlayer.tsx`). Both `PreJoinBuilder` and `LiveSessionView`:

- Render it adjacent to the existing **+ Add from Board** affordance, e.g. as a sibling “**+ Add custom**” button that opens the popover.
- Pass through `canWrite` and (for Option B fallback) the `workspaceId` + Supabase client already in scope.

If atomic primitives are missing (e.g. a `MultiSelectCommand`), introduce them once in `src/components/ui/` rather than inlining ad-hoc — production gold standard outweighs strict reuse.

---

## 3. Workflow: Option A — ephemeral mutation on `activeSnapshot`

This matches how [`LiveSessionWorkoutPlayer.tsx`](../../../src/features/live-video/shells/huddle/LiveSessionWorkoutPlayer.tsx) already mutates exercises today, so we inherit dirty tracking and overlay persistence for free.

### Sequence

```mermaid
sequenceDiagram
  participant Host
  participant Injector as LiveDeckExerciseInjector
  participant Auto as useExerciseDictionaryAutocomplete
  participant RPC as rpcExerciseDictionaryLookupByNames
  participant Map as dictionary -> WorkoutExercise
  participant Ctx as WorkoutDeckSelectionProvider
  participant DB as live_session_deck_items.session_task_metadata

  Host->>Injector: + Add custom
  Injector->>Auto: typeahead query (id, name, slug, status)
  Host->>Injector: confirm N selections
  Injector->>RPC: lookup_by_names(names)
  RPC-->>Injector: ExerciseDictionaryRow[]
  Injector->>Map: rows -> WorkoutExercise[]
  Injector->>Ctx: append onto activeSnapshot.workoutExercises
  Ctx->>Ctx: mergeWorkoutExercisesIntoTaskMetadata + updateSnapshotTask
  Note over Ctx: snapshot.dirty = true vs baselineMetadata
  Host->>Ctx: (optional) Apply to session only
  Ctx->>DB: update session_task_metadata
```

### State path (must use existing helpers)

- Read current exercises: `metadataFieldsFromParsed(activeSnapshot.task.metadata).workoutExercises` (same as `LiveSessionWorkoutPlayer`).
- Append: `next = [...existing, ...mappedFromDictionary]`.
- Apply to snapshot via the **single** mutation contract:
  ```ts
  const nextMeta = mergeWorkoutExercisesIntoTaskMetadata(activeSnapshot.task, next);
  ctx.updateSnapshotTask(activeSnapshot.snapshotId, { ...activeSnapshot.task, metadata: nextMeta });
  ```
  Defined in [`session-deck-snapshot.ts`](../../../src/features/live-video/shells/huddle/session-deck-snapshot.ts) and [`workout-deck-selection-context.tsx`](../../../src/features/live-video/shells/huddle/workout-deck-selection-context.tsx).
- Persistence:
  - **Default:** mark snapshot dirty; user clicks the existing **Apply to session only** in `LiveSessionWorkoutPlayer` to push **`session_task_metadata`** to the deck row (RPC: simple `update` on [`live_session_deck_items`](../../../supabase/migrations/20260624120000_live_session_deck_and_task_assignees.sql)).
  - **Optional auto-persist** (product call): immediately call `ctx.acceptSnapshotSessionOnly(activeSnapshot.snapshotId)` after a successful inject for a one-tap UX. Do **not** call `updateOriginalTask` / `insertTaskClone` from this path — those mutate global `tasks` rows and are explicit user actions in the player.

### Invariants preserved

- Original `tasks.metadata` is **not** rewritten. The deck card mutation lives entirely in `session_task_metadata`.
- Sidebar `selectedBubbleId` is untouched (no Kanban override needed for the selector).
- `WorkoutDeckSelectionProvider` `isSelectingFromBoard` stays **false** — this flow is independent of the “+ Add from Board” Kanban pick mode and must not toggle the embedded Workouts board.
- Active Agora session and `WorkoutDeckSelectionProvider` are unaffected (no remount triggers).

### Edge rules

- Disable **+ Add custom** when `activeSnapshot` exists but `activeSnapshot.task.item_type` is not `workout` / `workout_log` (mirror existing `LiveSessionWorkoutPlayer` guard); show the same neutral helper text.
- Multi-select cap (suggested 25 per inject) to keep the metadata blob bounded; show a soft-limit toast.
- After inject, optionally focus the newest exercise row in `WorkoutExercisesEditor` (use existing `autoEditFirstRow` semantic if/when extended).

---

## 4. Empty-deck handling: Option B fallback (one-shot task seed)

When the host opens the injector with **no `activeSnapshot`** (empty deck), Option A has nothing to mutate. We apply the smallest possible Option B — a single seed task — so the rest of the system keeps its **“every deck row has a `task_id`”** invariant ([`workout-deck-selection-context.tsx`](../../../src/features/live-video/shells/huddle/workout-deck-selection-context.tsx) `addTaskToDeck` ~335–375).

### Sequence

1. Resolve the **Workouts** bubble id for the active workspace (same lookup pattern as [`ClassEditorWorkoutPicker.tsx`](../../../src/components/modals/class-modal/ClassEditorWorkoutPicker.tsx) or `dashboard-shell.tsx` `workoutsBubbleForLiveDeck`). If missing, surface the existing toast (“Add a ‘Workouts’ channel…”) and abort.
2. Insert a minimal `tasks` row:
   - `bubble_id = workoutsBubble.id`
   - `item_type = 'workout'`
   - `title = 'Custom workout'` (suffix with timestamp or session label as needed)
   - `status = first board column slug` (reuse `resolveFirstBoardColumnSlug` already used by [`storefront-trial-workout-task.ts`](../../../src/lib/storefront-trial-workout-task.ts))
   - `metadata = { workout_type: 'strength', exercises: [] }` cast to `Json`
   - `visibility`, `priority`, `position` defaulted as in the storefront seed helper.
3. `await addTaskToDeck(insertedTask)` from [`WorkoutDeckSelectionProvider`](../../../src/features/live-video/shells/huddle/workout-deck-selection-context.tsx). The provider:
   - Pushes a `SessionDeckSnapshot`,
   - Sets `activeSnapshotId` to the new snapshot,
   - Inserts `live_session_deck_items` (`session_id`, `task_id`, `sort_order`).
4. **Then** open the selector popover and run the standard **Option A** path against the freshly active snapshot.

### Why Option B is a fallback, not the default

- Avoids creating throwaway `tasks` rows for the common case where the host is editing an existing card.
- Keeps the **active card** as the unit of host intent; the “new tile + immediately edit” motion is a one-time bootstrap.
- One unified persistence story across Pre-Live and Active Live: **`task_id` always exists**; mutations land in `session_task_metadata`.

### Failure handling

- If `tasks.insert` fails: toast the user-facing error, **do not** mount the selector, leave the deck unchanged.
- If `addTaskToDeck` succeeds but the deck-item insert fails inside the provider: provider already retries via `flushDirtySessionMetadata`; the injector should still proceed — the snapshot exists locally and dirty edits will flush when the deck row is created.

---

## 5. Acceptance criteria

- Host in **Pre-Live**:
  - Active workout card present → **+ Add custom** opens search, multi-select, confirm appends rich exercises, snapshot turns **dirty**, **Apply to session only** persists `session_task_metadata`. **Join video** re-enables once the host exits the popover.
- Host in **Active Live**:
  - Same as above; mic/camera bar (`selectionFloatingMediaBar`) is unaffected (the injector is not the Kanban pick mode).
- **Empty deck** in either shell:
  - Selector confirm performs the Option B seed once, then completes the same Option A inject.
- Sidebar `selectedBubbleId` unchanged across the entire flow.
- No regressions to `+ Add from Board`, AMRAP wrapper paths, or Agora connectivity.

---

## 6. Open product decisions (do not block design)

- Auto-persist after inject vs require explicit **Apply to session only** click.
- Whether the seed `tasks` row from Option B is later promoted to a “save as new card” by reusing `usePersistDeckSnapshot.insertTaskClone` semantics.
- Whether to allow **drag-and-drop** of selector chips into a specific position in the exercise list (vs append-only).
