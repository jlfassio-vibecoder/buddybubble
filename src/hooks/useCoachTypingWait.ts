'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SendMessageSuccess } from '@/hooks/useMessageThread';

const COACH_WAIT_FAILSAFE_MS = 15_000;

export type CoachTypingMessageSlice = {
  id: string;
  user_id: string;
  created_at: string;
  parent_id?: string | null;
};

type UseCoachTypingWaitArgs = {
  /** Messages for this feed only (e.g. root-only or one thread) so “latest” matches the UI. */
  messages: CoachTypingMessageSlice[];
  myUserId: string | null | undefined;
};

function latestMessage(messages: CoachTypingMessageSlice[]): CoachTypingMessageSlice | null {
  if (messages.length === 0) return null;
  return messages.reduce((best, m) => {
    const t = new Date(m.created_at).getTime();
    const bt = new Date(best.created_at).getTime();
    if (t > bt) return m;
    if (t < bt) return best;
    return m.id > best.id ? m : best;
  });
}

/**
 * Coach typing row: optimistic intent on send, register server id after successful `sendMessage`,
 * clear when someone else’s message becomes latest in this slice, or after 15s failsafe.
 */
export function useCoachTypingWait({ messages, myUserId }: UseCoachTypingWaitArgs) {
  const [isWaitingForCoach, setIsWaitingForCoach] = useState(false);
  const failsafeTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  /** Set when the outbound message is persisted; until then only the failsafe may clear. */
  const outboundMessageIdRef = useRef<string | null>(null);

  const clearFailsafe = useCallback(() => {
    if (failsafeTimerRef.current != null) {
      clearTimeout(failsafeTimerRef.current);
      failsafeTimerRef.current = null;
    }
  }, []);

  const clear = useCallback(() => {
    clearFailsafe();
    outboundMessageIdRef.current = null;
    setIsWaitingForCoach(false);
  }, [clearFailsafe]);

  const beginWait = useCallback(() => {
    clearFailsafe();
    setIsWaitingForCoach(true);
    failsafeTimerRef.current = globalThis.setTimeout(() => {
      failsafeTimerRef.current = null;
      outboundMessageIdRef.current = null;
      setIsWaitingForCoach(false);
    }, COACH_WAIT_FAILSAFE_MS);
  }, [clearFailsafe]);

  useEffect(() => {
    return () => {
      clearFailsafe();
    };
  }, [clearFailsafe]);

  const optimisticIntent = useCallback(() => {
    outboundMessageIdRef.current = null;
    beginWait();
  }, [beginWait]);

  const registerSuccessfulSend = useCallback(
    (sent: SendMessageSuccess) => {
      outboundMessageIdRef.current = sent.messageId;
      beginWait();
    },
    [beginWait],
  );

  useEffect(() => {
    if (!isWaitingForCoach || !myUserId) return;
    const outboundId = outboundMessageIdRef.current;
    if (!outboundId) return;
    if (!messages.some((m) => m.id === outboundId)) return;

    const latest = latestMessage(messages);
    if (!latest) return;
    if (latest.user_id !== myUserId) {
      clear();
    }
  }, [messages, isWaitingForCoach, myUserId, clear]);

  return {
    isWaitingForCoach,
    optimisticIntent,
    registerSuccessfulSend,
    clear,
  };
}
