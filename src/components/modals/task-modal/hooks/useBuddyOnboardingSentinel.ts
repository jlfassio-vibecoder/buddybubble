'use client';

import { useEffect, useRef } from 'react';
import type { AgentDefinitionLite } from '@/lib/agents/resolveTargetAgent';
import { BUDDY_ONBOARDING_SYSTEM_EVENT } from '@/lib/agents/buddy-sentinel';
import type { useMessageThread } from '@/hooks/useMessageThread';

export type UseBuddyOnboardingSentinelArgs = {
  taskId: string;
  canWrite: boolean;
  isLoading: boolean;
  messagesLength: number;
  buddyAgent: AgentDefinitionLite | null;
  sendMessage: ReturnType<typeof useMessageThread>['sendMessage'];
};

/**
 * Inserts Buddy onboarding sentinel once per task when the thread is empty and writable.
 * Extracted from the former task-modal comments rail wrapper; uses the rail's `sendMessage` (no extra subscription).
 */
export function useBuddyOnboardingSentinel({
  taskId,
  canWrite,
  isLoading,
  messagesLength,
  buddyAgent,
  sendMessage,
}: UseBuddyOnboardingSentinelArgs): void {
  const buddyTriggerFiredRef = useRef<Set<string>>(new Set());
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  useEffect(() => {
    if (!taskId) return;
    if (isLoading) return;
    if (!canWrite) return;
    if (messagesLength !== 0) return;
    if (buddyTriggerFiredRef.current.has(taskId)) return;
    if (!buddyAgent) return;

    buddyTriggerFiredRef.current.add(taskId);

    void sendMessageRef
      .current(BUDDY_ONBOARDING_SYSTEM_EVENT)
      .then(() => {
        /* sentinel insert */
      })
      .catch((e) => {
        console.error('[Buddy UI] task panel silent onboarding trigger failed', e);
        buddyTriggerFiredRef.current.delete(taskId);
      });
  }, [taskId, isLoading, canWrite, messagesLength, buddyAgent]);
}
