'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { MessageAttachment } from '@/types/message-attachment';
import type { BubbleRow } from '@/types/database';
import { useUserProfileStore } from '@/store/userProfileStore';
import { useMessageThread } from '@/hooks/useMessageThread';
import { useTaskBubbleUps } from '@/hooks/use-task-bubble-ups';
import { createClient } from '@utils/supabase/client';
import { supabaseClientErrorMessage } from '@/lib/supabase-client-error';
import { MessageMediaModal } from '@/components/chat/MessageMediaModal';
import { StandardTaskChatRail } from '@/components/chat/StandardTaskChatRail';
import { defaultSlugForItemType } from '@/lib/agents/defaultSlugForItemType';
import { BUDDY_ONBOARDING_SYSTEM_EVENT } from '@/lib/agents/buddy-sentinel';
import { BUDDY_SLUG } from '@/lib/agents/buddy/config';
import type { ItemType } from '@/lib/item-types';
import type {
  TaskModalChatCardWorkoutActions,
  TaskModalCommentsPanelHandle,
} from '@/components/modals/task-modal/TaskModalCommentsPanel';

export type TaskModalChatRailAdapterProps = {
  taskId: string;
  workspaceId: string;
  bubbles: BubbleRow[];
  canWrite: boolean;
  initialCommentThreadMessageId?: string | null;
  onThreadViewChange?: (inThread: boolean) => void;
  onMarkedRead?: () => void;
  onCoachDraftFinalizeSuccess?: () => void | Promise<void>;
  chatCardWorkoutActions?: TaskModalChatCardWorkoutActions | null;
  taskBubbleIdHint?: string | null;
  /** `tasks.item_type` — drives `defaultAgentSlug` for the rail (Phase 0 §3c). */
  itemType?: ItemType | null;
};

export const TaskModalChatRailAdapter = forwardRef<
  TaskModalCommentsPanelHandle,
  TaskModalChatRailAdapterProps
>(function TaskModalChatRailAdapter(
  {
    taskId,
    workspaceId,
    bubbles,
    canWrite,
    initialCommentThreadMessageId = null,
    onThreadViewChange,
    onMarkedRead,
    onCoachDraftFinalizeSuccess,
    chatCardWorkoutActions = null,
    taskBubbleIdHint = null,
    itemType = null,
  },
  ref,
) {
  const myProfile = useUserProfileStore((s) => s.profile);

  const defaultAgentSlug = useMemo(() => defaultSlugForItemType(itemType ?? null), [itemType]);

  const sentinelThread = useMessageThread({
    filter: { scope: 'task', taskId },
    workspaceId,
    bubbles,
    canPostMessages: canWrite,
    taskBubbleIdHint,
  });

  const { messages, agentsByAuthUserId, isLoading } = sentinelThread;

  const onMarkedReadRef = useRef(onMarkedRead);
  onMarkedReadRef.current = onMarkedRead;

  const recordCommentsViewed = useCallback(async () => {
    const uid = myProfile?.id;
    if (!uid) return;
    const supabase = createClient();
    const { error } = await supabase.from('user_task_views').upsert(
      {
        user_id: uid,
        task_id: taskId,
        last_viewed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,task_id' },
    );
    if (error) {
      console.warn(
        '[TaskModalChatRailAdapter] user_task_views upsert failed',
        supabaseClientErrorMessage(error),
      );
      return;
    }
    onMarkedReadRef.current?.();
  }, [myProfile?.id, taskId]);

  useEffect(() => {
    if (!myProfile?.id) return;
    let cancelled = false;
    const debounceMs = 1500;
    const t = window.setTimeout(() => {
      if (cancelled) return;
      void recordCommentsViewed();
    }, debounceMs);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [myProfile?.id, taskId, recordCommentsViewed]);

  useImperativeHandle(ref, () => ({
    exitThread: () => {},
  }));

  useEffect(() => {
    onThreadViewChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount per Phase 2 spec
  }, []);

  const buddyTriggerFiredRef = useRef<Set<string>>(new Set());
  const sendMessageRef = useRef(sentinelThread.sendMessage);
  sendMessageRef.current = sentinelThread.sendMessage;

  const availableAgents = useMemo(() => [...agentsByAuthUserId.values()], [agentsByAuthUserId]);
  const buddyAgent = useMemo(
    () => availableAgents.find((a) => a.slug === BUDDY_SLUG) ?? null,
    [availableAgents],
  );

  useEffect(() => {
    if (!taskId) return;
    if (isLoading) return;
    if (!canWrite) return;
    if (messages.length !== 0) return;
    if (buddyTriggerFiredRef.current.has(taskId)) return;
    if (!buddyAgent) return;

    buddyTriggerFiredRef.current.add(taskId);

    void sendMessageRef
      .current(BUDDY_ONBOARDING_SYSTEM_EVENT)
      .then(() => {
        /* sentinel insert; rail defaultAgentSlug from itemType (Phase 3) — no waitMain on sentinel path */
      })
      .catch((e) => {
        console.error('[Buddy UI] task panel silent onboarding trigger failed', e);
        buddyTriggerFiredRef.current.delete(taskId);
      });
  }, [taskId, isLoading, canWrite, messages.length, buddyAgent]);

  const embeddedTaskIds = useMemo(() => {
    const s = new Set<string>();
    for (const m of messages) {
      if (m.attached_task_id) s.add(m.attached_task_id);
    }
    return [...s];
  }, [messages]);

  const { bubbleUpPropsFor } = useTaskBubbleUps(embeddedTaskIds);

  const [mediaModal, setMediaModal] = useState<{
    attachments: MessageAttachment[];
    index: number;
  } | null>(null);

  const deepLinkConsumedRef = useRef(false);

  useEffect(() => {
    deepLinkConsumedRef.current = false;
  }, [taskId, initialCommentThreadMessageId]);

  useEffect(() => {
    const raw = initialCommentThreadMessageId?.trim();
    if (!raw || isLoading || deepLinkConsumedRef.current) return;
    if (!messages.some((m) => m.id === raw)) return;

    const t = window.setTimeout(() => {
      const el = document.querySelector(`[data-message-id="${CSS.escape(raw)}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      deepLinkConsumedRef.current = true;
    }, 150);

    return () => window.clearTimeout(t);
  }, [initialCommentThreadMessageId, isLoading, messages]);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <MessageMediaModal
        open={mediaModal !== null}
        onOpenChange={(open) => {
          if (!open) setMediaModal(null);
        }}
        attachments={mediaModal?.attachments ?? []}
        initialIndex={mediaModal?.index ?? 0}
      />

      <StandardTaskChatRail
        workspaceId={workspaceId}
        taskId={taskId}
        bubbleId={taskBubbleIdHint ?? undefined}
        canPostMessages={canWrite}
        defaultAgentSlug={defaultAgentSlug}
        transcriptFilter={(row) => row.content !== BUDDY_ONBOARDING_SYSTEM_EVENT}
        chatRowExtras={{
          onCoachDraftFinalizeSuccess,
          chatCardWorkoutActions,
          bubbleUpPropsFor,
          onOpenAttachment: (attachments, index) => setMediaModal({ attachments, index }),
        }}
      />
    </div>
  );
});
