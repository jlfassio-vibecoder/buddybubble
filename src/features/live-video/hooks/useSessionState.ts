'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import {
  endSession,
  getBlockElapsedMs,
  initialSessionState,
  pauseBlock,
  resumeBlock,
  setActiveDeckItem as reduceSetActiveDeckItem,
  setAspectRatio as reduceSetAspectRatio,
  startSession,
  transitionToPhase,
  type SessionAspectRatioId,
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
  setAspectRatio: (ratio: SessionAspectRatioId) => void;
  /** Host only: broadcast `live_session_deck_items.id` (or null) for mirrored queue / player. */
  setActiveDeckItem: (id: string | null) => void;
};

export type UseSessionStateResult = {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  state: SessionState;
  actions: SessionActions;
  isHost: boolean;
  /** Ref-backed state model for rAF-based clocks (no per-tick React updates). */
  getSnapshot: () => SessionState;
  /** Block elapsed time (ms), aligned to host clock when possible. */
  getElapsedMs: () => number;
  /** Subscribe to discrete model changes (layout/phase/status updates). */
  subscribeTick: (cb: () => void) => () => void;
};

function buildRoomSessionTopic(workspaceId: string, sessionId: string): string {
  return `room-session:${workspaceId}:${sessionId}`;
}

function sendStateBroadcast(channel: RealtimeChannel, next: SessionState, senderId: string): void {
  const hostNow = Date.now();
  void channel.send({
    type: 'broadcast',
    event: SESSION_STATE_BROADCAST_EVENT,
    payload: { state: next, senderId, hostNow },
  });
}

export function useSessionState(options: UseSessionStateOptions): UseSessionStateResult {
  const { sessionId, workspaceId, localUserId, hostUserId, supabase, enabled = true } = options;

  const isHost = localUserId === hostUserId;
  const [state, setState] = useState<SessionState>(initialSessionState);
  const [connectionStatus, setConnectionStatus] =
    useState<UseSessionStateResult['connectionStatus']>('disconnected');
  const stateRef = useRef(state);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const connectedRef = useRef(false);
  const syncRequestSentRef = useRef(false);
  const epochOffsetMsRef = useRef(0);
  const tickListenersRef = useRef(new Set<() => void>());

  const notifyTick = useCallback(() => {
    tickListenersRef.current.forEach((cb) => {
      cb();
    });
  }, []);

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
      if (process.env.NODE_ENV === 'development') {
        console.log(
          '[DEBUG] useSessionState broadcast received: senderId=%s phase=%s status=%s aspectRatio=%s generation=%s',
          parsed.senderId,
          parsed.state.phase,
          parsed.state.status,
          parsed.state.aspectRatio,
          parsed.state.generation,
        );
      }
      if (!isHost && process.env.NODE_ENV === 'development') {
        console.log('[DEBUG] Participant received active item:', parsed.state.activeDeckItemId);
      }
      if (!isHost && typeof parsed.hostNow === 'number') {
        const localReceive = Date.now();
        epochOffsetMsRef.current = parsed.hostNow - localReceive;
      }
      setState(parsed.state);
      notifyTick();
    },
    [hostUserId, isHost, localUserId, notifyTick],
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
      epochOffsetMsRef.current = 0;
      setConnectionStatus('disconnected');
      return;
    }

    const channel = supabase.channel(topic, {
      config: { broadcast: { ack: false } },
    });
    channelRef.current = channel;
    syncRequestSentRef.current = false;
    setConnectionStatus('connecting');

    channel.on('broadcast', { event: SESSION_STATE_BROADCAST_EVENT }, (message) => {
      handleIncomingStateBroadcast(message.payload);
    });

    channel.on('broadcast', { event: SESSION_SYNC_REQUEST_EVENT }, (message) => {
      handleIncomingSyncRequest(message.payload);
    });

    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        connectedRef.current = true;
        setConnectionStatus('connected');
        epochOffsetMsRef.current = 0;
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
        setConnectionStatus('error');
      }
    });

    return () => {
      connectedRef.current = false;
      channelRef.current = null;
      void supabase.removeChannel(channel);
      setConnectionStatus('disconnected');
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

  const handleSetAspectRatio = useCallback(
    (ratio: SessionAspectRatioId) => {
      if (!isHost) return;
      if (process.env.NODE_ENV === 'development') {
        console.log('[DEBUG] useSessionState setAspectRatio (host): ratio=%s', ratio);
      }
      setState((prev) => {
        const next = reduceSetAspectRatio(prev, ratio);
        scheduleHostBroadcast(next, prev);
        return next;
      });
    },
    [isHost, scheduleHostBroadcast],
  );

  const handleSetActiveDeckItem = useCallback(
    (id: string | null) => {
      if (!isHost) return;
      if (process.env.NODE_ENV === 'development') {
        console.log('[DEBUG] Host broadcast active item:', id);
      }
      setState((prev) => {
        const next = reduceSetActiveDeckItem(prev, id);
        scheduleHostBroadcast(next, prev);
        return next;
      });
    },
    [isHost, scheduleHostBroadcast],
  );

  const actions = useMemo(
    () => ({
      startSession: handleStartSession,
      endSession: handleEndSession,
      transitionToPhase: handleTransitionPhase,
      pauseSession: handlePauseSession,
      resumeSession: handleResumeSession,
      setAspectRatio: handleSetAspectRatio,
      setActiveDeckItem: handleSetActiveDeckItem,
    }),
    [
      handleEndSession,
      handlePauseSession,
      handleResumeSession,
      handleStartSession,
      handleSetActiveDeckItem,
      handleSetAspectRatio,
      handleTransitionPhase,
    ],
  );

  const getSnapshot = useCallback(() => stateRef.current, []);

  const getElapsedMs = useCallback(() => {
    const now = Date.now();
    const effectiveNow = isHost ? now : now + epochOffsetMsRef.current;
    return getBlockElapsedMs(stateRef.current, effectiveNow);
  }, [isHost]);

  const subscribeTick = useCallback((cb: () => void) => {
    tickListenersRef.current.add(cb);
    return () => {
      tickListenersRef.current.delete(cb);
    };
  }, []);

  return {
    connectionStatus,
    state,
    actions,
    isHost,
    getSnapshot,
    getElapsedMs,
    subscribeTick,
  };
}
