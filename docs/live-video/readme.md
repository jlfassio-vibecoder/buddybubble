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

The feature has three independent state layers, plus a durable Postgres session registry (see "Durable Session Registry" below) that gates wrapper-bearing phases (AMRAP, etc.) and provides the participant roster.

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

### 4. Durable Session Registry

Beyond the three transient layers above, the dock writes a durable Postgres row per session into `public.live_sessions` and a row per joined user into `public.live_session_participants`. This registry is what wrapper-bearing phases (AMRAP today, future kinds) read at runtime.

`DashboardLiveVideoDockRouter` calls one of two RPCs the first time Agora connects for a given `sessionId`:

- Host: `live_session_create(p_session_id, p_display_name, p_agora_uid)` (idempotent: upserts both the `live_sessions` row and the host `live_session_participants` row).
- Participant: `live_session_participant_join(p_session_id, p_display_name, p_agora_uid, p_role)` (retried up to 24 times at 150 ms while waiting for the host's `live_sessions` row to appear).

Once registration succeeds the dock flips an internal `liveDbReady` flag. `LiveSessionView` blocks `get_live_session_join_hints` and `live_session_list_participants` reads until `liveDbReady === true` to avoid a connect-before-register race.

Schema highlights:

- `public.live_sessions (id uuid pk, host_user_id, interval_wrapper_kind, interval_wrapper_config jsonb, created_at)`.
- `public.live_session_participants (id uuid pk, session_id, user_id, display_name, role, agora_uid text, joined_at)`.
- `is_live_session_participant(uuid)` SECURITY DEFINER helper used by RLS.
- `host_attach_amrap_session(p_session_id, p_interval_wrapper_config)` host-only RPC that flips `interval_wrapper_kind = 'amrap'` and writes the wrapper config.
- `get_live_session_join_hints(p_session_id)` — public-readable JSON of `interval_wrapper_kind` + config so clients can pick the correct wrapper UI before they have full row read access.
- `live_session_list_participants(p_session_id)` — gated on caller membership; returns ids, display names, role, and `agora_uid` for tile identity.
- `supabase_realtime` publication includes `live_sessions` so wrapper changes propagate via `postgres_changes`.

`live_sessions.id` IS the durable app session UUID (the same value as `liveVideoStore.activeSession.sessionId`). It is **not** the Agora `channelId` — see the Identifier Model section below.

Relevant files:

- `src/components/dashboard/dashboard-live-video-dock.tsx`
- `src/features/live-video/shells/huddle/LiveSessionView.tsx`
- `supabase/migrations/20260730120000_create_live_sessions_and_participants.sql`
- `supabase/migrations/20260730120100_live_session_join_hints.sql`
- `supabase/migrations/20260731120000_live_session_lifecycle_rpcs.sql`
- `supabase/migrations/20260802120000_live_sessions_realtime.sql`

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

## Interval Wrappers

`LiveSessionView` mounts an optional "interval wrapper" inside the connected huddle. Wrappers are pluggable UIs that drive their own timing model on top of (or alongside) the base session state.

Registry:

- `IntervalWrapperKind = 'none' | 'simple_countdown' | 'amrap' | 'amrap_minimal'`.
- `getIntervalWrapper(kind)` returns `{ component, hasVideoBackground, requiresAttach, label, inlineUi?, preferredShell? }`.
- `WrapperBaseProps` is the contract every wrapper consumes (kind, config, host participant id, video tile exclude uid, `liveSessionId`, `participantId`, role, display name, auth user id, error reporter).
- `WrapperErrorBoundary` catches wrapper render errors so the rest of the huddle keeps working.
- `WrapperAttachContext` lets a wrapper temporarily override the active wrapper kind/config without touching `live_sessions` (used during attach/edit flows).

Selection flow:

1. Dock connects, registers the durable session row, and flips `liveDbReady`.
2. `LiveSessionView` reads `get_live_session_join_hints(sessionId)` to pick `interval_wrapper_kind` + `interval_wrapper_config`.
3. Subscribes to `postgres_changes` on `live_sessions` filtered by `id=eq.<sessionId>` so wrapper changes (via `host_attach_amrap_session` or future host RPCs) propagate.
4. When `state.phase` matches the wrapper kind (e.g. `phase === 'amrap'` and kind `amrap`/`amrap_minimal`), the wrapper component renders.
5. `entry.preferredShell === 'theater_board_split'` switches the huddle into a video|board resizable split for that wrapper.

Relevant files:

- `src/features/live-video/wrappers/registry.tsx`
- `src/features/live-video/wrappers/types.ts`
- `src/features/live-video/wrappers/parseWrapperConfig.ts`
- `src/features/live-video/wrappers/WrapperErrorBoundary.tsx`
- `src/features/live-video/contexts/WrapperAttachContext.tsx`
- `src/features/live-video/shells/huddle/LiveSessionView.tsx`

## AMRAP Feature Module

AMRAP (As Many Rounds As Possible) is a fully separate feature module that plugs into live video through the Interval Wrappers registry. It is the only non-trivial wrapper today and is large enough to warrant its own folder.

The `amrap` and `amrap_minimal` registry entries delegate rendering to `AmrapWrapper`, which composes UI from `src/features/amrap/**`:

- Engine: `src/features/amrap/types/amrap-engine.ts`, `src/features/amrap/utils/buildAmrapBlockSnapshot.ts`, `src/features/amrap/utils/computeAmrapLeaderboard.ts`.
- Hooks: `useAmrapSession`, `useAmrapTimerState`, `useAmrapParticipants`, `useAmrapRounds`, `useAmrapSetDuplication`.
- UI: `AmrapTimerOverlay`, `AmrapRoundLapsOverlay`, `AmrapLogRoundOverlay`, `AmrapResultsDrawer`, `AmrapLeaderboard`, `AmrapHostActions`, `MeLeaderToggle`, `TimerVideoBackground`, `ViewResultsModal`, `AmrapSessionShell`, `AmrapEmbedExerciseSection`.

Database surface for AMRAP lives in:

- `supabase/migrations/20260801120000_amrap_session_tables_and_rpcs.sql`
- `supabase/migrations/20260801130000_host_detach_amrap_session.sql`
- `supabase/migrations/20260801140000_amrap_block_snapshot.sql`
- `supabase/migrations/20260803120000_amrap_minimal_wrapper.sql`
- `supabase/migrations/20260804120000_amrap_session_leaderboard_snapshot.sql`
- `supabase/migrations/20260805120000_fix_amrap_reset_timer.sql`

The host attaches AMRAP to the active live session by calling `host_attach_amrap_session` (or the wrapper's equivalent attach path) which flips `live_sessions.interval_wrapper_kind = 'amrap'` and writes a wrapper config; the dock's wrapper subscriber notices the UPDATE and switches in the AMRAP UI.

## Cloud Recording

Class-mode live sessions can be recorded into Supabase Storage via Agora Cloud Recording. The control plane is intentionally service-role only; the browser only triggers start/stop and reads a status field on `class_instances.metadata.class_recording`.

Trigger surface (browser):

- Host clicks Start Session inside a class-instance live session → `DashboardLiveVideoDockRouter.handleStartRecording` invokes the `agora-recording-start` Edge Function with `{ classInstanceId, channelName, workspaceId }`.
- Host ends the session → `dashboard-shell.tsx onHostEndLiveSessionForAll` invokes `agora-recording-stop` with `{ classInstanceId }`.
- The dock polls `class_instances.metadata.class_recording.status` every 15 s while `'processing'` and propagates `hostClassRecordingProcessing` into `LiveSessionView` for status UI.

Edge Functions:

- `supabase/functions/agora-recording-start/index.ts` — verifies the caller is the live-session host (via `parseLiveSessionInviteFromInstanceMetadata`), acquires a recording resource from Agora, mints a long-lived RTC token for the recording bot uid, starts mix mode recording with HLS + MP4 output to S3-compatible storage, and writes a `class_recording_sessions` row.
- `supabase/functions/agora-recording-stop/index.ts` — stops the active recording.
- `supabase/functions/agora-recording-webhook/index.ts` — receives Agora callbacks (uploaded, failed, etc.) and updates `class_recording_sessions.status` + `class_instances.metadata.class_recording`.
- `supabase/functions/agora-recording-reconciler/index.ts` — periodic sweep that catches sessions stuck in non-terminal states.

Database:

- `public.class_recording_sessions` — control-plane state machine (`acquiring → starting → recording → stopping → stopped → uploading → ready | failed`). RLS is enabled with no policies; only service_role writes.
- Storage bucket `class-recordings` (set up under `supabase/migrations/2026080{8,9}120000_class_recordings_storage_*.sql`).
- Public-facing UX reads `class_instances.metadata.class_recording` (parsed by `parseClassRecordingFromInstanceMetadata` in `src/types/live-session-invite.ts`).

Required server-only env vars (in addition to `AGORA_APP_ID` / `AGORA_APP_CERTIFICATE`):

```bash
AGORA_CUSTOMER_ID=
AGORA_CUSTOMER_SECRET=
AGORA_RESTAPI_BASE=        # optional; default https://api.sd-rtn.com
AGORA_STORAGE_REGION=      # optional integer string; default 0
SUPABASE_S3_BUCKET=
SUPABASE_S3_ENDPOINT=
SUPABASE_S3_ACCESS_KEY_ID=
SUPABASE_S3_SECRET_ACCESS_KEY=
```

Relevant files:

- `src/components/dashboard/dashboard-live-video-dock.tsx` (start trigger + status polling)
- `src/components/dashboard/dashboard-shell.tsx` (stop trigger on host end)
- `src/features/live-video/shells/AsyncPlaybackShell.tsx` (consumes the resulting recording for replay)
- `src/types/live-session-invite.ts` (`parseClassRecordingFromInstanceMetadata`)
- `supabase/migrations/20260810120000_create_class_recording_sessions.sql`
- `supabase/migrations/20260812120000_class_recording_sessions_reconciler_index.sql`

## Class Draft-Deck Merge

Class instances support an editor "draft deck" that is authored before any live session exists. The draft is stored in `live_session_deck_items` under the synthetic `session_id = bb-class-deck:<class_instance_id>` namespace.

When the host enters a class-started live session, `DashboardLiveVideoDockRouter` (after a successful `live_session_create`) calls `copy_class_deck_to_live_session(p_class_instance_id, p_live_session_id)` once per dock mount. The RPC:

- Holds an advisory transaction lock keyed on the live session id to serialize concurrent host retries.
- Returns `-1` if the live session already has any deck rows (idempotent skip), so the merge is safe to call repeatedly.
- Otherwise copies `task_id`, `sort_order`, and `session_task_metadata` from the draft into the live session.
- Runs as `SECURITY INVOKER`; bubble-derived RLS on `live_session_deck_items` governs who may read/write.

Relevant files:

- `src/features/live-video/shells/huddle/live-deck-merge.ts`
- `src/components/dashboard/dashboard-live-video-dock.tsx`
- `src/lib/fitness/class-deck-builder-session-id.ts`
- `supabase/migrations/20260807120000_copy_class_deck_to_live_session_rpc.sql`

## Identifier Model

The deployed system carries four distinct ids on the live-video hot path. Treat them as separate concepts; do not assume any pair of them are interchangeable.

| Identifier    | Shape                                                                      | Created by                                                         | Used as                                                                                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sessionId`   | UUID v4 (`crypto.randomUUID()`)                                            | `ChatArea.tsx` (chat invite path), card / class metadata otherwise | `liveVideoStore.activeSession.sessionId`, `live_sessions.id`, `live_session_deck_items.session_id`, Supabase Realtime topic `room-session:${workspaceId}:${sessionId}`, `LiveSessionRuntimeProvider.sessionId` |
| `channelId`   | `bb-live-${workspaceId}-${shortId}` (validated by `^[a-zA-Z0-9_-]{1,64}$`) | `ChatArea.tsx` (`shortId` is 8 hex chars derived from `sessionId`) | Agora `client.join`, `/api/live-video/token` channelId field, never used as a Postgres id                                                                                                                      |
| Agora `uid`   | Unsigned 32-bit int from `agoraUidFromUuid(auth.uid)`                      | `src/lib/live-video/agora-uid.ts`                                  | Agora token mint, Agora tile identity, `live_session_participants.agora_uid` (string-coerced)                                                                                                                  |
| Deck row `id` | UUID                                                                       | DB default on `live_session_deck_items`                            | `state.activeDeckItemId` broadcast value, `WorkoutDeckSelectionProvider` snapshot key, participant overlay match                                                                                               |

Key invariants:

- `live_sessions.id === sessionId` (UUID), **not** the Agora channel id.
- `live_session_deck_items.session_id === sessionId` (text-typed but holds the same UUID, plus the `bb-class-deck:<class_instance_id>` synthetic value for class drafts).
- `channelId` is opaque to Postgres; the durable session registry never stores it.
- `agora_uid` is the only id that appears in Agora's RTC events; map back to `auth.uid()` via the participant row, not by re-computing the hash on the client.

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

When the client sends **`sessionId`** with **`workspaceId`**, the token route enforces **Tier C**: the user must pass `public.can_join_live_session` (durable `live_sessions` row, host or `live_session_participants`, and for participants a **valid workspace subscription** on paid categories — `trialing` / `active` — via `get_workspace_subscription_status`). Without `sessionId`, behavior stays workspace-membership + channel validation only (e.g. dev scaffold).

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

Several live video tripwire logs are intentionally still present. The table below tracks which gating each log uses today; future cleanup should converge them all on `process.env.NODE_ENV === 'development'` or remove them.

| Log string                                                                     | File                                                                                 | Gated to dev?                                     |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------ |
| `[DEBUG] AgoraSessionProvider Mounted - Initializing connection bounds`        | `src/features/live-video/AgoraSessionProvider.tsx` (mount effect)                    | No (unconditional)                                |
| `[DEBUG] AgoraSessionProvider Unmounted - TRIPPING DISCONNECT / Cleanup`       | `src/features/live-video/AgoraSessionProvider.tsx` (`leaveChannel`)                  | No (unconditional)                                |
| `[DEBUG] Toggling media: type=audio                                            | video, newState=enabled                                                              | disabled`                                         | `src/features/live-video/AgoraSessionProvider.tsx` (`toggleMic` / `toggleCamera`) | No (unconditional) |
| `[DEBUG] Token fetched successfully`                                           | `src/features/live-video/AgoraSessionProvider.tsx` (`joinChannel` after token parse) | No (unconditional)                                |
| `[DEBUG] BaseVideoHarness Rendered with child shell:`                          | `src/features/live-video/BaseVideoHarness.tsx`                                       | No (unconditional)                                |
| `[DEBUG] DashboardLiveVideoDockRouter Render - Role: …`                        | `src/components/dashboard/dashboard-live-video-dock.tsx`                             | Dev only                                          |
| `[DEBUG] LiveVideoSessionShell Rendered - Layout Plan applied`                 | `src/features/live-video/theater/live-video-session-shell.tsx`                       | Dev only                                          |
| `[DEBUG] Token API hit for channel:`                                           | `src/app/api/live-video/token/route.ts`                                              | Dev only                                          |
| `[DEBUG][API] Tier C: …` (session 404 / forbidden / channel-binding tripwires) | `src/app/api/live-video/token/route.ts`                                              | Dev only                                          |
| `[DEBUG][LiveVideo Token] 404 from token API; retrying…`                       | `src/features/live-video/AgoraSessionProvider.tsx`                                   | Dev only                                          |
| `[DEBUG] useSessionState broadcast received: …`                                | `src/features/live-video/hooks/useSessionState.ts` (incoming broadcast)              | Dev only                                          |
| `[DEBUG] Participant received active item:`                                    | `src/features/live-video/hooks/useSessionState.ts` (incoming broadcast, participant) | Dev only                                          |
| `[DEBUG] useSessionState setAspectRatio (host): ratio=…`                       | `src/features/live-video/hooks/useSessionState.ts` (host setter)                     | Dev only                                          |
| `[DEBUG] Host broadcast active item:`                                          | `src/features/live-video/hooks/useSessionState.ts` (host setter)                     | Dev only                                          |
| `[DEBUG][LiveVideo State] Evaluating broadcast generation: …`                  | `src/features/live-video/hooks/useSessionState.ts` (incoming broadcast)              | No (unconditional — generation enforcer tripwire) |
| `[DEBUG][LiveVideo State] Dropped stale out-of-order broadcast.`               | `src/features/live-video/hooks/useSessionState.ts` (incoming broadcast)              | No (unconditional — generation enforcer tripwire) |

Keep them stable while debugging lifecycle behavior; the generation-enforcer tripwires in particular are intentionally unconditional so out-of-order drops are visible without rebuilding.

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

- **Tier C (when `sessionId` is sent):** token issuance requires an existing `live_sessions` row and a passing `can_join_live_session` check (host always; participants must be in `live_session_participants` and, on paid workspace categories, the workspace subscription must be `trialing` or `active`). **`channelId` binding to the session is still a logged tripwire only** until `live_sessions` stores a canonical channel id.
- Supabase Realtime broadcasts are best-effort (`ack: false`); participants request sync on subscribe, but delivery ordering is still eventual.
- `SessionState.generation` is now compared on incoming broadcasts to drop strictly older payloads (see `useSessionState.handleIncomingStateBroadcast`), but it is still only incremented inside `endSession`. Other transitions reuse the previous generation, so the check protects against full-session-reset reordering only — not against intra-session pause/resume or active-deck-item reordering.
- Participant clocks are approximate and use host broadcast timestamps, not NTP-grade synchronization.
- `agora-access-token` is still used for server token generation, with a code comment noting a future migration to `agora-token`.
- Media connection state and workout session state are deliberately separate; leaving Agora video does not necessarily end the shared workout or mark invite metadata ended.
- Only the `workout` mode is implemented at the `liveVideoStore` / invite-metadata level. Wrapper kinds (`amrap`, `amrap_minimal`, `simple_countdown`) are layered on top via `live_sessions.interval_wrapper_kind`.
- The durable `live_sessions` and `live_session_participants` rows have no `closed_at` column and no reaper; they accumulate indefinitely.
- Participant `live_session_participant_join` retries up to 24 times at 150 ms before silently giving up; if the host has not yet executed `live_session_create`, the participant will see no error surface and must leave/rejoin.
- Cloud recording start/stop is host-triggered without an explicit consent UX for participants.
- Debug logging remains in live paths while the feature stabilizes; see the Debug Logging table for current gating per log line.

## Extension Notes

When extending live video:

- Keep Agora connection lifecycle inside `AgoraSessionProvider` or a hook owned by it.
- Keep UI shells behind the shared provider/context boundary.
- Keep the dashboard dock under `ThemeScope`.
- Do not expose Agora certificate, Supabase service role, or any server-only key to the browser.
- Preserve the `metadata.live_session` parser as the compatibility boundary for chat, task, and class invite surfaces.
- Treat `sessionId` as the durable app-level session key and `channelId` as the Agora RTC channel key.
- Use persisted `live_session_deck_items.id` values when syncing active workout cards to participants.
