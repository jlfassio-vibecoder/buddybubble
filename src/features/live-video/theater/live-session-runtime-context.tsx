'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createClient } from '@utils/supabase/client';
import { useSessionState, type SessionActions } from '@/features/live-video/hooks/useSessionState';
import type { SessionState } from '@/features/live-video/state/sessionStateMachine';
import { sessionUiKindFromSessionState } from '@/features/live-video/theater/live-theater-layout.types';

export type LiveSessionRuntimeValue = {
  state: SessionState;
  actions: SessionActions;
  isHost: boolean;
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
      state: result.state,
      actions: result.actions,
      isHost: result.isHost,
      sessionUiKind: sessionUiKindFromSessionState(result.state),
    }),
    [result.actions, result.isHost, result.state],
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
