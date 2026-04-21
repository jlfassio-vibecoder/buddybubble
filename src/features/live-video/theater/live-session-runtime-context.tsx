'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@utils/supabase/client';
import { useSessionState, type SessionActions } from '@/features/live-video/hooks/useSessionState';
import type { SessionState } from '@/features/live-video/state/sessionStateMachine';
import { sessionUiKindFromSessionState } from '@/features/live-video/theater/live-theater-layout.types';
import type { Database } from '@/types/database';

export type LiveSessionRuntimeValue = {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  state: SessionState;
  actions: SessionActions;
  isHost: boolean;
  sessionId: string;
  supabase: SupabaseClient<Database>;
  /** Host-synced global aspect ratio for the video stage. */
  aspectRatio: SessionState['aspectRatio'];
  /** Block elapsed time in ms, aligned to host clock when possible. */
  getElapsedMs: () => number;
  /** Subscribe to discrete model changes (layout/phase/status updates). */
  subscribeTick: (cb: () => void) => () => void;
  sessionUiKind: 'builder' | 'live';
};

const LiveSessionRuntimeContext = createContext<LiveSessionRuntimeValue | null>(null);

export type LiveSessionRuntimeProviderProps = {
  workspaceId: string;
  sessionId: string;
  localUserId: string;
  hostUserId: string;
  enabled: boolean;
  children: ReactNode;
};

export function LiveSessionRuntimeProvider({
  workspaceId,
  sessionId,
  localUserId,
  hostUserId,
  enabled,
  children,
}: LiveSessionRuntimeProviderProps) {
  const supabase = useMemo(() => createClient(), []);
  const result = useSessionState({
    sessionId,
    workspaceId,
    localUserId,
    hostUserId,
    supabase,
    enabled,
  });

  const value = useMemo(
    (): LiveSessionRuntimeValue => ({
      connectionStatus: result.connectionStatus,
      state: result.state,
      actions: result.actions,
      isHost: result.isHost,
      sessionId,
      supabase,
      aspectRatio: result.state.aspectRatio,
      getElapsedMs: result.getElapsedMs,
      subscribeTick: result.subscribeTick,
      sessionUiKind: sessionUiKindFromSessionState(result.state),
    }),
    [
      result.actions,
      result.connectionStatus,
      result.getElapsedMs,
      result.isHost,
      result.state,
      result.subscribeTick,
      sessionId,
      supabase,
    ],
  );

  return (
    <LiveSessionRuntimeContext.Provider value={value}>
      {children}
    </LiveSessionRuntimeContext.Provider>
  );
}

export function useLiveSessionRuntime(): LiveSessionRuntimeValue {
  const ctx = useContext(LiveSessionRuntimeContext);
  if (!ctx) {
    throw new Error('useLiveSessionRuntime requires LiveSessionRuntimeProvider');
  }
  return ctx;
}

export function useLiveSessionRuntimeOptional(): LiveSessionRuntimeValue | null {
  return useContext(LiveSessionRuntimeContext);
}
