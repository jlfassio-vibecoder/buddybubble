# Unified workout builder layout (the “trifecta”)

This document is the **layout and integration standard** for the three host-facing workout builder surfaces. Follow it when adding features or refactoring so UX and DOM structure stay aligned.

---

## 1. Overview: the trifecta

Three contexts share the same mental model: **header → deck strip → main workspace → footer actions**.

| Context                 | Role                                                 | Primary component                                                                                                 | Notes                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Class Builder**       | Author a class draft deck (no Agora)                 | [`StandaloneClassDeckBuilder.tsx`](../../../src/features/live-video/shells/huddle/StandaloneClassDeckBuilder.tsx) | Mounted from [`dashboard-shell.tsx`](../../../src/components/dashboard/dashboard-shell.tsx). Class instance editing in the modal also flows through [`ClassEditor.tsx`](../../../src/components/modals/class-modal/ClassEditor.tsx) for scheduling/recording; the **full-screen deck builder** parity target is `StandaloneClassDeckBuilder`. |
| **Pre-Live Builder**    | Host prepares queue + exercises before joining video | [`PreJoinBuilder.tsx`](../../../src/features/live-video/shells/huddle/PreJoinBuilder.tsx)                         | Rendered by [`DashboardLiveVideoDockRouter`](../../../src/components/dashboard/dashboard-live-video-dock.tsx) while Agora is disconnected (`!isConnected && !isConnecting`).                                                                                                                                                                  |
| **Active Live Builder** | Host edits during broadcast                          | [`LiveSessionView.tsx`](../../../src/features/live-video/shells/huddle/LiveSessionView.tsx)                       | Same router after join; video stage + session chrome.                                                                                                                                                                                                                                                                                         |

**Core principle:** The **user experience** and **DOM hierarchy** (header → pinned deck → flex main region) must stay **identical** across all three wherever the same concepts appear. That reduces cognitive load when moving **Class → Pre-Live → Live**.

Shared building blocks:

- [`SessionDeckBuilder.tsx`](../../../src/features/live-video/shells/huddle/SessionDeckBuilder.tsx) — horizontal queue
- [`LiveSessionWorkoutPlayer.tsx`](../../../src/features/live-video/shells/huddle/LiveSessionWorkoutPlayer.tsx) — exercise editor (when not in board-pick mode)
- [`SessionHeader.tsx`](../../../src/features/live-video/shells/huddle/SessionHeader.tsx) — top chrome for builder modes

---

## 2. Flexbox / layout standard

### Deck strip (always top)

`<SessionDeckBuilder>` must sit **immediately under** the header/title block in the primary column and use:

```text
className="min-h-0 min-w-0 shrink-0"
```

That pins the strip to the **top** of the flex column and prevents it from stealing height from the main region or collapsing incorrectly in nested flex layouts.

### Main content (everything below the deck)

The block under the deck (video stage, embedded Kanban, or `LiveSessionWorkoutPlayer`) must **fill remaining space** and scroll internally as needed:

```text
flex-1 min-h-0 overflow-hidden
```

Often this is applied on a **wrapper** `div` that contains exactly one primary child (e.g. embedded `KanbanBoard` or the resizable split in live view). The `min-h-0` is critical: without it, flex children default to `min-height: auto` and can overflow the parent instead of shrinking.

### Board-pick mode (Class vs Pre-Live vs Live)

When the host enters **“pick from board”** mode (`WorkoutDeckSelectionProvider` / `isSelectingFromBoard`), the **main content** swaps from `LiveSessionWorkoutPlayer` to the embedded Workouts Kanban (see §4). The deck strip **stays at the top** in all three builders.

---

## 3. State preservation: Agora hoist

**Problem:** Changing theater shell layout (e.g. entering deck selection) used to **unmount** the live video dock subtree. That ran `AgoraSessionProvider` cleanup (`leaveChannel`), dropping the host back to pre-join.

**Fix:** `AgoraSessionProvider` is **hoisted** so it survives dock body remounts:

- [`DashboardLiveVideoDockProvider`](../../../src/components/dashboard/dashboard-live-video-dock.tsx) wraps children with `AgoraSessionProvider` (workout mode only).
- [`dashboard-shell.tsx`](../../../src/components/dashboard/dashboard-shell.tsx) places that provider **above** the theater plan branch so when `DashboardLiveVideoDockBody` or its router remounts, **WebRTC state stays alive**.

The dock **router** may still remount cheaply; the important invariant is: **do not nest `AgoraSessionProvider` inside a component that unmounts on shell-kind transitions** without this hoist pattern.

---

## 4. Context isolation: Workouts board without sidebar jumps

**Problem:** Focusing the workspace Kanban for “pick a card” would follow **sidebar `selectedBubbleId`**, so hosts on the Classes bubble saw the wrong columns.

**Fix (live + pre-live paths):** Build a **dedicated** `KanbanBoard` instance with a **scoped** bubble:

- Prop: `bubbleOverride` on [`KanbanBoard.tsx`](../../../src/components/board/KanbanBoard.tsx)
- Inside the board, derive `effectiveActiveBubble = bubbleOverride ?? activeBubbleFromStore` and use **`effectiveActiveBubble`** for chrome, ribbon, archive behavior, and trial paths tied to the active bubble.

The **global** workspace store **`activeBubble` / `selectedBubbleId` is not updated** for this embedded board in the live shell (contrast: Class Builder may temporarily call `setSelectedBubbleId` for its **local** full-page builder UX—do not copy that pattern into live/pre-live without an explicit product reason).

Selection panel construction and pass-through:

- [`dashboard-shell.tsx`](../../../src/components/dashboard/dashboard-shell.tsx) — `liveDeckBoardSelectionPanel` (Workouts bubble lookup + `bubbleOverride`)
- Props: `boardSelectionPanel` / `selectionFloatingMediaBar` on [`DashboardLiveVideoDockBody`](../../../src/components/dashboard/dashboard-live-video-dock.tsx) → router → [`LiveSessionView`](../../../src/features/live-video/shells/huddle/LiveSessionView.tsx) and [`PreJoinBuilder`](../../../src/features/live-video/shells/huddle/PreJoinBuilder.tsx)

**Warning:** Avoid “fixing” pick mode by calling `setSelectedBubbleId` from live/pre-live flows; it causes **sidebar jumps** and breaks the principle that **live selection is an overlay**, not a navigation change.

Theater shell often coerces to **`theater_focus`** while selecting so the workspace stage does not show a **duplicate** Kanban beside the dock—see layout plan in `dashboard-shell.tsx` (`shellKind` when `workoutBoardSelecting && activeLiveVideoSession`).

---

## 5. Floating hardware controls (Active Live only)

When the host hides the video stage behind the embedded Kanban (`selectingFromBoard`), they still need **mic and camera** toggles without hunting for buried controls.

**Pattern:** Pass a **`selectionFloatingMediaBar`** React node from the shell into the dock router, then into `LiveSessionView`. That slot typically wraps [`FloatingMediaBar.tsx`](../../../src/features/live-video/ui/FloatingMediaBar.tsx) bound to [`useAgoraSession`](../../../src/features/live-video/agora-session-context.tsx) so toggles call `toggleMic` / `toggleCamera`.

**Pre-Live:** Do **not** show this bar during pre-join—Agora is not connected; **Join video** is the path to hardware. `PreJoinBuilder` receives `boardSelectionPanel` only, not `selectionFloatingMediaBar`.

---

## Related reading

- [Workout builder README](./README.md) — data model, deck persistence, participant logging
