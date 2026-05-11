Live Video — Architectural Assessment and Gap Analysis
I read docs/live-video/readme.md and then walked the deployed code paths under src/features/live-video/, src/components/dashboard/, src/app/api/live-video/token/, src/types/live-session-invite.ts, the Supabase migrations under supabase/migrations/2026\*, and the Agora cloud-recording Edge Functions. The doc is mostly accurate as a description of the workout-huddle slice, but the deployed system has grown several subsystems the doc doesn't acknowledge, and there are a few real architectural risks worth flagging.

## Resolution Log

This document is a living record. The "Foundational P1/P3 Cleanup" pass landed the following:

- **§2 Subsystems the doc omits — RESOLVED.** docs/live-video/readme.md now has dedicated sections for Durable Session Registry, Interval Wrappers, AMRAP Feature Module, Cloud Recording, Class Draft-Deck Merge, and Identifier Model. The "Architecture" framing was updated to call out the durable registry as a fourth layer.
- **§3 Stale identifier comments — RESOLVED.** src/features/live-video/agora-session-context.tsx now states the channel id is `bb-live-${workspaceId}-${shortId}` and is NOT `public.live_sessions.id`. src/features/live-video/wrappers/types.ts now documents `liveSessionId` as the durable session UUID, explicitly distinguished from the Agora channel id.
- **§4.2 SessionState.generation is documented but inert — PARTIALLY RESOLVED.** `useSessionState.handleIncomingStateBroadcast` now compares incoming vs current `generation` and drops strictly older broadcasts, with two unconditional `[DEBUG][LiveVideo State]` tripwires for visibility. **Remaining gap:** `generation` is still only incremented in `endSession`, so the enforcer protects against full-session-reset reordering only — not against intra-session reordering of pause/resume or `setActiveDeckItem`. To fully close §4.2, increment `generation` on every state-machine transition (or migrate intra-session ordering to a vector clock / per-field generation).
- **§6 Documentation drift — RESOLVED.** Readme now includes Known Limitations updates (token-route scope, partial generation enforcement, no durable session close, 24-step participant join retry without surface error, no recording consent UX) and a Debug Logging table that marks each tripwire as dev-gated or unconditional, including the two new generation-enforcer logs.

Items still open after this pass: §4.1 (token route session-scoped auth), §4.3 (host re-broadcast loop), §4.4 (durable lifecycle close), §4.5 (host-end ordering), §4.6 (`AGORA_APP_ID` exposure note), §4.7 (gating remaining unconditional debug logs), §4.8 (deck-item deletion races), §4.9 (24× retry surface), §5 (test coverage). All of §7 P1 items 2–4 are still outstanding; P1 item 1 is partially landed (see §4.2 above) and P1 item 5 (stale comments) is done.

1. What the doc describes well
   The three "independent state layers" framing (liveVideoStore, AgoraSessionProvider, useSessionState) matches the code 1:1: src/store/liveVideoStore.ts, src/features/live-video/AgoraSessionProvider.tsx, src/features/live-video/hooks/useSessionState.ts.
   The Agora lifecycle invariants (token fetch → dynamic SDK import → tracks → join → publish → strict cleanup with joinSeqRef/AbortController) are accurately described and the implementation matches the contract.
   Token route boundary — server-only AGORA_APP_CERTIFICATE, channel-id regex, role parse, deterministic UID via agoraUidFromUuid — matches src/app/api/live-video/token/route.ts and src/lib/live-video/agora-uid.ts.
   The deck persistence model (live_session_deck_items + task_assignees + assign_user_to_session_deck) and the bubble-derived RLS via get_task_bubble_id are correctly summarized.
   Invite-metadata parsers (metadata.live_session on chat / task / class instance) and host-end cleanup helpers (markLiveSessionInviteMessageEnded, markTaskLiveSessionEnded, markClassInstanceLiveSessionEnded) match src/types/live-session-invite.ts and src/lib/mark-card-live-session-ended.ts.
2. Subsystems the doc omits (largest gap)
   The "Status" and "Architecture" sections describe a feature with three layers and a single workout mode, but the code in production has at least four additional subsystems wired into the same surface:

2.1 Durable session registry (live_sessions + live_session_participants)
There is a whole P0/P3 control plane the doc never references:

supabase/migrations/20260730120000_create_live_sessions_and_participants.sql (tables + RLS + is_live_session_participant helper + host_attach_amrap_session).
supabase/migrations/20260730120100_live_session_join_hints.sql (get_live_session_join_hints).
supabase/migrations/20260731120000_live_session_lifecycle_rpcs.sql (live_session_create, live_session_participant_join, live_session_list_participants, plus agora_uid column).
supabase/migrations/20260802120000_live_sessions_realtime.sql (postgres_changes on live_sessions).
These are on the hot path of the dashboard dock today. DashboardLiveVideoDockRouter calls live_session_create (host) or retries live_session_participant_join (participant) up to 24 times before flipping liveDbReady → true (src/components/dashboard/dashboard-live-video-dock.tsx lines 196‑276), and LiveSessionView reads get_live_session_join_hints and live_session_list_participants to drive interval-wrapper selection and host-tile identity (src/features/live-video/shells/huddle/LiveSessionView.tsx lines 192‑268).

The doc's "Architecture has three independent state layers" claim is therefore incomplete — there is a fourth layer: a durable Postgres session registry that gates the AMRAP / wrapper UX and the participant roster.

2.2 Interval-wrapper plug-in system
src/features/live-video/wrappers/registry.tsx defines a kind→component registry (simple_countdown, amrap, amrap_minimal) consumed by LiveSessionView. The doc's "Workout Huddle UI" section walks through host pre-join, participant pre-join, and connected huddle, but does not mention:

WrapperAttachContext / getIntervalWrapper / WrapperErrorBoundary.
The interval*wrapper_kind / interval_wrapper_config fields on live_sessions.
host_attach_amrap_session RPC.
The theater_board_split shell preference inside the huddle (different from the dashboard split plan).
2.3 AMRAP subsystem (src/features/amrap/\*\*)
There are 24 files under src/features/amrap/ (engine, hooks, leaderboard, video background, log-round overlays, results drawer) and six amrap*\* migrations. The doc only mentions phase: 'amrap' in passing as a session phase enum value. The fact that AMRAP is a fully separate feature module integrated into live video via the wrappers registry is not mentioned anywhere.

2.4 Agora cloud recording
A complete recording control plane exists and is invoked from the dashboard dock:

Edge functions: agora-recording-start, agora-recording-stop, agora-recording-webhook, agora-recording-reconciler.
Migration: 20260810120000*create_class_recording_sessions.sql (state machine: acquiring → starting → recording → stopping → stopped → uploading → ready | failed).
dashboard-live-video-dock.tsx polls class_instances.metadata.class_recording.status every 15s while processing and propagates hostClassRecordingProcessing into LiveSessionView.
dashboard-shell.tsx wires agora-recording-stop into onHostEndLiveSessionForAll.
Storage: class-recordings bucket (20260808/9120000_class_recordings_storage*\*.sql), reconciler index (20260812120000_class_recording_sessions_reconciler_index.sql).
This is a major surface (with security-sensitive Agora customer credentials and S3 storage) that the readme does not mention.

2.5 Class draft-deck merge
copy_class_deck_to_live_session (migration 20260807120000) and live-deck-merge.ts are invoked by the host when entering a class-started session, copying rows from bb-class-deck:<class_instance_id> into the live sessionId. The doc's "Card or class-started workout" section does not mention this draft-deck → live-deck merge or the bb-class-deck: namespace.

2.6 Async (recorded-class) playback shell
AsyncPlaybackShell.tsx (rendered by dashboard-shell.tsx when ?class_async_player=<uuid>) is a sibling deck-driven UX with no Agora at all. It is referenced in the dashboard but absent from the live-video readme.

3. Identifier model is more complex than the doc suggests
   The "Extension Notes" line at the bottom is right that sessionId is the durable app key and channelId is the Agora RTC key, but the deployed system actually has four identifiers in flight, with at least one stale comment in the code:

Identifier Shape Source Used by
sessionId
UUID (crypto.randomUUID)
ChatArea.tsx:679
live_sessions.id, deck session_id, runtime LiveSessionRuntimeProvider, broadcast topic
channelId
bb-live-${workspaceId}-${shortId} (≤ 64 chars)
ChatArea.tsx:681
Agora client.join, token route validation
Agora uid
agoraUidFromUuid(auth.uid)
src/lib/live-video/agora-uid.ts
Agora token + tile identity, live_session_participants.agora_uid
Deck row id
UUID
DB default
state.activeDeckItemId, participant overlay match
Two source comments contradict this and should be fixed: — RESOLVED

src/features/live-video/agora-session-context.tsx:7-8 — "Agora channel id; aligns with public.live\*sessions.id when that row exists." Wrong: live_sessions.id is the UUID sessionId, not the bb-live-… channel string. — Now reads: "Agora channel id; this is typically a string like `bb-live-${workspaceId}-${shortId}` and is NOT `public.live_sessions.id`. The durable session row is keyed by `sessionId` (a UUID held in `liveVideoStore.activeSession.sessionId`), not by this channel string."
src/features/live-video/wrappers/types.ts:8 — /\** Agora channel id === live*sessions.id \*/. Same mistake. LiveSessionView.tsx:177 already correctly notes the liveSessionId it passes is the row UUID, "not Agora channelId". — Now reads: "Durable session UUID; matches `public.live_sessions.id` and the broadcast `sessionId`. This is NOT the Agora channel id — the channel is the opaque `bb-live-…` string passed to `AgoraSessionProvider`."
The readme now has a dedicated "Identifier Model" section listing all four ids and which surface owns each.

4. Real architectural risks
   4.1 Token authorization is workspace-level, not session-level
   The doc calls this out in "Known Limitations", but it deserves more weight. src/app/api/live-video/token/route.ts only requires:

The user is authenticated.
channelId matches ^[a-zA-Z0-9_-]{1,64}$.
If a workspaceId is supplied, the user has a workspace_members row.
There is no check that the user was actually invited to this sessionId / channelId. Any workspace member who learns or guesses a channel id (bb-live-${workspaceId}-${shortId} is 8 hex chars of randomness ≈ 32 bits) can mint a publisher token and join. With workspace_members typically including dozens of accounts and channel ids broadcast as plaintext in chat metadata, this isn't a serious active risk today, but it is a real future risk for private bubbles or ticketed classes. The durable live_sessions / is_live_session_participant infrastructure already exists; the token route should consult it (or a ?sessionId= parameter) before issuing publisher tokens for non-host roles, especially for class instances.

4.2 Session-level "generation" counter is documented but inert — PARTIALLY RESOLVED
SessionState.generation is documented as "Monotonic generation counter to help clients ignore stale out-of-order events" (sessionStateMachine.ts:22). In practice:

It is only incremented in endSession (sessionStateMachine.ts:117).
It is never compared against prev.generation in useSessionState.handleIncomingStateBroadcast. — RESOLVED in this pass: the handler now coerces both sides to numbers, logs `[DEBUG][LiveVideo State] Evaluating broadcast generation:` with `{ incoming, current }`, and drops the broadcast (with a `[DEBUG][LiveVideo State] Dropped stale out-of-order broadcast.` log) when `incoming < current`. Tripwires are intentionally unconditional so production drops are visible without a rebuild.
The only consumers are a debug log and WorkoutTimerShell's status banner.
Out-of-order broadcasts will silently overwrite local state.

Remaining gap: because `generation` only increments in `endSession`, the enforcer only protects against a stale broadcast from a previous session being applied after a fresh `endSession`. Intra-session reordering of pause/resume / `setActiveDeckItem` still passes through (incoming generation equals current). To fully close this, either bump `generation` on every transition in `sessionStateMachine.ts` or move intra-session ordering to a per-field/vector-clock model. There is a separate generation field in shared-timer-sync.types.ts (used by useSharedTimerSync) which is meaningfully checked, so the naming collision is also a footgun.

4.3 Realtime delivery is best-effort with no host re-broadcast loop
useSessionState configures { broadcast: { ack: false } } and relies on a single SYNC_REQUEST from each participant on subscribe. If the host is offline or the network drops during the participant's first subscribe(), the participant has no retry mechanism — syncRequestSentRef is set to true after one send. The retry logic in subscribeAttempt resets it on reconnect, but there is no periodic resync, no host-side resend on long pauses, and no application-level message ack. For workout phases this is usually fine (state changes are infrequent), but pause/resume and setActiveDeckItem events are user-visible single events that can be lost.

The live_sessions.interval_wrapper_kind UPDATE fallback in LiveSessionView.tsx:191-222 is the right pattern; consider applying it to phase/active-deck-item by either persisting them on live_sessions or making the host occasionally rebroadcast (e.g. on visibility change or on first remote-user join event from Agora).

4.4 No durable lifecycle close
Nothing deletes or marks closed in live_sessions / live_session_participants after a session ends. endSession in the state machine resets SessionState, the dock unmounts, the chat invite gets endedAt, and agora-recording-stop is invoked, but the rows in live_sessions and live_session_participants accumulate indefinitely. There's also no ended_at column on live_sessions. If this feature scales, you will need either a closed_at column (with retention) or a periodic reaper Edge Function. Worth adding to "Known Limitations".

4.5 Cleanup ordering on host-end
onHostEndLiveSessionForAll in dashboard-shell.tsx:736-775 calls agora-recording-stop before marking the invite ended, but only when sourceInstanceId is truthy. If agora-recording-stop hangs (it's a network call into Agora REST), participants can re-click Join from the chat card during the wait. Consider marking endedAt first (cheap, idempotent) and then firing the recording-stop request.

4.6 AGORA_APP_ID exposure footprint
Even though the certificate stays server-side, the token route returns appId to the browser. That's fine for Agora's design, but the readme says AGORA_APP_ID is "server-only" — strictly speaking, it is also delivered to every authenticated browser via the token response. Worth clarifying in the doc to avoid confusion when someone tries to gate it.

4.7 Debug logs still unconditional in hot paths
Per the doc, several [DEBUG] strings are kept "until the feature stabilizes." Currently, AgoraSessionProvider mount/leave logs and toggleMic / toggleCamera logs (AgoraSessionProvider.tsx:107, 144, 161, 360), the BaseVideoHarness render log, and dashboard-live-video-dock.tsx:295 are unconditional console.logs in production. The token route already gates its own [DEBUG] Token API hit for channel: to dev. Recommend the readme either (a) update the list to mark which are still unconditional vs. dev-only, or (b) add a tracking item to gate the remaining ones now that durable sessions are in production.

4.8 Deck-item id lifecycle and deletion races
live_session_deck_items RLS DELETE only requires can_write_bubble, which means any host or co-editor can delete a deck row. Participants cache state.activeDeckItemId (the row id) and withSessionDeckDisplayTasks returns null tasks for orphaned rows. If the host deletes the row while it's the active item, participants will see state.activeDeckItemId referencing a non-existent row until the next host broadcast. Not catastrophic, but worth explicitly handling in LiveSessionView / ParticipantWorkoutLogger.

4.9 24× retry with 150 ms backoff is brittle
live_session_participant_join participant retry loop in dashboard-live-video-dock.tsx:249-270 busy-loops 24 times at 150 ms. If the host hasn't yet executed live_session_create, all 24 fail and the participant ends up with liveDbReady === false permanently for that mount. There is no surface error to the user and no manual retry — they have to leave and rejoin. Consider:

Surfacing a "Waiting for host to start the session…" indicator in LiveSessionView when liveDbReady === false.
Subscribing to a postgres_changes INSERT on live_sessions filtered by id=eq.<sessionId> and retrying once that arrives, instead of (or in addition to) the polling loop. 5. Test coverage is materially lower than the docs imply
The "Automated Tests" section reads as if live-theater-layout.test.ts is the only test, which is true under src/features/live-video/. But the operational risk surface is large and untested:

Agora provider lifecycle (joinSeq invalidation under StrictMode, abort during token fetch, permission denied paths).
Token route auth and validation cases (missing env, bad channel, bad role, missing membership, workspace mismatch, malformed body).
agoraUidFromUuid test vectors (the comment in the source already promises these — "test vectors will be added in a follow-up PR").
Realtime session sync (handle parseSessionStateBroadcastPayload rejection, host-only senderId filter, host clock offset).
assign_user_to_session_deck / live_session_create / live_session_participant_join / copy_class_deck_to_live_session happy + unhappy paths (these are SECURITY DEFINER and worth pgTAP coverage).
Recording control-plane edge functions (acquire/start/stop, idempotency under double-click, metadata merge).
Recommend adding at minimum: agora-uid unit tests, a token-route integration test, a useSessionState reducer/parse test, and pgTAP coverage for the SECURITY DEFINER RPCs.

6. Documentation drift — concrete additions for docs/live-video/readme.md — RESOLVED in this pass
   All of the readme additions and updates listed below have landed:

New section: "Durable Session Registry" — live\*sessions, live_session_participants, is_live_session_participant, the three lifecycle RPCs, and the liveDbReady gate that DashboardLiveVideoDockRouter enforces before mounting LiveSessionView. ✓
New section: "Interval Wrappers" — registry, WrapperBaseProps, WrapperAttachContext, the interval_wrapper_kind/config columns, host_attach_amrap_session, and the theater_board_split host preference. ✓
New section: "AMRAP Feature Module" — pointer to src/features/amrap/\*\* and the relationship with the wrapper system. ✓
New section: "Cloud Recording" — the four agora-recording-\_ Edge Functions, class_recording_sessions table, class_instances.metadata.class_recording, host trigger from the dock, host-end stop hook in dashboard-shell.tsx, and required env vars (AGORA_CUSTOMER_ID, AGORA_CUSTOMER_SECRET, S3 bucket creds). ✓
New section: "Class Draft-Deck Merge" — bb-class-deck:<class_instance_id> namespace, copy_class_deck_to_live_session RPC, host-only invocation in the dock. ✓
New section: "Identifier Model" — the four-id table from §3 above, with the explicit note that live_sessions.id === sessionId (UUID), not channelId. ✓
Updated "Architecture" — the "three independent state layers" framing now calls out the durable registry as a fourth layer that gates wrapper-bearing phases. ✓
Updated "Known Limitations" — added: token route is workspace-scoped, not session-scoped; SessionState.generation enforcement is partial (drops strictly older only, not intra-session); no durable session close / retention; live_session_participant_join uses a 24-step retry loop without user-visible error state; recording start/stop has no participant consent UX. ✓
Updated "Debug Logging" — replaced the prose list with a table that marks each tripwire as unconditional or dev-gated and includes the two new generation-enforcer logs. ✓
Fixed the misleading comments in agora-session-context.tsx:7-8 and wrappers/types.ts:8. ✓ 7. Prioritized recommendations
P1 — code changes worth doing soon

Implement the documented SessionState.generation ordering check in useSessionState.handleIncomingStateBroadcast, or remove the docstring claim. Today the contract is silently violated. — PARTIALLY DONE (strictly-older drop landed with tripwires; remaining work: bump generation on every transition so intra-session reorder is also caught).
Add session-scoped authorization to /api/live-video/token for non-host roles (consult is_live_session_participant or accept and verify a sessionId). This is the single biggest security delta. — OPEN.
Surface liveDbReady === false to the participant UI after the 24-step retry budget is exhausted, with a manual retry. Today it's a silent failure. — OPEN.
Reorder onHostEndLiveSessionForAll to mark invite ended before awaiting agora-recording-stop. — OPEN.
Fix the two stale source comments about channelId vs live_sessions.id. — DONE.
P2 — robustness

Add a periodic host re-broadcast (e.g. on visibility change, on remote-user join, every N seconds while paused) for STATE_BROADCAST to compensate for ack: false.
Add closed_at / retention policy for live_sessions and live_session_participants.
Gate the remaining unconditional [DEBUG] logs to process.env.NODE_ENV === 'development' (excluding the new generation-enforcer tripwires, which are intentionally unconditional for production diagnostics).
Add agora-uid test vectors and a token-route integration test.
P3 — documentation

Land the readme additions in §6 above so future agents see the full system. — DONE in this pass; the readme now includes Durable Session Registry, Interval Wrappers, AMRAP Feature Module, Cloud Recording, Class Draft-Deck Merge, Identifier Model, and a Debug Logging table, plus expanded Architecture and Known Limitations sections.
