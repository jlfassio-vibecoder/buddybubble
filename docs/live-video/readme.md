# Live Video Implementation

This document describes the current BuddyBubble live video implementation. It is based on the deployed code paths under `src/features/live-video`, the dashboard integration, chat/card/class invite surfaces, the Agora token route, and the Supabase-backed workout deck/session state.

For the original implementation plan and changelog, see `docs/live-video-blueprint.md`.

## Status

Live video is currently implemented as a workout huddle inside the authenticated dashboard:

- Agora WebRTC provides browser audio/video publishing, subscribing, remote participant tracking, and local mic/camera toggles.
- Supabase Realtime broadcasts host-owned workout session state: lobby/live mode, phases, pause/resume, active deck item, aspect ratio, and sync requests.
- Supabase Postgres stores the workout queue in `live_session_deck_items`; participants can self-assign to every queued task before joining video.
- Sessions can be started from chat invites, card metadata, class instance metadata, or a development-only dashboard button.
- The dashboard renders a live video dock/theater surface inside `ThemeScope` so category theme tokens apply.

Only the `workout` live session mode exists today.

## User-Facing Flow

### Chat-started workout

1. A signed-in user clicks **Start live workout** from the chat composer.
2. `ChatArea` creates a `sessionId`, derives an Agora channel id in the form `bb-live-${workspaceId}-${shortId}`, and sends a chat message with `metadata.live_session`.
3. The host immediately enters the live video store with `inviteMessageId`, which opens the dashboard live video dock.
4. Other members see a `LiveSessionMessageCard` in chat and can join the same session.
5. The host sees the pre-join workout builder before joining video; participants see a read-only workout queue summary before joining.
6. Once the user joins video, the dock renders the huddle view with video, workout controls, deck/player UI, and participant logging.

Relevant files:

- `src/components/chat/ChatArea.tsx`
- `src/components/chat/LiveSessionMessageCard.tsx`
- `src/types/live-session-invite.ts`
- `src/store/liveVideoStore.ts`
- `src/components/dashboard/dashboard-live-video-dock.tsx`

### Card or class-started workout

Task cards and class instances can also carry `metadata.live_session`. Those surfaces show join buttons when the invite is active:

- Kanban task cards join with `sourceTaskId`.
- Class instance cards join with `sourceInstanceId`.
- Host end handling marks the originating task or class instance invite as ended.

Relevant files:

- `src/components/board/kanban-task-card.tsx`
- `src/components/fitness/ClassesBoard.tsx`
- `src/lib/card-live-session-metadata.ts`
- `src/lib/mark-card-live-session-ended.ts`

### Local scaffold

The scaffold route remains available for manual QA:

```text
/app/<workspace_id>/live-video-scaffold
```

It renders inside the normal dashboard shell and `ThemeScope`, but uses a fixed scaffold channel/session instead of `useLiveVideoStore`.

Relevant files:

- `src/app/(dashboard)/app/[workspace_id]/live-video-scaffold/page.tsx`
- `src/app/(dashboard)/app/[workspace_id]/live-video-scaffold/LiveVideoScaffoldClient.tsx`

## Architecture

The feature has three independent state layers.

### 1. Dashboard Session Pointer

`useLiveVideoStore` holds the currently selected live video session for this browser tab:

- `workspaceId`
- `sessionId`
- `channelId`
- `hostUserId`
- `mode: 'workout'`
- optional `inviteMessageId`
- optional `sourceTaskId`
- optional `sourceInstanceId`

`joinSession` replaces any active session. `leaveSession` clears the store, unmounting the dock and triggering Agora cleanup through React unmount.

The store is intentionally small. It is not the workout timer model and it is not the Agora client state.

Relevant file: `src/store/liveVideoStore.ts`.

### 2. Agora Media Session

`AgoraSessionProvider` owns the browser RTC lifecycle:

1. POST `/api/live-video/token` with `channelId`, `role`, and optional `workspaceId`.
2. Dynamically import `agora-rtc-sdk-ng` through `loadAgoraRTC()`.
3. For publishers, request microphone and camera tracks.
4. Create an Agora RTC client with `{ mode: 'rtc', codec: 'vp8' }`.
5. Join the channel with server-minted credentials.
6. Bind remote user listeners.
7. Publish local audio/video tracks for publisher sessions.

The context exposes:

- `isConnected`
- `isConnecting`
- `joinChannel`
- `leaveChannel`
- `localVideoTrack`
- `joinError`
- `remoteUsers`
- `role`
- `isMicMuted`
- `isCameraOff`
- `toggleMic`
- `toggleCamera`

Cleanup is centralized in `leaveChannel` and runs on provider unmount. It aborts in-flight token fetches, invalidates stale joins with `joinSeqRef`, detaches remote listeners, clears remote users, unpublishes when needed, closes local tracks, leaves the Agora client, and resets local media state.

Relevant files:

- `src/features/live-video/AgoraSessionProvider.tsx`
- `src/features/live-video/agora-session-context.tsx`
- `src/features/live-video/load-agora.ts`
- `src/features/live-video/agora-remote-user-listeners.ts`

### 3. Shared Workout Session State

`LiveSessionRuntimeProvider` wraps `useSessionState`, which uses Supabase Realtime broadcast channels for host-owned session state.

The topic format is:

```text
room-session:${workspaceId}:${sessionId}
```

Broadcast events:

- `STATE_BROADCAST`
- `SYNC_REQUEST`

The host is the authority. Participants only accept state broadcasts from `hostUserId`. On subscribe, participants send a sync request so the host can rebroadcast the latest state.

The state model tracks:

- `phase`: `lobby`, `warmup`, `amrap`, or `tabata`
- `status`: `idle`, `running`, or `paused`
- `globalStartedAt`
- `blockStartedAt`
- `blockPausedAt`
- `aspectRatio`: `16:9`, `9:16`, or `1:1`
- `activeDeckItemId`
- `generation`

`getElapsedMs` is ref-backed for low-churn timer rendering. Participants adjust elapsed time with a simple host-clock offset from the incoming broadcast `hostNow`.

Relevant files:

- `src/features/live-video/theater/live-session-runtime-context.tsx`
- `src/features/live-video/hooks/useSessionState.ts`
- `src/features/live-video/state/sessionStateMachine.ts`
- `src/features/live-video/state/session-sync.types.ts`

## Dashboard Integration

`DashboardShell` reads `useLiveVideoStore().activeSession`. When a session exists and a profile is loaded, the shell wraps the dashboard in `LiveSessionRuntimeProvider` and `LiveVideoSessionShell`.

Important behavior:

- Leaving the workspace clears the active live video session if the stored `workspaceId` no longer matches the route.
- On desktop, starting a live video session collapses the bubble rail and chat rail once per session to give the theater more width.
- In development only, a **Start live video (dev)** button creates a stable local test session.
- The dock is rendered above `WorkspaceMainSplit` and remains under `ThemeScope`.
- The layout is chosen by `deriveLiveTheaterLayoutPlan` and provided through `LiveTheaterLayoutProvider`.

`DashboardLiveVideoDock` mounts `AgoraSessionProvider` and chooses between:

- `PreJoinBuilder` for the host before Agora is connected.
- `ParticipantPreJoinSummary` for participants before Agora is connected.
- `LiveSessionView` once Agora is connecting or connected.

Relevant files:

- `src/components/dashboard/dashboard-shell.tsx`
- `src/components/dashboard/dashboard-live-video-dock.tsx`
- `src/features/live-video/theater/live-video-session-shell.tsx`
- `src/features/live-video/theater/live-theater-layout-context.tsx`
- `src/features/live-video/theater/use-live-theater-layout-plan.ts`
- `src/features/live-video/theater/live-theater-layout.types.ts`

## Video UI

`BaseVideoHarness` is the reusable video stage. It renders:

- the host as the main stage;
- participant thumbnails in a dedicated side rail beside the host stage;
- local picture-in-picture for non-host users;
- remote video tiles;
- local/remote camera-off and mic-muted overlays;
- zoom and pan controls for video previews;
- the floating media bar for mic/camera toggles and optional extras;
- optional absolute overlays above the video frame.

`LocalVideoPreview` and `RemoteVideoPreview` call Agora track `play()` on mount and `stop()` on cleanup. Track lifetime remains owned by `AgoraSessionProvider`.

`RemoteVideoPreview` listens for `track-updated` events so toggles that do not unpublish still update the overlay state.

Relevant files:

- `src/features/live-video/BaseVideoHarness.tsx`
- `src/features/live-video/LocalVideoPreview.tsx`
- `src/features/live-video/RemoteVideoPreview.tsx`
- `src/features/live-video/ui/FloatingMediaBar.tsx`
- `src/features/live-video/shells/huddle/VideoStageWrapper.tsx`
- `src/features/live-video/ui/AmrapVideoOverlays.tsx`
- `src/features/live-video/shells/huddle/ActivePhaseOverlays.tsx`

## Workout Huddle UI

The huddle is split into pre-join and connected states.

### Host pre-join

`PreJoinBuilder` shows the workout builder before the host joins video:

- session header;
- deck builder/queue;
- workout card player/editor;
- **Exit workout** for leaving the local dock;
- **Join video** for entering Agora.

### Participant pre-join

`ParticipantPreJoinSummary` shows the live deck as read-only. On join, it calls the `assign_user_to_session_deck` RPC so the participant is assigned to every task in the session deck before opening video.

### Connected huddle

`LiveSessionView` renders the video-first huddle after Agora is connecting or connected:

- session header;
- video stage;
- host workout player or participant workout logger;
- session controls;
- session deck builder;
- mobile bottom sheet for the editor/logger.

Host controls include:

- start session;
- end session for all;
- transition to warm-up, AMRAP, or Tabata;
- pause/resume a block;
- return to huddle;
- active deck item sync;
- aspect ratio sync.

Participant controls are read-only for session state.

Relevant files:

- `src/features/live-video/shells/huddle/PreJoinBuilder.tsx`
- `src/features/live-video/shells/ParticipantPreJoinSummary.tsx`
- `src/features/live-video/shells/huddle/LiveSessionView.tsx`
- `src/features/live-video/shells/huddle/SessionControls.tsx`
- `src/features/live-video/shells/huddle/SessionDeckBuilder.tsx`
- `src/features/live-video/shells/huddle/LiveSessionWorkoutPlayer.tsx`
- `src/features/live-video/shells/ParticipantWorkoutLogger.tsx`

## Workout Deck Persistence

The session deck is persisted in `public.live_session_deck_items`. Each row connects:

- `session_id`
- `task_id`
- `sort_order`
- timestamps
- row `id` for stable references and duplicate task support

`useLiveSessionDeck` reads ordered deck rows with nested task rows and subscribes to Postgres Realtime changes filtered by `session_id`.

`WorkoutDeckSelectionProvider` coordinates host deck selection and persistence:

- local deck snapshots;
- card selection from the board;
- rehydration when revisiting an active session;
- insertion of new deck rows;
- sort order updates;
- row deletion;
- active snapshot state;
- board-selection bridge state.

Participants consume the same deck rows and match the host-selected `activeDeckItemId` against persisted row ids.

Relevant files:

- `src/features/live-video/hooks/useLiveSessionDeck.ts`
- `src/features/live-video/shells/huddle/workout-deck-selection-context.tsx`
- `src/features/live-video/shells/huddle/session-deck-snapshot.ts`
- `src/features/live-video/shells/huddle/workout-deck-board-bridge.ts`
- `supabase/migrations/20260624120000_live_session_deck_and_task_assignees.sql`
- `supabase/migrations/20260625120000_assign_user_to_session_deck_rpc.sql`
- `supabase/migrations/20260626120000_live_session_deck_allow_duplicates.sql`

## Invite Metadata

Live session invites are stored as JSON under `metadata.live_session` on chat messages, tasks, and class instances.

Shape:

```ts
type LiveSessionInvitePayload = {
  type: 'live_session';
  workspaceId: string;
  sessionId: string;
  channelId: string;
  hostUserId: string;
  mode: 'workout';
  createdAt: string;
  endedAt?: string | null;
};
```

When the host ends a session for everyone:

- chat invites are patched through `markLiveSessionInviteMessageEnded`;
- task invites are patched through `markTaskLiveSessionEnded`;
- class instance invites are patched through `markClassInstanceLiveSessionEnded`.

Those helpers preserve unrelated metadata keys and set `endedAt`.

Relevant files:

- `src/types/live-session-invite.ts`
- `src/lib/mark-live-session-invite-ended.ts`
- `src/lib/card-live-session-metadata.ts`
- `src/lib/mark-card-live-session-ended.ts`

## Token Boundary And Security

The browser never receives `AGORA_APP_CERTIFICATE`. It requests a short-lived RTC token from:

```text
POST /api/live-video/token
```

Request body:

```json
{
  "channelId": "bb-live-...",
  "role": "publisher",
  "workspaceId": "..."
}
```

Response body:

```json
{
  "token": "...",
  "appId": "...",
  "uid": 123,
  "channelId": "bb-live-...",
  "expiresAt": 1234567890
}
```

Server validation:

- `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE` must be configured.
- Supabase `auth.getUser()` must return an authenticated user.
- `channelId` must match `^[a-zA-Z0-9_-]{1,64}$`.
- `role` must be `publisher` or `subscriber`.
- if `workspaceId` is present, the user must have a `workspace_members` row for that workspace.

The route derives a deterministic 32-bit Agora UID from the Supabase auth user id with `agoraUidFromUuid`.

Token TTL is currently 3600 seconds.

Relevant files:

- `src/app/api/live-video/token/route.ts`
- `src/lib/live-video/agora-uid.ts`

Current authorization is workspace-level. The token route does not prove that the user was invited to a specific `sessionId`; it assumes session discovery is controlled by workspace-visible chat/card/class surfaces and RLS.

## Environment

Required server-only variables:

```bash
AGORA_APP_ID=
AGORA_APP_CERTIFICATE=
```

These are documented in `.env.example`. They must not be exposed with `NEXT_PUBLIC_`.

The feature also depends on the normal app Supabase configuration:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

For production deployments, set Agora variables as server-side environment variables in the hosting provider.

If a future Content Security Policy adds a restrictive `connect-src`, it must allow Agora signaling, TURN, and WebSocket hosts per Agora Web SDK guidance. The current `next.config.ts` does not ship a restrictive global `connect-src`.

## Database And RLS

The deck persistence and assignment flow relies on:

- `public.live_session_deck_items`
- `public.task_assignees`
- `public.get_task_bubble_id(uuid)`
- `public.assign_user_to_session_deck(text, uuid)`

`live_session_deck_items` RLS is bubble-derived:

- select requires `can_view_bubble(get_task_bubble_id(task_id))`;
- insert/update/delete require write access through the related task bubble;
- duplicate task ids per session are allowed after the follow-up migration that adds row `id`.

`assign_user_to_session_deck` is a `SECURITY DEFINER` RPC that requires `auth.uid() = p_user_id`, verifies the caller can view every task bubble in the deck, and inserts `task_assignees` rows with `ON CONFLICT DO NOTHING`.

## Debug Logging

Several live video tripwire logs are intentionally still present:

- `[DEBUG] AgoraSessionProvider Mounted - Initializing connection bounds`
- `[DEBUG] AgoraSessionProvider Unmounted - TRIPPING DISCONNECT / Cleanup`
- `[DEBUG] BaseVideoHarness Rendered with child shell:`
- `[DEBUG] Token API hit for channel:`
- `[DEBUG] Token fetched successfully`
- `[DEBUG] Toggling media: type=audio|video, newState=enabled|disabled`

Some are gated to development and some are still unconditional. Keep them stable while debugging lifecycle behavior; gate or remove them once the feature is stable.

## Manual QA

### Prerequisites

1. Apply the Supabase migrations that include `live_session_deck_items`, `task_assignees`, and `assign_user_to_session_deck`.
2. Configure `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE` in `.env.local`.
3. Run the Next.js app with `pnpm dev` or the repository's configured script.
4. Sign in as workspace members in two browser sessions or devices.

### Chat invite path

1. Open a workspace dashboard.
2. Select a bubble where the current user can post.
3. Click **Start live workout** in the chat composer.
4. Confirm a live workout chat card appears.
5. Confirm the host dock opens in pre-join builder mode.
6. Add or edit workout deck items.
7. Click **Join video** and grant mic/camera permissions.
8. In the second session, click **Join session** on the chat card.
9. Confirm the participant sees the pre-join summary, joins, and appears in the video rail.
10. Exercise mic/camera toggles, phase transitions, pause/resume, and end session.

### Scaffold path

1. Navigate to `/app/<workspace_id>/live-video-scaffold`.
2. Confirm the pre-join builder loads inside dashboard theming.
3. Click **Join video** and confirm Agora connection behavior.

### Failure cases

- Missing Agora env vars should return a user-facing token error from the provider.
- Denying camera/mic permission should set `joinError` to a permission message.
- Leaving the dock should release camera/mic hardware.
- Opening an invite after the host marks `endedAt` should disable joining from that card.

## Automated Tests

Current automated coverage is focused on theater layout derivation:

- `src/features/live-video/theater/live-theater-layout.test.ts`

Not currently covered by automated tests:

- Agora provider lifecycle;
- token route responses and auth cases;
- `agoraUidFromUuid` test vectors;
- Supabase Realtime session sync;
- deck persistence and participant assignment RPC integration.

## Known Limitations

- Authorization for Agora tokens is workspace-level, not session-level.
- Supabase Realtime broadcasts are best-effort (`ack: false`); participants request sync on subscribe, but delivery ordering is still eventual.
- Participant clocks are approximate and use host broadcast timestamps, not NTP-grade synchronization.
- `agora-access-token` is still used for server token generation, with a code comment noting a future migration to `agora-token`.
- Media connection state and workout session state are deliberately separate; leaving Agora video does not necessarily end the shared workout or mark invite metadata ended.
- Only the `workout` mode is implemented.
- Debug logging remains in live paths while the feature stabilizes.

## Extension Notes

When extending live video:

- Keep Agora connection lifecycle inside `AgoraSessionProvider` or a hook owned by it.
- Keep UI shells behind the shared provider/context boundary.
- Keep the dashboard dock under `ThemeScope`.
- Do not expose Agora certificate, Supabase service role, or any server-only key to the browser.
- Preserve the `metadata.live_session` parser as the compatibility boundary for chat, task, and class invite surfaces.
- Treat `sessionId` as the durable app-level session key and `channelId` as the Agora RTC channel key.
- Use persisted `live_session_deck_items.id` values when syncing active workout cards to participants.
