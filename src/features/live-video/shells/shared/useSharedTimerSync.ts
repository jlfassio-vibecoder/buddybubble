'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@utils/supabase/client';
import {
  computeElapsedMs,
  parseSharedTimerBroadcastPayload,
  type SharedTimerBroadcastPayload,
  type SharedTimerConnectionStatus,
  type SharedTimerSnapshot,
} from '@/features/live-video/shells/shared/shared-timer-sync.types';

const BROADCAST_EVENT = 'timer_sync' as const;

export type UseSharedTimerSyncOptions = {
  /** Stable Realtime channel name, e.g. `timer-sync:${workspaceId}:${sessionId}`. */
  topic: string;
  localUserId: string;
  hostUserId: string;
  /** When false, the hook stays disconnected (default true). */
  enabled?: boolean;
};

export type UseSharedTimerSyncResult = {
  connectionStatus: SharedTimerConnectionStatus;
  isHost: boolean;
  /** Low-frequency mirror of `generationRef` for React keys / debug. */
  generation: number;
  /** Read-only view of ref-backed model; safe to call inside `requestAnimationFrame`. */
  getSnapshot: () => SharedTimerSnapshot;
  /** Same as `computeElapsedMs(Date.now(), getSnapshot())` for convenience. */
  getElapsedMs: () => number;
  subscribeTick: (cb: () => void) => () => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
};

function buildSnapshot(
  generation: number,
  isRunning: boolean,
  accumulatedMs: number,
  segmentStartedAt: number | null,
  epochOffsetMs: number,
): SharedTimerSnapshot {
  return {
    generation,
    isRunning,
    accumulatedMs,
    segmentStartedAt,
    epochOffsetMs,
  };
}

/**
 * Shared workout-style timer over **Supabase Realtime Broadcast** (no Postgres writes per tick).
 *
 * - **Host** (`localUserId === hostUserId`) may `start` / `pause` / `reset` and answers `SYNC_REQUEST` with `SYNC_RESPONSE`.
 * - **Clients** apply broadcasts and align clocks using `snapshotHostNow` from `SYNC_RESPONSE` (v1: not NTP-grade).
 * - **Performance:** timer math lives in refs; do not call `setState` on every frame. Drive UI with
 *   `requestAnimationFrame` + `getSnapshot()` / `getElapsedMs()`, or `subscribeTick` to re-render on discrete events only.
 */
export function useSharedTimerSync(options: UseSharedTimerSyncOptions): UseSharedTimerSyncResult {
  const { topic, localUserId, hostUserId, enabled = true } = options;
  const isHost = localUserId === hostUserId;

  const generationRef = useRef(0);
  const isRunningRef = useRef(false);
  const segmentStartedAtRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef(0);
  const epochOffsetMsRef = useRef(0);

  const [connectionStatus, setConnectionStatus] =
    useState<SharedTimerConnectionStatus>('disconnected');
  const [generation, setGeneration] = useState(0);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const connectedRef = useRef(false);
  const tickListenersRef = useRef(new Set<() => void>());
  const processedBroadcastKeysRef = useRef(new Set<string>());
  const syncRequestSentRef = useRef(false);
  const syncResponseDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notifyTick = useCallback(() => {
    tickListenersRef.current.forEach((cb) => {
      cb();
    });
  }, []);

  const bumpGenerationState = useCallback(() => {
    setGeneration(generationRef.current);
  }, []);

  const applyModel = useCallback(
    (patch: {
      generation: number;
      isRunning: boolean;
      accumulatedMs: number;
      segmentStartedAt: number | null;
      epochOffsetMs?: number;
    }) => {
      generationRef.current = patch.generation;
      isRunningRef.current = patch.isRunning;
      accumulatedMsRef.current = patch.accumulatedMs;
      segmentStartedAtRef.current = patch.segmentStartedAt;
      if (patch.epochOffsetMs !== undefined) {
        epochOffsetMsRef.current = patch.epochOffsetMs;
      }
      bumpGenerationState();
      notifyTick();
    },
    [bumpGenerationState, notifyTick],
  );

  const getSnapshot = useCallback((): SharedTimerSnapshot => {
    return buildSnapshot(
      generationRef.current,
      isRunningRef.current,
      accumulatedMsRef.current,
      segmentStartedAtRef.current,
      isHost ? 0 : epochOffsetMsRef.current,
    );
  }, [isHost]);

  const getElapsedMs = useCallback(() => {
    return computeElapsedMs(Date.now(), getSnapshot());
  }, [getSnapshot]);

  const subscribeTick = useCallback((cb: () => void) => {
    tickListenersRef.current.add(cb);
    return () => {
      tickListenersRef.current.delete(cb);
    };
  }, []);

  const sendPayload = useCallback(
    (channel: RealtimeChannel, payload: SharedTimerBroadcastPayload) => {
      void channel.send({ type: 'broadcast', event: BROADCAST_EVENT, payload });
    },
    [],
  );

  const emitSyncResponse = useCallback(() => {
    if (syncResponseDebounceRef.current) {
      clearTimeout(syncResponseDebounceRef.current);
    }
    syncResponseDebounceRef.current = setTimeout(() => {
      syncResponseDebounceRef.current = null;
      const ch = channelRef.current;
      if (!ch || !connectedRef.current) return;
      const now = Date.now();
      const payload: SharedTimerBroadcastPayload = {
        action: 'SYNC_RESPONSE',
        authoritativeTimestamp: now,
        senderId: localUserId,
        generation: generationRef.current,
        isRunning: isRunningRef.current,
        segmentStartedAt: segmentStartedAtRef.current,
        accumulatedMsBeforeSegment: accumulatedMsRef.current,
        snapshotHostNow: now,
      };
      sendPayload(ch, payload);
    }, 120);
  }, [localUserId, sendPayload]);

  const markProcessed = useCallback((dedupeKey: string) => {
    if (processedBroadcastKeysRef.current.has(dedupeKey)) return false;
    processedBroadcastKeysRef.current.add(dedupeKey);
    if (processedBroadcastKeysRef.current.size > 200) {
      processedBroadcastKeysRef.current.clear();
    }
    return true;
  }, []);

  const handleIncomingPayload = useCallback(
    (payload: SharedTimerBroadcastPayload, dedupeKey: string) => {
      if (processedBroadcastKeysRef.current.has(dedupeKey)) return;

      switch (payload.action) {
        case 'SYNC_REQUEST': {
          if (!isHost) return;
          if (!markProcessed(dedupeKey)) return;
          emitSyncResponse();
          return;
        }
        case 'SYNC_RESPONSE': {
          if (isHost) return;
          if (!markProcessed(dedupeKey)) return;
          const localReceive = Date.now();
          const epochOffsetMs = payload.snapshotHostNow - localReceive;
          applyModel({
            generation: payload.generation,
            isRunning: payload.isRunning,
            accumulatedMs: payload.accumulatedMsBeforeSegment,
            segmentStartedAt: payload.segmentStartedAt,
            epochOffsetMs,
          });
          return;
        }
        case 'RESET': {
          if (!markProcessed(dedupeKey)) return;
          applyModel({
            generation: payload.nextGeneration,
            isRunning: false,
            accumulatedMs: 0,
            segmentStartedAt: null,
          });
          return;
        }
        case 'START': {
          if (payload.generation < generationRef.current) return;
          if (!markProcessed(dedupeKey)) return;
          applyModel({
            generation: payload.generation,
            isRunning: true,
            accumulatedMs: payload.accumulatedMsBeforeSegment,
            segmentStartedAt: payload.segmentStartedAt,
          });
          return;
        }
        case 'PAUSE': {
          if (payload.generation !== generationRef.current) return;
          if (!markProcessed(dedupeKey)) return;
          applyModel({
            generation: payload.generation,
            isRunning: false,
            accumulatedMs: payload.accumulatedMsAtPause,
            segmentStartedAt: null,
          });
          return;
        }
        default:
          return;
      }
    },
    [applyModel, emitSyncResponse, isHost, markProcessed],
  );

  const broadcastAndApplyHost = useCallback(
    (channel: RealtimeChannel, payload: SharedTimerBroadcastPayload) => {
      const dedupeKey = `${payload.action}-${payload.authoritativeTimestamp}-${payload.senderId}-${'generation' in payload ? payload.generation : 'na'}`;
      sendPayload(channel, payload);
      handleIncomingPayload(payload, dedupeKey);
    },
    [handleIncomingPayload, sendPayload],
  );

  const start = useCallback(() => {
    if (!isHost) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[useSharedTimerSync] start() ignored: not host');
      }
      return;
    }
    const channel = channelRef.current;
    if (!channel || !connectedRef.current) return;

    const now = Date.now();
    const gen = generationRef.current;
    const accumulatedMsBeforeSegment = accumulatedMsRef.current;
    isRunningRef.current = true;
    segmentStartedAtRef.current = now;
    bumpGenerationState();
    notifyTick();

    const payload: SharedTimerBroadcastPayload = {
      action: 'START',
      authoritativeTimestamp: now,
      senderId: localUserId,
      generation: gen,
      segmentStartedAt: now,
      accumulatedMsBeforeSegment,
    };
    broadcastAndApplyHost(channel, payload);
  }, [broadcastAndApplyHost, bumpGenerationState, isHost, localUserId, notifyTick]);

  const pause = useCallback(() => {
    if (!isHost) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[useSharedTimerSync] pause() ignored: not host');
      }
      return;
    }
    const channel = channelRef.current;
    if (!channel || !connectedRef.current) return;

    const now = Date.now();
    const snap = buildSnapshot(
      generationRef.current,
      isRunningRef.current,
      accumulatedMsRef.current,
      segmentStartedAtRef.current,
      isHost ? 0 : epochOffsetMsRef.current,
    );
    const elapsed = computeElapsedMs(now, snap);

    isRunningRef.current = false;
    segmentStartedAtRef.current = null;
    accumulatedMsRef.current = elapsed;
    bumpGenerationState();
    notifyTick();

    const payload: SharedTimerBroadcastPayload = {
      action: 'PAUSE',
      authoritativeTimestamp: now,
      senderId: localUserId,
      generation: generationRef.current,
      accumulatedMsAtPause: elapsed,
    };
    broadcastAndApplyHost(channel, payload);
  }, [broadcastAndApplyHost, bumpGenerationState, isHost, localUserId, notifyTick]);

  const reset = useCallback(() => {
    if (!isHost) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[useSharedTimerSync] reset() ignored: not host');
      }
      return;
    }
    const channel = channelRef.current;
    if (!channel || !connectedRef.current) return;

    const now = Date.now();
    const prevGen = generationRef.current;
    const nextGen = prevGen + 1;
    generationRef.current = nextGen;
    isRunningRef.current = false;
    segmentStartedAtRef.current = null;
    accumulatedMsRef.current = 0;
    bumpGenerationState();
    notifyTick();

    const payload: SharedTimerBroadcastPayload = {
      action: 'RESET',
      authoritativeTimestamp: now,
      senderId: localUserId,
      generation: prevGen,
      nextGeneration: nextGen,
    };
    broadcastAndApplyHost(channel, payload);
  }, [broadcastAndApplyHost, bumpGenerationState, isHost, localUserId, notifyTick]);

  useEffect(() => {
    if (!enabled || !topic) {
      setConnectionStatus('disconnected');
      return;
    }

    const supabase = createClient();
    const channel = supabase.channel(topic, {
      config: { broadcast: { ack: false } },
    });
    channelRef.current = channel;
    syncRequestSentRef.current = false;
    processedBroadcastKeysRef.current.clear();

    channel.on('broadcast', { event: BROADCAST_EVENT }, (message) => {
      const raw = message.payload;
      const payload = parseSharedTimerBroadcastPayload(raw);
      if (!payload) return;

      const genPart =
        'generation' in payload
          ? String(payload.generation)
          : payload.action === 'SYNC_REQUEST'
            ? 'sr'
            : 'na';
      const dedupeKey = `${payload.action}-${payload.authoritativeTimestamp}-${payload.senderId}-${genPart}`;

      handleIncomingPayload(payload, dedupeKey);
    });

    setConnectionStatus('connecting');

    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        connectedRef.current = true;
        setConnectionStatus('connected');
        epochOffsetMsRef.current = 0;
        if (!isHost && !syncRequestSentRef.current) {
          syncRequestSentRef.current = true;
          const now = Date.now();
          const req: SharedTimerBroadcastPayload = {
            action: 'SYNC_REQUEST',
            authoritativeTimestamp: now,
            senderId: localUserId,
            requestId: `${localUserId}-${now}`,
          };
          sendPayload(channel, req);
        }
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        connectedRef.current = false;
        console.error('[useSharedTimerSync] subscribe', status, err);
        setConnectionStatus('error');
      }
    });

    return () => {
      connectedRef.current = false;
      if (syncResponseDebounceRef.current) {
        clearTimeout(syncResponseDebounceRef.current);
        syncResponseDebounceRef.current = null;
      }
      channelRef.current = null;
      void supabase.removeChannel(channel);
      setConnectionStatus('disconnected');
    };
  }, [enabled, topic, localUserId, hostUserId, isHost, handleIncomingPayload, sendPayload]);

  return useMemo(
    () => ({
      connectionStatus,
      isHost,
      generation,
      getSnapshot,
      getElapsedMs,
      subscribeTick,
      start,
      pause,
      reset,
    }),
    [
      connectionStatus,
      isHost,
      generation,
      getSnapshot,
      getElapsedMs,
      subscribeTick,
      start,
      pause,
      reset,
    ],
  );
}
