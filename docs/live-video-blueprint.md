# Live video (Agora) — BuddyBubble blueprint

**Status:** **Browser RTC + remote participants** — same provider plus `user-published` / `user-unpublished` / `user-left` → `subscribe` / `unsubscribe`, context **`remoteUsers`**, [`RemoteVideoPreview`](src/features/live-video/RemoteVideoPreview.tsx) tiles in the harness. Server token + certificate unchanged.  
**Purpose:** Single reference for humans and coding agents. Use **absolute paths** in BuddyBubble when reviewing or extending this feature. Do not copy legacy Interval Timers code verbatim; reuse ideas (token boundary, lifecycle) only.

---

## Revised Cursor / agent prompt (use this verbatim for scaffolding tasks)

We are introducing an **Agora WebRTC**-backed live video surface into BuddyBubble. The goal is an **immersive, native embed** that inherits **category theme tokens** from `ThemeScope` (see `src/components/theme/ThemeScope.tsx`). We are building a **highly extensible “base video shell”** that will eventually host different interactive layouts (workouts, kids’ games, etc.) behind one **shared Agora connection manager**.

**Constraints**

- **Do not** copy-paste legacy app files. New code lives under `src/features/live-video/`.
- **CSP / connect-src:** The app does not ship a restrictive `connect-src` by default ([`next.config.ts`](next.config.ts) only adds optional `frame-ancestors`). If you add a global CSP later, allow Agora signaling / TURN / WebSocket hosts per Agora Web SDK docs.
- **Permissions:** `joinChannel` triggers the browser mic/camera prompt via `createMicrophoneAndCameraTracks` after a successful token response and **before** `publish`. Denial sets `joinError` (see context); user can retry after fixing OS/browser permissions.
- **ThemeScope:** `ThemeScope` uses `display: contents`; it injects CSS variables only. The live subtree must remain a **descendant** of the dashboard `ThemeScope` (today: anything rendered inside `DashboardShell` under `src/components/dashboard/dashboard-shell.tsx` lines ~902–1205, including routed `{children}`).
- **Tripwire logs (mandatory for lifecycle debugging):** Keep these exact strings until the feature is stable, then gate behind `process.env.NODE_ENV === 'development'` or remove:
  - On provider mount: `[DEBUG] AgoraSessionProvider Mounted - Initializing connection bounds`
  - Inside `leaveChannel` when disconnecting: `[DEBUG] AgoraSessionProvider Unmounted - TRIPPING DISCONNECT / Cleanup`
  - On harness render: `[DEBUG] BaseVideoHarness Rendered with child shell:` + second argument (child shell name or `'none'`)
  - Token API (server): `[DEBUG] Token API hit for channel:` + channel id (never log certificate or token)
  - After successful token response (client): `[DEBUG] Token fetched successfully`
  - When toggling local mic/camera send (`setEnabled` in `AgoraSessionProvider`): `[DEBUG] Toggling media: type=audio|video, newState=enabled|disabled` (client-side only; not a server audit log)
- **Child shell logging:** `children?.type?.name` only works for a **single React element** whose `type` is a function/class. Fragments, arrays, strings, or multiple children log as `'none'` — that is expected; use a single named component as the shell for debugging.

**Deliverables**

1. `**src/features/live-video/`\*\* — feature module (provider, harness, barrel `index.ts`).
2. `**AgoraSessionProvider.tsx**` — Session manager: token `fetch` → dynamic `import('agora-rtc-sdk-ng')` → publisher: `createMicrophoneAndCameraTracks` → `createClient` → `join` → bind remote listeners → `publish`; subscriber: `join` → bind listeners. Context: `localVideoTrack`, `joinError`, **`remoteUsers`**, **`role`**, **`isMicMuted` / `isCameraOff`**, **`toggleMic` / `toggleCamera`** (publisher + connected: `ILocalTrack.setEnabled` on ref tracks; state reset on `leaveChannel`). Remote audio: after `subscribe` for `mediaType === 'audio'`, **`user.audioTrack?.play()`**. **`leaveChannel` / unmount:** remove remote listeners → clear `remoteUsers` → local `unpublish` (if published) → `localAudioTrack.close()` → `localVideoTrack.close()` → `client.leave()` (see implementation), plus abort/`joinSeq`.
3. `**BaseVideoHarness.tsx`** + **`LocalVideoPreview.tsx`** + **`RemoteVideoPreview.tsx`** — Local + mapped remote video tiles (`data-live-video-stage` wraps the strip); local/remote use `play` / `stop` in effects; track `close` stays on provider leave. Harness: mic/camera icon buttons (disabled unless connected publisher with a local video track). **`LocalVideoPreview`**: optional overlays for camera-off / mic-muted. **`RemoteVideoPreview`\*\*: “No video” vs “Camera off” when the remote video track is missing vs disabled (`enabled === false`), optional remote mic-off badge from `audioTrack`; `track-updated` listeners keep overlays in sync when the sender toggles without unpublishing.
4. **Unmount safety:** `useEffect` in the provider must **call `leaveChannel` on unmount** so in-flight token fetches, WebRTC session, and camera/mic hardware are released.
5. **Verification route:** `src/app/(dashboard)/app/[workspace_id]/live-video-scaffold/page.tsx` — mounts `LiveVideoScaffoldClient` (Supabase `getUser` + mock timer session id) → `AgoraSessionProvider` + **`WorkoutTimerShell`** (`BaseVideoHarness` + shared timer HUD) **inside** existing `ThemeScope` (via shell `children`) for manual QA.

---

## Absolute paths (BuddyBubble)

| Role                                   | Path                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Theme variable scope                   | `/Users/justinfassio/Local Sites/BuddyBubble/src/components/theme/ThemeScope.tsx`                                                    |
| Dashboard shell (ThemeScope + layout)  | `/Users/justinfassio/Local Sites/BuddyBubble/src/components/dashboard/dashboard-shell.tsx`                                           |
| Resizable Messages / board split       | `/Users/justinfassio/Local Sites/BuddyBubble/src/components/dashboard/workspace-main-split.tsx`                                      |
| Chat column                            | `/Users/justinfassio/Local Sites/BuddyBubble/src/components/chat/ChatArea.tsx`                                                       |
| Workspace + bubble selection (Zustand) | `/Users/justinfassio/Local Sites/BuddyBubble/src/store/workspaceStore.ts`                                                            |
| **Live video feature**                 | `/Users/justinfassio/Local Sites/BuddyBubble/src/features/live-video/`                                                               |
| **Agora dynamic import**               | `/Users/justinfassio/Local Sites/BuddyBubble/src/features/live-video/load-agora.ts`                                                  |
| **Local preview UI**                   | `/Users/justinfassio/Local Sites/BuddyBubble/src/features/live-video/LocalVideoPreview.tsx`                                          |
| **Remote user listeners**              | `/Users/justinfassio/Local Sites/BuddyBubble/src/features/live-video/agora-remote-user-listeners.ts`                                 |
| **Remote preview UI**                  | `/Users/justinfassio/Local Sites/BuddyBubble/src/features/live-video/RemoteVideoPreview.tsx`                                         |
| **RTC token API**                      | `/Users/justinfassio/Local Sites/BuddyBubble/src/app/api/live-video/token/route.ts`                                                  |
| **Agora UID helper (server)**          | `/Users/justinfassio/Local Sites/BuddyBubble/src/lib/live-video/agora-uid.ts`                                                        |
| **Scaffold page**                      | `/Users/justinfassio/Local Sites/BuddyBubble/src/app/(dashboard)/app/[workspace_id]/live-video-scaffold/page.tsx`                    |
| **Scaffold client (timer + auth)**     | `/Users/justinfassio/Local Sites/BuddyBubble/src/app/(dashboard)/app/[workspace_id]/live-video-scaffold/LiveVideoScaffoldClient.tsx` |
| **Workout timer shell**                | `/Users/justinfassio/Local Sites/BuddyBubble/src/features/live-video/shells/WorkoutTimerShell.tsx`                                   |
| **Timer display (rAF)**                | `/Users/justinfassio/Local Sites/BuddyBubble/src/features/live-video/shells/TimerDisplay.tsx`                                        |
| **Live video session store (Zustand)** | `/Users/justinfassio/Local Sites/BuddyBubble/src/store/liveVideoStore.ts`                                                            |
| **Dashboard live video dock**          | `/Users/justinfassio/Local Sites/BuddyBubble/src/components/dashboard/dashboard-live-video-dock.tsx`                                 |
| **Chat invite metadata + parser**      | `/Users/justinfassio/Local Sites/BuddyBubble/src/types/live-session-invite.ts`                                                       |
| **Chat live-session card**             | `/Users/justinfassio/Local Sites/BuddyBubble/src/components/chat/LiveSessionMessageCard.tsx`                                         |
| **End invite message (host leave)**    | `/Users/justinfassio/Local Sites/BuddyBubble/src/lib/mark-live-session-invite-ended.ts`                                              |
| This blueprint                         | `/Users/justinfassio/Local Sites/BuddyBubble/docs/live-video-blueprint.md`                                                           |

**Legacy reference (ideas only, do not copy):** Interval Timers trainer live Agora helpers live under that repo’s `apps/app/src/lib/trainer-live/agora.ts`, `TrainerLiveAgoraContext.tsx`, and `useTrainerLiveAgoraChannel.ts`.

---

## Architecture notes

1. **Connection manager vs UI shells** — Keep **join/leave, tokens, tracks, remote user list** in the provider (or a dedicated hook used by the provider). `BaseVideoHarness` should stay a **layout + stage**; interactive modes pass **children** or lazy-loaded shell components.
2. **Where to mount for production** — **Dashboard:** [`DashboardLiveVideoDock`](src/components/dashboard/dashboard-live-video-dock.tsx) renders inside [`dashboard-shell.tsx`](src/components/dashboard/dashboard-shell.tsx) under `ThemeScope`, in a **main-column wrapper** (`flex-1 flex-col`) **above** [`WorkspaceMainSplit`](src/components/dashboard/workspace-main-split.tsx) (~lines 1021–1118). Session state lives in [`liveVideoStore`](src/store/liveVideoStore.ts) (`joinSession` / `leaveSession`); **Leave** in [`BaseVideoHarness`](src/features/live-video/BaseVideoHarness.tsx) calls optional `onAfterLeave` so the dock unmounts and Agora cleanup runs. **Scaffold:** [`live-video-scaffold/page.tsx`](<src/app/(dashboard)/app/[workspace_id]/live-video-scaffold/page.tsx>) remains a standalone QA route.
3. **Chat-based discovery** — Host uses **Start live workout** in [`RichMessageComposer`](src/components/chat/RichMessageComposer.tsx) (wired from [`ChatArea`](src/components/chat/ChatArea.tsx)): inserts a bubble `messages` row with `metadata.live_session` (`LiveSessionInvitePayload` in [`live-session-invite.ts`](src/types/live-session-invite.ts)), then calls `joinSession` with `inviteMessageId` so **Leave** can merge `endedAt` via [`markLiveSessionInviteMessageEnded`](src/lib/mark-live-session-invite-ended.ts) (author-only `messages` update RLS). Recipients see [`LiveSessionMessageCard`](src/components/chat/LiveSessionMessageCard.tsx) in the feed ([`ChatMessageRow`](src/components/chat/ChatMessageRow.tsx)); **Join** calls `joinSession` without `inviteMessageId`. Agora `channelId` uses prefix `bb-live-${workspaceId}-${shortId}` (must satisfy [`CHANNEL_ID_PATTERN`](src/app/api/live-video/token/route.ts)).
4. **Secrets** — Agora **App Certificate** stays server-side only (`AGORA_APP_CERTIFICATE` in `.env.example`). **`AGORA_APP_ID`** is server-only for token minting; the token response echoes **`appId`** for the browser client join. The browser receives **short-lived RTC tokens** from **`POST /api/live-video/token`** (Supabase session + optional `workspaceId` membership check). Never log tokens or the certificate.

---

## Changelog

- **Initial:** Mock `AgoraSessionProvider`, `BaseVideoHarness`, scaffold route, tripwire logs.
- **Token trust boundary:** `agora-access-token` on the server, `POST /api/live-video/token`, `agoraUidFromUuid`, provider `fetch` + AbortController, env vars in `.env.example`, extra tripwires for token path.
- **Browser SDK:** `agora-rtc-sdk-ng` ^4.x, `loadAgoraRTC()` dynamic import, join pipeline + `joinError` / `localVideoTrack` on context, `LocalVideoPreview` for stage, strict `unpublish` → `close()` ×2 → `leave()` cleanup contract in `leaveChannel`.
- **Remote multiplayer:** `bindRemoteUserListeners` (`user-published` / `unpublished` / `left`), `remoteUsers` state, `detachRemoteListeners` before `leave` / failed join teardown, `RemoteVideoPreview` + harness grid.
- **Media privacy (local):** context `isMicMuted` / `isCameraOff` + `toggleMic` / `toggleCamera` via `setEnabled` on local ref tracks; harness controls; local/remote preview overlays; `[DEBUG] Toggling media:` tripwire.
- **Workout timer shell:** `WorkoutTimerShell` + `TimerDisplay` (local `requestAnimationFrame` for `MM:SS.T`), Supabase broadcast via `useSharedTimerSync`, host-only Start/Pause/Reset; scaffold uses `scaffold-demo-session` and signed-in user as mock host.
- **Dashboard integration:** `liveVideoStore` + dock above `WorkspaceMainSplit`; dev-only “Start live video” CTA; `onAfterLeave` on `BaseVideoHarness` clears store so the session unmounts after Agora Leave.
- **Chat invites:** `messages.metadata.live_session`, `useMessageThread.sendMessage` optional `metadata`, composer video action + `ChatArea` host join, feed card + realtime `UPDATE` for `endedAt`, `activeSession.inviteMessageId` for host PATCH on leave.
