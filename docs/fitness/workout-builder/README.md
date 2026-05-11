# Workout builder (live video shell)

This document identifies the **trainer authoring surface** for workout “cards” in the **live video huddle**, the **participant logging UI**, the **persistence model**, and **data flow**. It reflects the current codebase (no proposed changes).

## Unified layout architecture (trifecta)

Host-facing **Class Builder**, **Pre-Live Builder**, and **Active Live Builder** share a single layout standard (flex hierarchy, Agora hoist, Workouts `KanbanBoard` override, and live-only media bar). See **[Unified workout builder layout](./unified-builder-layout.md)** before changing those surfaces.

## Custom live workout builder (inline exercise injection)

Architectural blueprint for the **+ Add custom** flow that lets the host search `exercise_dictionary` inline and inject rich exercises into the active live deck card without leaving the live shell. See **[Custom live builder architecture (ADR)](./custom-live-builder-architecture.md)**.

## Summary

| Concern                                                  | Primary files                                                                                                                                                                                                                          |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Builder shell (pre-join)**                             | [`PreJoinBuilder.tsx`](../../../src/features/live-video/shells/huddle/PreJoinBuilder.tsx)                                                                                                                                              |
| **Deck queue (reorder / remove / pick active card)**     | [`SessionDeckBuilder.tsx`](../../../src/features/live-video/shells/huddle/SessionDeckBuilder.tsx)                                                                                                                                      |
| **Exercise authoring (sets, reps, movements)**           | [`LiveSessionWorkoutPlayer.tsx`](../../../src/features/live-video/shells/huddle/LiveSessionWorkoutPlayer.tsx) → [`WorkoutExercisesEditor`](../../../src/components/fitness/workout-exercises-editor.tsx)                               |
| **Deck state + Supabase writes for queue rows**          | [`workout-deck-selection-context.tsx`](../../../src/features/live-video/shells/huddle/workout-deck-selection-context.tsx)                                                                                                              |
| **Kanban → deck handoff**                                | [`workout-deck-board-bridge.ts`](../../../src/features/live-video/shells/huddle/workout-deck-board-bridge.ts) (used from [`dashboard-shell.tsx`](../../../src/components/dashboard/dashboard-shell.tsx) when selecting from the board) |
| **Participant logging UI**                               | [`ParticipantWorkoutLogger.tsx`](../../../src/features/live-video/shells/ParticipantWorkoutLogger.tsx)                                                                                                                                 |
| **Deck rows + merged task metadata (read path)**         | [`useLiveSessionDeck.ts`](../../../src/features/live-video/hooks/useLiveSessionDeck.ts)                                                                                                                                                |
| **Per-set persistence for members**                      | [`useWorkoutLogs.ts`](../../../src/features/live-video/hooks/useWorkoutLogs.ts) → `workout_exercise_logs`                                                                                                                              |
| **Host ↔ participant session sync (phase, active card)** | [`useSessionState.ts`](../../../src/features/live-video/hooks/useSessionState.ts) (Supabase Realtime **broadcast**, not WebRTC data channels)                                                                                          |

There is **no** component literally named `WorkoutBuilder`; the **pre-join column** is documented in-code as the **“Workout Builder” surface** (`PreJoinBuilder`). The closest **named** exercise editor is **`WorkoutExercisesEditor`**, embedded by **`LiveSessionWorkoutPlayer`**.

### Class draft decks (async, no video)

Trainers can pre-build a workout queue for a **scheduled class instance** from the **Classes** board without joining Agora. Draft rows use the same **`live_session_deck_items`** table with a **namespaced** `session_id`:

- Format: **`bb-class-deck:`** + **`class_instances.id`** (see [`class-deck-builder-session-id.ts`](../../../src/lib/fitness/class-deck-builder-session-id.ts)).
- UI: [`StandaloneClassDeckBuilder.tsx`](../../../src/features/live-video/shells/huddle/StandaloneClassDeckBuilder.tsx) wraps **`WorkoutDeckSelectionProvider`** with `sessionIdOverride` / `hostUserIdOverride` (no live-video store).
- **Follow-up (not automatic today):** copying draft rows into the **live** session’s `session_id` when the class goes live, so the dock picks up the same deck without re-building.

---

## 1. Entry point: where trainers add / edit workout cards

### Adding cards to the live deck

- Trainers **do not** create new task rows inside the live shell by default. They **add existing Kanban workout tasks** to the session deck:
  - **`WorkoutDeckSelectionProvider`** ([`workout-deck-selection-context.tsx`](../../../src/features/live-video/shells/huddle/workout-deck-selection-context.tsx)) exposes **`enterSelectionMode`**, which registers a handler so **`dispatchWorkoutDeckTaskFromBoard`** ([`workout-deck-board-bridge.ts`](../../../src/features/live-video/shells/huddle/workout-deck-board-bridge.ts)) delivers **`TaskRow`** clicks from **`KanbanBoard`** into **`addTaskToDeck`**.
  - **`addTaskToDeck`** appends a **client `SessionDeckSnapshot`** (clone of the task + dirty flags) and **inserts** a row into **`live_session_deck_items`** (`session_id`, `task_id`, `sort_order`), then stores the returned **`deckItemId`** on the snapshot.

### Building / editing the workout payload (exercises)

- **`LiveSessionWorkoutPlayer`** ([`LiveSessionWorkoutPlayer.tsx`](../../../src/features/live-video/shells/huddle/LiveSessionWorkoutPlayer.tsx)) is the **host-only** editor for the **active** deck snapshot:
  - Reads **`workoutExercises`** via **`metadataFieldsFromParsed(activeSnapshot.task.metadata)`** from [`item-metadata.ts`](../../../src/lib/item-metadata.ts).
  - Renders **`WorkoutExercisesEditor`** ([`workout-exercises-editor.tsx`](../../../src/components/fitness/workout-exercises-editor.tsx)) with **`onChange`** → **`mergeWorkoutExercisesIntoTaskMetadata`** (session snapshot metadata only until persisted).
  - When edits are “dirty”, the host can:
    - **Apply to session only** — session-scoped overlay (see schema below).
    - **Update original card** — writes **`tasks`** via **`usePersistDeckSnapshot`**.
    - **Save as new card** — inserts a new **`tasks`** row and **rebinds** the snapshot’s origin task id.

### Queue UI (strip of cards)

- **`SessionDeckBuilder`** ([`SessionDeckBuilder.tsx`](../../../src/features/live-video/shells/huddle/SessionDeckBuilder.tsx)) renders the **horizontal deck**: host sees **sortable** **`KanbanTaskCard`** tiles (summary density); participants see a **read-only** copy driven by **`useLiveSessionDeck`**.

### Pre-join vs in-session

- **`PreJoinBuilder`** ([`PreJoinBuilder.tsx`](../../../src/features/live-video/shells/huddle/PreJoinBuilder.tsx)) stacks **`SessionHeader`** + **`SessionDeckBuilder`** + **`LiveSessionWorkoutPlayer`** before the host joins Agora video — same authoring components as in **`LiveSessionView`** for the host column.
- **`LiveSessionView`** ([`LiveSessionView.tsx`](../../../src/features/live-video/shells/huddle/LiveSessionView.tsx)) mounts the same **`LiveSessionWorkoutPlayer`** for **host** and **`ParticipantWorkoutLogger`** for **non-host** in the editor panel (layout varies by compact / side editor / interval wrapper).

---

## 2. Data model: where workout cards and payloads live

### Canonical workout structure (authoring + display)

- Exercise prescriptions live in **`tasks.metadata`** as JSON, using the **`exercises`** array (parsed in app code as **`workoutExercises`**: type **`WorkoutExercise`** in [`item-metadata.ts`](../../../src/lib/item-metadata.ts)). Fields include **`name`**, **`sets`**, **`reps`**, **`weight`**, **`duration_min`**, **`rpe`**, interval fields, notes, **`set_logs`** (for logged workouts), etc.

### Session deck index (ordered queue)

- Table **`live_session_deck_items`** (see migrations under `supabase/migrations/20260624120000_live_session_deck_and_task_assignees.sql` and follow-ups):
  - **`session_id`** (text; matches live session id from invite / store, not a separate WebRTC id),
  - **`task_id`** → **`tasks`**, **`sort_order`**, timestamps,
  - **`session_task_metadata`** (jsonb, added in `20260806120000_live_session_deck_session_task_metadata.sql`) — optional **overlay** merged over **`tasks.metadata`** for that deck row only (“Apply to session only”).

### Per-user logs during live session

- Table **`workout_exercise_logs`** (typed in [`useWorkoutLogs.ts`](../../../src/features/live-video/hooks/useWorkoutLogs.ts)): **`user_id`**, **`session_id`**, **`task_id`**, **`exercise_name`**, **`set_number`**, **`weight_lbs`**, **`reps`**, **`rpe`**, upserted on conflict.

### What is **not** used for this flow

- **Not** `class_instances.metadata` for the deck queue or exercise list.
- **Not** ephemeral WebRTC / Agora data channels for deck contents — **queue + task data** go through **Supabase** (**Postgres + Realtime**).

---

## 3. Display UI: where participants log sets / weights

- **`ParticipantWorkoutLogger`** ([`ParticipantWorkoutLogger.tsx`](../../../src/features/live-video/shells/ParticipantWorkoutLogger.tsx)):
  - Subscribes to the same deck via **`useLiveSessionDeck`**.
  - Resolves the **active** row using **`state.activeDeckItemId`** from **`useLiveSessionRuntime`** / session state machine (host-driven).
  - Reads **`metadataFieldsFromParsed(activeTask.metadata).workoutExercises`** (already **merged** with **`session_task_metadata`** in **`withSessionDeckDisplayTasks`**).
  - Persists input through **`useWorkoutLogs`** → **`workout_exercise_logs`**.

---

## 4. Data flow: trainer → participants

1. **Host builds queue**: selection mode on Kanban → **`addTaskToDeck`** → **insert `live_session_deck_items`** (and local **`SessionDeckSnapshot`** list).
2. **Host edits exercises**: **`WorkoutExercisesEditor`** updates snapshot metadata; persist choices:
   - **Session only** → update **`live_session_deck_items.session_task_metadata`** (via persist helpers in [`usePersistDeckSnapshot.ts`](../../../src/features/live-video/shells/huddle/usePersistDeckSnapshot.ts) / context),
   - **Original / new task** → **`tasks`** row insert/update.
3. **Participants observe queue**: **`useLiveSessionDeck`** **select** + **Realtime `postgres_changes`** on **`live_session_deck_items`** for **`session_id`**; each row joins **`tasks`** and merges **`session_task_metadata`** over **`tasks.metadata`** for display.
4. **Host drives “which card we’re on”**: **`useSessionState`** syncs **`SessionState`** (including **`activeDeckItemId`**) via **Supabase Realtime channel broadcast** (`room-session:${workspaceId}:${sessionId}`), not the video SDK.
5. **Participants log**: **`ParticipantWorkoutLogger`** uses active **`tasks`** + exercises list → **`workout_exercise_logs`** upserts.

---

## Related code

- Snapshot shape: [`session-deck-snapshot.ts`](../../../src/features/live-video/shells/huddle/session-deck-snapshot.ts)
- Session state machine (phases, active deck item): [`sessionStateMachine.ts`](../../../src/features/live-video/state/sessionStateMachine.ts)
