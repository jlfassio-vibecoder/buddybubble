'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { IAgoraRTCRemoteUser, ILocalVideoTrack } from 'agora-rtc-sdk-ng';

export type AgoraSessionContextValue = {
  /**
   * Agora channel id; this is typically a string like `bb-live-${workspaceId}-${shortId}`
   * and is NOT `public.live_sessions.id`. The durable session row is keyed by `sessionId`
   * (a UUID held in `liveVideoStore.activeSession.sessionId`), not by this channel string.
   */
  channelId: string;
  isConnected: boolean;
  isConnecting: boolean;
  joinChannel: () => void;
  leaveChannel: () => void;
  /** Local camera track for preview (`null` when not publishing / subscriber-only). */
  localVideoTrack: ILocalVideoTrack | null;
  /** Last join failure (e.g. permission denied); cleared on join attempt or leave. */
  joinError: string | null;
  /** Remote participants (mutable SDK objects; array reference updates on subscribe/unpublish/leave). */
  remoteUsers: IAgoraRTCRemoteUser[];
  /** Join role from provider props (controls whether local publish / media toggles apply). */
  role: 'publisher' | 'subscriber';
  /** Local mic is muted (`setEnabled(false)` on audio track). */
  isMicMuted: boolean;
  /** Local camera is off (`setEnabled(false)` on video track). */
  isCameraOff: boolean;
  /** Toggle local microphone send (publisher + connected only). */
  toggleMic: () => void;
  /** Toggle local camera send (publisher + connected only). */
  toggleCamera: () => void;
};

export const AgoraSessionContext = createContext<AgoraSessionContextValue | null>(null);

export function useAgoraSession(): AgoraSessionContextValue {
  const ctx = useContext(AgoraSessionContext);
  if (!ctx) {
    throw new Error('useAgoraSession must be used within AgoraSessionProvider');
  }
  return ctx;
}

export type AgoraSessionProviderProps = {
  children: ReactNode;
  /** Agora channel name (validated server-side). */
  channelId: string;
  /** When set, the token API requires an active workspace_members row for the session user. */
  workspaceId?: string;
  /**
   * Durable session UUID (`liveVideoStore.activeSession.sessionId` / `public.live_sessions.id`).
   * When supplied, `POST /api/live-video/token` runs Tier C: after verifying the row exists, the
   * route calls `public.can_join_live_session`, which is subscription-aware (host always;
   * participants must be in `live_session_participants` and, on paid workspace categories,
   * the workspace must be `trialing` or `active` per `get_workspace_subscription_status`). The
   * client retries on HTTP 404 while the host’s `live_session_create` race finishes.
   */
  sessionId?: string;
  role?: 'publisher' | 'subscriber';
};
