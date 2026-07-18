import { create } from 'zustand';
import { isSoloStudioDurationPreset } from '@/lib/live-video/solo-studio-duration';

export type LiveVideoShellMode = 'workout';

/** Active Agora + timer session lifted above bubble routes so the dock persists in the dashboard. */
export type LiveVideoActiveSession = {
  workspaceId: string;
  sessionId: string;
  /** Agora `channelId` passed to `AgoraSessionProvider`. */
  channelId: string;
  hostUserId: string;
  mode: LiveVideoShellMode;
  /**
   * Durable `live_sessions.access_mode`. Omit / `open` = shared huddle; `solo_studio` = host-only
   * studio (no invite broadcast, skip PreJoin, hide multi-party chrome).
   */
  accessMode?: 'open' | 'solo_studio';
  /**
   * Solo Studio only: host-selected estimated session length (minutes). Required before
   * `joinChannel`; drives overtime failsafe (`estimated + 5` minutes).
   */
  estimatedDurationMin?: number;
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
  /**
   * Solo Studio lobby: set estimated duration (must be 15, 30, or 45).
   * No-op if no active session or value is not a preset.
   */
  setEstimatedDurationMin: (min: number) => void;
  /** Clears session; unmounts dock and triggers Agora provider cleanup. */
  leaveSession: () => void;
};

export const useLiveVideoStore = create<LiveVideoStore>((set) => ({
  activeSession: null,

  joinSession: (session) => {
    if (!session.workspaceId?.trim()) return;
    set({ activeSession: session });
  },

  setEstimatedDurationMin: (min) => {
    if (!isSoloStudioDurationPreset(min)) return;
    set((state) => {
      if (!state.activeSession) return state;
      return {
        activeSession: { ...state.activeSession, estimatedDurationMin: min },
      };
    });
  },

  leaveSession: () => {
    set({ activeSession: null });
  },
}));
