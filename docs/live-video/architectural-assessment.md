Live Video — Architectural Assessment and Gap Analysis
I read docs/live-video/readme.md and then walked the deployed code paths under src/features/live-video/, src/components/dashboard/, src/app/api/live-video/token/, src/types/live-session-invite.ts, the Supabase migrations under supabase/migrations/2026\*, and the Agora cloud-recording Edge Functions. The doc is mostly accurate as a description of the workout-huddle slice, but the deployed system has grown several subsystems the doc doesn't acknowledge, and there are a few real architectural risks worth flagging.

## Resolution Log

This document is a living record. The "Foundational P1/P3 Cleanup" pass landed the following:

- **§2 Subsystems the doc omits — RESOLVED.** docs/live-video/readme.md now has dedicated sections for Durable Session Registry, Interval Wrappers, AMRAP Feature Module, Cloud Recording, Class Draft-Deck Merge, and Identifier Model. The "Architecture" framing was updated to call out the durable registry as a fourth layer.
- **§3 Stale identifier comments — RESOLVED.** src/features/live-video/agora-session-context.tsx now states the channel id is `bb-live-${workspaceId}-${shortId}` and is NOT `public.live_sessions.id`. src/features/live-video/wrappers/types.ts now documents `liveSessionId` as the durable session UUID, explicitly distinguished from the Agora channel id.
- **§4.2 SessionState.generation is documented but inert — PARTIALLY RESOLVED.** `useSessionState.handleIncomingStateBroadcast` compares incoming vs current `generation` and drops strictly older broadcasts **silently** (the `[DEBUG][LiveVideo State]` tripwires were removed). **Remaining gap:** `generation` is still only incremented in `endSession`, so the enforcer protects against full-session-reset reordering only — not against intra-session reordering of pause/resume or `setActiveDeckItem`.
- **§4.1 Token authorization — PARTIALLY RESOLVED (May 2026 verify).** When the client sends `sessionId` + `workspaceId`, `src/app/api/live-video/token/route.ts` enforces Tier C via `can_join_live_session`. Dashboard production joins always pass `sessionId`. **Remaining gap:** callers without `sessionId` (scaffold signed-out preview, legacy dev paths) still get workspace membership + channel regex only; `channelId` ↔ session binding is still a dev tripwire, not enforced.
- **§4.7 Debug logs — RESOLVED (May 2026 verify).** Blueprint lifecycle `[DEBUG]` strings were removed from `AgoraSessionProvider`, `BaseVideoHarness`, `useSessionState`, and dock/shell render paths. Only token-route Tier C logs remain (dev-gated).
- **§4.9 Participant join retry — PARTIALLY RESOLVED (May 2026 verify).** The dock no longer runs a 24×150 ms `live_session_participant_join` loop. Pre-join `ParticipantPreJoinSummary` retries **8×500 ms** with a user-visible “host still starting” message and manual retry; `AgoraSessionProvider` retries token **404** up to **10×500 ms**. **Remaining gap:** no `postgres_changes` wait on `live_sessions`; host `live_session_create` failure still surfaces only via console error and leaves `liveDbReady` false.
- **§6 Documentation drift — RESOLVED.** Readme now includes Known Limitations updates (token-route scope, partial generation enforcement, no durable session close, participant join UX, no recording consent UX) and a Debug Logging section verified against code.

**May 2026 code verification — still open:** §4.3 (Realtime `ack: false`, no periodic host rebroadcast), §4.4 (no durable session close), §4.5 (host-end recording-stop before `endedAt`), §4.8 (orphaned `activeDeckItemId`), §5 (test coverage). §4.2 intra-session generation gap remains.

Items still open after this pass: §4.3, §4.4, §4.5, §4.8, §5 (test coverage). §4.1 channel binding and sessionId-less callers. §4.2 intra-session generation. §4.9 postgres wait + host create failure UX. §7 P1 item 3 (liveDbReady failure UX) partially landed via pre-join message. §7 P1 item 4 (host-end ordering) still open. §7 P2 periodic rebroadcast, closed_at, tests still open.

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
   4.1 Token authorization — PARTIALLY RESOLVED (verified May 2026)
   When the client sends **`sessionId`** (UUID) and **`workspaceId`**, `src/app/api/live-video/token/route.ts` enforces **Tier C**: `live_sessions` row must exist (404 for retry when missing), then `can_join_live_session` must pass. Dashboard production `AgoraSessionProvider` always passes `sessionId`.

   **Still open:**
   - Callers **without** `sessionId` (e.g. scaffold signed-out preview, some dev paths) only require auth + channel regex + optional workspace membership — same as pre–Tier C behavior.
   - **`channelId` binding** to the session is logged in dev only; not enforced until `live_sessions` stores a canonical channel id.
   - Non-UUID `sessionId` strings (e.g. `live-scaffold-${workspaceId}` on the runtime provider) are not sent to the token route; scaffold Agora join omits `sessionId` entirely.

     4.2 Session-level "generation" counter — PARTIALLY RESOLVED (verified May 2026)
     `handleIncomingStateBroadcast` drops when `incomingGeneration < currentGeneration` (see `useSessionState.ts` ~124–128). **No console tripwire** on drop.

   **Remaining gap:** `generation` only increments in `endSession` (`sessionStateMachine.ts` ~117). Intra-session pause/resume / `setActiveDeckItem` reordering is not filtered. Separate `generation` in `shared-timer-sync.types.ts` (`useSharedTimerSync`) remains a naming footgun.

   4.3 Realtime delivery is best-effort with no host re-broadcast loop — **STILL OPEN** (verified May 2026)
   `useSessionState` uses `{ broadcast: { ack: false } }` (~214). Participants send one `SYNC_REQUEST` per subscribe (`syncRequestSentRef`, ~279–290); reset on reconnect (~210). Host rebroadcasts on own transitions, on `SYNC_REQUEST`, and once on host `SUBSCRIBED` (~272–277). **No** periodic resync, visibility handler, or Agora remote-user join rebroadcast.

   4.4 No durable lifecycle close — **STILL OPEN** (verified May 2026)
   No `closed_at` on `live_sessions` / `live_session_participants` in migrations; rows accumulate after `endSession`, dock unmount, and invite `endedAt`.

   4.5 Cleanup ordering on host-end — **STILL OPEN** (verified May 2026)
   `onHostEndLiveSessionForAll` in `dashboard-shell.tsx` (~910–937) still `await`s `agora-recording-stop` before `markClassInstanceLiveSessionEnded` / chat task PATCHes when `sourceInstanceId` is set.

   4.6 AGORA*APP_ID exposure footprint
   Token route returns `appId` to the browser (Agora SDK requirement). Readme Environment section now notes this; it is not a `NEXT_PUBLIC*` leak.

   4.7 Debug logs — **RESOLVED** (verified May 2026)
   Blueprint `[DEBUG]` lifecycle strings removed from Agora provider, harness, session-state hook, and dock/shell render paths. Remaining: dev-gated `[DEBUG]` on token route and dev-only `[useSessionState] Realtime channel` warnings.

   4.8 Deck-item id lifecycle and deletion races — **STILL OPEN** (verified May 2026)
   `ParticipantWorkoutLogger` returns the same “waiting for host” copy when `activeDeckItemId` is set but the deck row is missing (~297–307).

   4.9 Participant registration retry — **PARTIALLY RESOLVED** (verified May 2026)
   **Removed:** dock 24×150 ms `live_session_participant_join` loop.

   **Current behavior:**
   - `ParticipantPreJoinSummary`: 8×500 ms FK retry; `waitingForHost` UI + manual **Join video** retry.
   - `AgoraSessionProvider`: 10×500 ms token 404 retry.
   - Dock participant: sets `liveDbReady` on connect without re-running join RPC.

   **Remaining gap:** no `postgres_changes` INSERT wait on `live_sessions`; host `live_session_create` error does not surface in UI.

5. Test coverage is materially lower than the docs imply — **STILL OPEN** (verified May 2026)

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
Updated "Known Limitations" — verified May 2026 against Realtime + registration code (Tier C scope, partial generation, no durable close, pre-join join retry UX, deck orphan id, host-end ordering). ✓
Updated "Debug Logging" — verified May 2026; most blueprint tripwires removed. ✓
Fixed the misleading comments in agora-session-context.tsx:7-8 and wrappers/types.ts:8. ✓

7. Prioritized recommendations
   P1 — code changes worth doing soon

Implement full SessionState.generation ordering (increment on every transition) or remove the docstring claim. Today strictly-older drops work; intra-session reorder does not. — PARTIALLY DONE.
~~Add session-scoped authorization to /api/live-video/token~~ Tier C when `sessionId` is sent — DONE for production dashboard path. Still open: enforce `channelId` binding; tighten sessionId-less callers. — PARTIALLY DONE.
~~Surface participant registration failure~~ Pre-join `waitingForHost` + manual retry landed; still open: host `live_session_create` failure UX, `postgres_changes` wait, connected-state `liveDbReady === false` indicator. — PARTIALLY DONE.
Reorder onHostEndLiveSessionForAll to mark invite ended before awaiting agora-recording-stop. — OPEN.
Fix the two stale source comments about channelId vs live_sessions.id. — DONE.
P2 — robustness

Add a periodic host re-broadcast (e.g. on visibility change, on remote-user join, every N seconds while paused) for STATE_BROADCAST to compensate for ack: false. — OPEN (verified May 2026).
Add closed_at / retention policy for live_sessions and live_session_participants. — OPEN.
~~Gate unconditional [DEBUG] logs~~ Removed from hot paths; token route dev-gated. — DONE.
Add agora-uid test vectors and a token-route integration test. — OPEN.
P3 — documentation

Land the readme additions in §6 above so future agents see the full system. — DONE.
Re-verify Known Limitations and Debug Logging against code when changing Realtime or registration paths. — DONE May 2026 (this pass).
