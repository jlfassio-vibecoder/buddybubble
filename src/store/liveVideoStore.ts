import { create } from 'zustand';

export type LiveVideoShellMode = 'workout';

/** Active Agora + timer session lifted above bubble routes so the dock persists in the dashboard. */
export type LiveVideoActiveSession = {
  workspaceId: string;
  sessionId: string;
  /** Agora `channelId` passed to `AgoraSessionProvider`. */
  channelId: string;
  hostUserId: string;
  mode: LiveVideoShellMode;
  /** Chat row id for `metadata.live_session` — host PATCHes `endedAt` on "End session for all". */
  inviteMessageId?: string | null;
  /** Kanban / card-backed session — host ends by PATCHing `tasks.metadata.live_session.endedAt`. */
  sourceTaskId?: string | null;
  /** Class instance card — host ends by PATCHing `class_instances.metadata.live_session.endedAt`. */
  sourceInstanceId?: string | null;
};

type LiveVideoStore = {
  activeSession: LiveVideoActiveSession | null;
  /** No-op if `session.workspaceId` is empty. Replaces any prior session. */
  joinSession: (session: LiveVideoActiveSession) => void;
  /** Clears session; unmounts dock and triggers Agora provider cleanup. */
  leaveSession: () => void;
};

export const useLiveVideoStore = create<LiveVideoStore>((set) => ({
  activeSession: null,

  joinSession: (session) => {
    if (!session.workspaceId?.trim()) return;
    set({ activeSession: session });
  },

  leaveSession: () => {
    set({ activeSession: null });
  },
}));
