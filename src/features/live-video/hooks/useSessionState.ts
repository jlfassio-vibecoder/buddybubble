'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import {
  endSession,
  initialSessionState,
  pauseBlock,
  resumeBlock,
  startSession,
  transitionToPhase,
  type SessionPhase,
  type SessionState,
} from '@/features/live-video/state/sessionStateMachine';
import {
  parseSessionStateBroadcastPayload,
  parseSessionSyncRequestPayload,
  SESSION_STATE_BROADCAST_EVENT,
  SESSION_SYNC_REQUEST_EVENT,
} from '@/features/live-video/state/session-sync.types';

export type UseSessionStateOptions = {
  sessionId: string;
  workspaceId: string;
  localUserId: string;
  hostUserId: string;
  supabase: SupabaseClient;
  /** When false, skip Realtime (default true). */
  enabled?: boolean;
};

export type SessionActions = {
  startSession: () => void;
  endSession: () => void;
  transitionToPhase: (phase: SessionPhase) => void;
  pauseSession: () => void;
  resumeSession: () => void;
};

export type UseSessionStateResult = {
  state: SessionState;
  actions: SessionActions;
  isHost: boolean;
};

function buildRoomSessionTopic(workspaceId: string, sessionId: string): string {
  return `room-session:${workspaceId}:${sessionId}`;
}

function sendStateBroadcast(channel: RealtimeChannel, next: SessionState, senderId: string): void {
  void channel.send({
    type: 'broadcast',
    event: SESSION_STATE_BROADCAST_EVENT,
    payload: { state: next, senderId },
  });
}

export function useSessionState(options: UseSessionStateOptions): UseSessionStateResult {
  const { sessionId, workspaceId, localUserId, hostUserId, supabase, enabled = true } = options;

  const isHost = localUserId === hostUserId;
  const [state, setState] = useState<SessionState>(initialSessionState);
  const stateRef = useRef(state);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const connectedRef = useRef(false);
  const syncRequestSentRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const emitHostState = useCallback(
    (next: SessionState) => {
      const ch = channelRef.current;
      if (!ch || !connectedRef.current) return;
      sendStateBroadcast(ch, next, localUserId);
    },
    [localUserId],
  );

  const scheduleHostBroadcast = useCallback(
    (next: SessionState, prev: SessionState) => {
      if (!isHost || next === prev) return;
      queueMicrotask(() => {
        emitHostState(next);
      });
    },
    [emitHostState, isHost],
  );

  const handleIncomingStateBroadcast = useCallback(
    (raw: unknown) => {
      const parsed = parseSessionStateBroadcastPayload(raw);
      if (!parsed) return;
      if (parsed.senderId !== hostUserId) return;
      if (isHost && parsed.senderId === localUserId) return;
      setState(parsed.state);
    },
    [hostUserId, isHost, localUserId],
  );

  const handleIncomingSyncRequest = useCallback(
    (raw: unknown) => {
      if (!isHost) return;
      const parsed = parseSessionSyncRequestPayload(raw);
      if (!parsed) return;
      const ch = channelRef.current;
      if (!ch || !connectedRef.current) return;
      sendStateBroadcast(ch, stateRef.current, localUserId);
    },
    [isHost, localUserId],
  );

  useEffect(() => {
    const topic =
      enabled && workspaceId.trim() && sessionId.trim()
        ? buildRoomSessionTopic(workspaceId, sessionId)
        : '';

    if (!topic) {
      connectedRef.current = false;
      channelRef.current = null;
      syncRequestSentRef.current = false;
      return;
    }

    const channel = supabase.channel(topic, {
      config: { broadcast: { ack: false } },
    });
    channelRef.current = channel;
    syncRequestSentRef.current = false;

    channel.on('broadcast', { event: SESSION_STATE_BROADCAST_EVENT }, (message) => {
      handleIncomingStateBroadcast(message.payload);
    });

    channel.on('broadcast', { event: SESSION_SYNC_REQUEST_EVENT }, (message) => {
      handleIncomingSyncRequest(message.payload);
    });

    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        connectedRef.current = true;
        if (isHost) {
          queueMicrotask(() => {
            const ch = channelRef.current;
            if (!ch || !connectedRef.current) return;
            sendStateBroadcast(ch, stateRef.current, localUserId);
          });
        }
        if (!isHost && !syncRequestSentRef.current) {
          syncRequestSentRef.current = true;
          const now = Date.now();
          void channel.send({
            type: 'broadcast',
            event: SESSION_SYNC_REQUEST_EVENT,
            payload: {
              senderId: localUserId,
              requestId: `${localUserId}-${now}`,
            },
          });
        }
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        connectedRef.current = false;
        console.error('[useSessionState] subscribe', status, err);
      }
    });

    return () => {
      connectedRef.current = false;
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [
    enabled,
    sessionId,
    workspaceId,
    localUserId,
    hostUserId,
    isHost,
    supabase,
    handleIncomingStateBroadcast,
    handleIncomingSyncRequest,
  ]);

  const handleStartSession = useCallback(() => {
    if (!isHost) return;
    const now = Date.now();
    setState((prev) => {
      const next = startSession(prev, now);
      scheduleHostBroadcast(next, prev);
      return next;
    });
  }, [isHost, scheduleHostBroadcast]);

  const handleEndSession = useCallback(() => {
    if (!isHost) return;
    setState((prev) => {
      const next = endSession(prev);
      scheduleHostBroadcast(next, prev);
      return next;
    });
  }, [isHost, scheduleHostBroadcast]);

  const handleTransitionPhase = useCallback(
    (phase: SessionPhase) => {
      if (!isHost) return;
      const now = Date.now();
      setState((prev) => {
        const next = transitionToPhase(prev, phase, now);
        scheduleHostBroadcast(next, prev);
        return next;
      });
    },
    [isHost, scheduleHostBroadcast],
  );

  const handlePauseSession = useCallback(() => {
    if (!isHost) return;
    const now = Date.now();
    setState((prev) => {
      const next = pauseBlock(prev, now);
      scheduleHostBroadcast(next, prev);
      return next;
    });
  }, [isHost, scheduleHostBroadcast]);

  const handleResumeSession = useCallback(() => {
    if (!isHost) return;
    const now = Date.now();
    setState((prev) => {
      const next = resumeBlock(prev, now);
      scheduleHostBroadcast(next, prev);
      return next;
    });
  }, [isHost, scheduleHostBroadcast]);

  const actions = useMemo(
    () => ({
      startSession: handleStartSession,
      endSession: handleEndSession,
      transitionToPhase: handleTransitionPhase,
      pauseSession: handlePauseSession,
      resumeSession: handleResumeSession,
    }),
    [
      handleEndSession,
      handlePauseSession,
      handleResumeSession,
      handleStartSession,
      handleTransitionPhase,
    ],
  );

  return {
    state,
    actions,
    isHost,
  };
}
