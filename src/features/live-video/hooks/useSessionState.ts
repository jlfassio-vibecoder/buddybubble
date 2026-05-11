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

      // Copilot suggestion ignored: keep the generation enforcer + its tripwires unconditional
      // (not gated to dev) so silent reorder drops are visible in production diagnostics.
      // `parseSessionState` already coerces undefined/legacy `generation` to 0, but we coerce
      // again here so any future direct caller of this handler is also safe.
      const incomingGeneration = parsed.state.generation ?? 0;
      const currentGeneration = stateRef.current.generation ?? 0;
      console.log('[DEBUG][LiveVideo State] Evaluating broadcast generation:', {
        incoming: incomingGeneration,
        current: currentGeneration,
      });
      if (incomingGeneration < currentGeneration) {
        console.log('[DEBUG][LiveVideo State] Dropped stale out-of-order broadcast.');
        return;
      }

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

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const MAX_SUBSCRIBE_ATTEMPTS = 10;

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const token = session?.access_token;
      if (token) {
        void supabase.realtime.setAuth(token);
      }
    });

    const tearDownChannel = async () => {
      const ch = channelRef.current;
      channelRef.current = null;
      connectedRef.current = false;
      if (ch) {
        await supabase.removeChannel(ch);
      }
    };

    const subscribeAttempt = async (attempt: number): Promise<void> => {
      if (cancelled) return;

      await tearDownChannel();
      if (cancelled) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      const token = session?.access_token;
      if (token) {
        await supabase.realtime.setAuth(token);
      }
      if (cancelled) return;

      if (attempt > 0) {
        syncRequestSentRef.current = false;
      }

      const channel = supabase.channel(topic, {
        config: { broadcast: { ack: false } },
      });
      channelRef.current = channel;
      setConnectionStatus('connecting');

      channel.on('broadcast', { event: SESSION_STATE_BROADCAST_EVENT }, (message) => {
        handleIncomingStateBroadcast(message.payload);
      });

      channel.on('broadcast', { event: SESSION_SYNC_REQUEST_EVENT }, (message) => {
        handleIncomingSyncRequest(message.payload);
      });

      channel.subscribe((status, err) => {
        if (cancelled) return;
        if (status === 'SUBSCRIBED') {
          connectedRef.current = true;
          setConnectionStatus('connected');
          epochOffsetMsRef.current = 0;
          if (isHost) {
            queueMicrotask(() => {
              const ch = channelRef.current;
              if (!ch || !connectedRef.current || cancelled) return;
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
          if (process.env.NODE_ENV === 'development') {
            if (attempt + 1 < MAX_SUBSCRIBE_ATTEMPTS) {
              console.warn('[useSessionState] Realtime channel', status, err ?? '');
            } else {
              console.error('[useSessionState] Realtime channel exhausted retries', status, err);
            }
          }

          void (async () => {
            await tearDownChannel();
            if (cancelled) return;

            if (attempt + 1 < MAX_SUBSCRIBE_ATTEMPTS) {
              const backoffMs = Math.min(30_000, 400 * 2 ** attempt);
              if (retryTimer) clearTimeout(retryTimer);
              retryTimer = setTimeout(() => {
                retryTimer = undefined;
                void subscribeAttempt(attempt + 1);
              }, backoffMs);
              setConnectionStatus('connecting');
            } else {
              setConnectionStatus('error');
            }
          })();
        }
      });
    };

    void subscribeAttempt(0);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      authSubscription.unsubscribe();
      void tearDownChannel();
      syncRequestSentRef.current = false;
      epochOffsetMsRef.current = 0;
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
