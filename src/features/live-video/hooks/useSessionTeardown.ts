'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import {
  SESSION_COMMAND_EVENT,
  parseSessionCommandPayload,
} from '@/features/live-video/state/session-sync.types';
import { removeRealtimeBroadcastListener } from '@/features/live-video/lib/remove-realtime-broadcast-listener';

export type UseSessionTeardownArgs = {
  realtimeChannel: RealtimeChannel | null;
  hostUserId: string | null;
  sessionId: string | null;
  leaveAgoraChannel: () => void;
};

export function useSessionTeardown({
  realtimeChannel,
  hostUserId,
  sessionId,
  leaveAgoraChannel,
}: UseSessionTeardownArgs): { isSessionEnded: boolean; endedAt: number | null } {
  const [isSessionEnded, setIsSessionEnded] = useState(false);
  const [endedAt, setEndedAt] = useState<number | null>(null);

  const hostUserIdRef = useRef(hostUserId);
  const sessionIdRef = useRef(sessionId);
  const leaveAgoraChannelRef = useRef(leaveAgoraChannel);

  useEffect(() => {
    hostUserIdRef.current = hostUserId;
  }, [hostUserId]);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  useEffect(() => {
    leaveAgoraChannelRef.current = leaveAgoraChannel;
  }, [leaveAgoraChannel]);

  useEffect(() => {
    setIsSessionEnded(false);
    setEndedAt(null);
  }, [sessionId]);

  useEffect(() => {
    if (!realtimeChannel) return;

    let alive = true;

    const handleSessionCommand = (message: { payload: unknown }) => {
      if (!alive) return;
      const parsed = parseSessionCommandPayload(message.payload);
      if (!parsed || parsed.type !== 'SESSION_TERMINATED') return;
      if (parsed.senderId !== hostUserIdRef.current) return;
      if (!sessionIdRef.current || parsed.sessionId !== sessionIdRef.current) return;

      try {
        leaveAgoraChannelRef.current();
      } catch {
        /* best-effort */
      }
      setIsSessionEnded(true);
      setEndedAt(Date.now());
    };

    realtimeChannel.on('broadcast', { event: SESSION_COMMAND_EVENT }, handleSessionCommand);
    return () => {
      alive = false;
      removeRealtimeBroadcastListener(realtimeChannel, SESSION_COMMAND_EVENT, handleSessionCommand);
    };
  }, [realtimeChannel]);

  return { isSessionEnded, endedAt };
}
