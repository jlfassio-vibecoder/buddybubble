'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { createClient } from '@utils/supabase/client';
import {
  type LiveAspectRatioId,
  type SharedTimerConnectionStatus,
  type SharedTimerSessionStatus,
  type SharedTimerSnapshot,
} from '@/features/live-video/shells/shared/shared-timer-sync.types';
import { useSessionState } from '@/features/live-video/hooks/useSessionState';
import type { SessionAspectRatioId } from '@/features/live-video/state/sessionStateMachine';

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
  /** Host-synced aspect ratio; updates on `LAYOUT_CHANGE` and `SYNC_RESPONSE` (for React re-renders). */
  aspectRatio: LiveAspectRatioId;
  /** Read-only view of ref-backed model; safe to call inside `requestAnimationFrame`. */
  getSnapshot: () => SharedTimerSnapshot;
  /** Same as `computeElapsedMs(Date.now(), getSnapshot())` for convenience. */
  getElapsedMs: () => number;
  subscribeTick: (cb: () => void) => () => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
  setAspectRatio: (ratio: LiveAspectRatioId) => void;
};

function buildSnapshot(
  status: SharedTimerSessionStatus,
  generation: number,
  elapsedMs: number,
  segmentStartedAt: number | null,
  aspectRatio: LiveAspectRatioId,
): SharedTimerSnapshot {
  return {
    status,
    generation,
    isRunning: status === 'running',
    accumulatedMs: status === 'running' ? 0 : elapsedMs,
    segmentStartedAt,
    epochOffsetMs: 0,
    aspectRatio,
  };
}

/**
 * @deprecated This hook has been folded into `useSessionState` + `LiveSessionRuntimeProvider`.
 * Prefer consuming `useLiveSessionRuntime()` from `src/features/live-video/theater/live-session-runtime-context.tsx`.
 */
export function useSharedTimerSync(options: UseSharedTimerSyncOptions): UseSharedTimerSyncResult {
  const { topic, localUserId, hostUserId, enabled = true } = options;

  const { workspaceId, sessionId } = useMemo(() => {
    // Legacy topics remain `timer-sync:${workspaceId}:${sessionId}`. The unified session hook
    // publishes on `room-session:${workspaceId}:${sessionId}` and the runtime sits above it.
    if (!topic.startsWith('timer-sync:')) {
      return { workspaceId: '', sessionId: '' };
    }
    const parts = topic.split(':');
    return { workspaceId: parts[1] ?? '', sessionId: parts[2] ?? '' };
  }, [topic]);

  const supabase = useMemo(() => createClient(), []);
  const session = useSessionState({
    workspaceId,
    sessionId,
    localUserId,
    hostUserId,
    supabase,
    enabled,
  });

  const aspectRatio = session.state.aspectRatio as LiveAspectRatioId;
  const generation = session.state.generation;

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(
        '[DEBUG] useSharedTimerSync render: topic=%s aspectRatio=%s connection=%s',
        topic,
        aspectRatio,
        session.connectionStatus,
      );
    }
  }, [aspectRatio, session.connectionStatus, topic]);

  const getSnapshot = useCallback((): SharedTimerSnapshot => {
    const status: SharedTimerSessionStatus =
      session.state.status === 'idle'
        ? 'idle'
        : session.state.status === 'paused'
          ? 'paused'
          : 'running';
    return buildSnapshot(
      status,
      session.state.generation,
      session.getElapsedMs(),
      status === 'running' ? session.state.blockStartedAt : null,
      aspectRatio,
    );
  }, [aspectRatio, session]);

  const getElapsedMs = useCallback(() => session.getElapsedMs(), [session]);
  const subscribeTick = useCallback((cb: () => void) => session.subscribeTick(cb), [session]);

  const setAspectRatio = useCallback(
    (ratio: LiveAspectRatioId) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(
          '[DEBUG] useSharedTimerSync setAspectRatio requested: ratio=%s isHost=%s',
          ratio,
          session.isHost,
        );
      }
      session.actions.setAspectRatio(ratio as SessionAspectRatioId);
    },
    [session],
  );

  const start = useCallback(() => session.actions.startSession(), [session]);
  const pause = useCallback(() => session.actions.pauseSession(), [session]);
  const reset = useCallback(() => session.actions.endSession(), [session]);

  const connectionStatus: SharedTimerConnectionStatus = session.connectionStatus;

  return useMemo(
    () => ({
      connectionStatus,
      isHost: session.isHost,
      generation,
      aspectRatio,
      getSnapshot,
      getElapsedMs,
      subscribeTick,
      start,
      pause,
      reset,
      setAspectRatio,
    }),
    [
      aspectRatio,
      connectionStatus,
      generation,
      getElapsedMs,
      getSnapshot,
      pause,
      reset,
      session.isHost,
      setAspectRatio,
      start,
      subscribeTick,
    ],
  );
}
