Live video (Agora) — BuddyBubble blueprint

Status: Agora-backed live video (token API + browser SDK wired)
Purpose: Single reference for humans and coding agents. Use absolute paths in BuddyBubble when reviewing or extending this feature. Do not copy legacy Interval Timers code verbatim; reuse ideas (token boundary, lifecycle) only.

Revised Cursor / agent prompt (use this verbatim for scaffolding tasks)

We are introducing an Agora WebRTC-backed live video surface into BuddyBubble. The goal is an immersive, native embed that inherits category theme tokens from ThemeScope (see src/components/theme/ThemeScope.tsx). We are building a highly extensible “base video shell” that will eventually host different interactive layouts (workouts, kids’ games, etc.) behind one shared Agora connection manager.

Constraints

Do not copy-paste legacy app files. New code lives under src/features/live-video/.

Agora SDK: agora-rtc-sdk-ng is used with server-minted RTC tokens (see src/app/api/live-video/token/route.ts). Keep secrets server-side.

ThemeScope: ThemeScope uses display: contents; it injects CSS variables only. The live subtree must remain a descendant of the dashboard ThemeScope (today: anything rendered inside DashboardShell under src/components/dashboard/dashboard-shell.tsx lines ~902–1205, including routed {children}).

Tripwire logs (mandatory for lifecycle debugging): Keep these exact strings until the feature is stable, then gate behind process.env.NODE_ENV === 'development' or remove:

On provider mount: [DEBUG] AgoraSessionProvider Mounted - Initializing connection bounds

Inside leaveChannel when disconnecting: [DEBUG] AgoraSessionProvider Unmounted - TRIPPING DISCONNECT / Cleanup

On harness render: [DEBUG] BaseVideoHarness Rendered with child shell: + second argument (child shell name or 'none')

Child shell logging: children?.type?.name only works for a single React element whose type is a function/class. Fragments, arrays, strings, or multiple children log as 'none' — that is expected; use a single named component as the shell for debugging.

Deliverables

src/features/live-video/ — feature module (provider, harness, barrel index.ts).

AgoraSessionProvider.tsx — React context for session state: mock isConnected, isConnecting, joinChannel, leaveChannel (no Agora SDK).

BaseVideoHarness.tsx — Consumes context; horizontally centered layout; dedicated video stage; children slot for future shells (timers, boards).

Unmount safety: useEffect in the provider must call leaveChannel on unmount so timers/mock connections never leak.

Verification route: src/app/(dashboard)/app/[workspace_id]/live-video-scaffold/page.tsx — mounts provider + harness inside existing ThemeScope (via shell children) for manual QA.

Absolute paths (BuddyBubble)

Role

Path

Theme variable scope

/Users/justinfassio/Local Sites/BuddyBubble/src/components/theme/ThemeScope.tsx

Dashboard shell (ThemeScope + layout)

/Users/justinfassio/Local Sites/BuddyBubble/src/components/dashboard/dashboard-shell.tsx

Resizable Messages / board split

/Users/justinfassio/Local Sites/BuddyBubble/src/components/dashboard/workspace-main-split.tsx

Chat column

/Users/justinfassio/Local Sites/BuddyBubble/src/components/chat/ChatArea.tsx

Workspace + bubble selection (Zustand)

/Users/justinfassio/Local Sites/BuddyBubble/src/store/workspaceStore.ts

Live video feature

/Users/justinfassio/Local Sites/BuddyBubble/src/features/live-video/

Scaffold page

/Users/justinfassio/Local Sites/BuddyBubble/src/app/(dashboard)/app/[workspace_id]/live-video-scaffold/page.tsx

This blueprint

/Users/justinfassio/Local Sites/BuddyBubble/docs/live-video-blueprint.md

Legacy reference (ideas only, do not copy): Interval Timers trainer live Agora helpers live under that repo’s apps/app/src/lib/trainer-live/agora.ts, TrainerLiveAgoraContext.tsx, and useTrainerLiveAgoraChannel.ts.

Architecture notes

Connection manager vs UI shells — Keep join/leave, tokens, tracks, remote user list in the provider (or a dedicated hook used by the provider). BaseVideoHarness should stay a layout + stage; interactive modes pass children or lazy-loaded shell components.

Where to mount for production — The scaffold page uses the {children} slot at the bottom of DashboardShell (fine for QA). Full-screen or board-embedded video will likely require a slot inside WorkspaceMainSplit, ClassesBoard, or a portal — decide in a later iteration; document the chosen mount point here when done.

Secrets — Agora App Certificate stays server-side; the browser receives short-lived RTC tokens from a BuddyBubble API route (not built in this scaffold).

Changelog

Initial: Mock AgoraSessionProvider, BaseVideoHarness, scaffold route, tripwire logs.
