'use client';

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  type UIEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import type { BubbleRow, TaskRow } from '@/types/database';
import type { MessageAttachment } from '@/types/message-attachment';
import type { ChatMessage } from '@/types/chat';
import { useUserProfileStore } from '@/store/userProfileStore';
import { useMessageThread } from '@/hooks/useMessageThread';
import { useAgentResponseWait } from '@/hooks/useAgentResponseWait';
import { AgentTypingIndicator } from '@/components/chat/AgentTypingIndicator';
import { useTaskBubbleUps } from '@/hooks/use-task-bubble-ups';
import { rowToChatMessage } from '@/lib/chat-message-mapper';
import { resolveTargetAgent } from '@/lib/agents/resolveTargetAgent';
import { toChatUserSnapshot } from '@/lib/message-thread';
import { MESSAGE_ATTACHMENT_FILE_ACCEPT } from '@/lib/message-attachment-limits';
import { ChatMessageRow } from '@/components/chat/ChatMessageRow';
import { RichMessageComposer } from '@/components/chat/RichMessageComposer';
import { MessageMediaModal } from '@/components/chat/MessageMediaModal';
import { createClient } from '@utils/supabase/client';
import { supabaseClientErrorMessage } from '@/lib/supabase-client-error';
import { Button } from '@/components/ui/button';
import { PremiumGate } from '@/components/subscription/premium-gate';

/**
 * Silent system-message sentinel that wakes the Buddy agent on first entry into an empty task
 * comment thread. Inserted as a normal `messages` row so the webhook fires; filtered out of
 * every downstream view so the user never sees the raw string. Keep in sync with the value in
 * `src/components/chat/ChatArea.tsx` and `supabase/functions/buddy-agent-dispatch`.
 */
const BUDDY_ONBOARDING_SYSTEM_EVENT = '[SYSTEM_EVENT: ONBOARDING_STARTED]';

/**
 * Default target agent slug for task-modal comments. A task lives inside a bubble whose agent
 * binding drives which agent (if any) replies to unscoped comments. We mirror the BuddyBubble
 * default (`'coach'`) so per-bubble Coach variants will be picked up automatically when the
 * bindings resolve them.
 */
const TASK_COMMENTS_DEFAULT_AGENT_SLUG = 'coach';

type TaskPickerRow = {
  id: string;
  title: string;
  status: string;
  type: 'task' | 'request' | 'idea';
};

export type TaskModalCommentsPanelHandle = {
  exitThread: () => void;
};

/** Passed from TaskModal into chat rows for coach draft / embedded task workout actions. */
export type TaskModalChatCardWorkoutActions = {
  modalTaskId: string;
  onReviewDetails: () => void;
  onGenerateWorkout?: () => void;
  generateBusy: boolean;
};

export type TaskModalCommentsPanelProps = {
  taskId: string;
  workspaceId: string;
  bubbles: BubbleRow[];
  canWrite: boolean;
  /** Task-scoped `messages.id` to open that comment thread after messages load (replies resolve from `parent_id`). */
  initialCommentThreadMessageId?: string | null;
  /** Notifies parent (e.g. `TaskModal`) to switch chrome title between Comments vs Replies. */
  onThreadViewChange?: (inThread: boolean) => void;
  /** After `user_task_views` is updated (debounced); parent may refresh Kanban unread. */
  onMarkedRead?: () => void;
  /**
   * When the hero is hidden (e.g. workout split pane), show a single-row Generate control here.
   * Otherwise generation is offered from the hero next to the description toggle.
   */
  showInlineGenerateWorkout?: boolean;
  onGenerateWorkout?: () => void;
  generateWorkoutBusy?: boolean;
  /** Forwarded from TaskModal so scrolling the message list collapses the cinematic hero (non-unified layout). */
  onMessagesScroll?: (e: UIEvent<HTMLDivElement>) => void;
  /** Parent coordinates scroll (hero + messages); no nested message scroll areas. */
  unifiedScrollLayout?: boolean;
  /**
   * When set with `unifiedScrollLayout`, RichMessageComposer renders via portal into this element.
   */
  composerPortalHost?: HTMLElement | null;
  /** Parent scroll container (for thread auto-scroll when unified). */
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  /** When true with `unifiedScrollLayout`, omit the inline “Back to comments” row (parent shows it). */
  hideThreadBackRow?: boolean;
  /** After coach draft finalize: parent refetches task, switches to Details, focuses description. */
  onCoachDraftFinalizeSuccess?: () => void | Promise<void>;
  /** TaskModal-only: Review / Generate on coach draft and matching embedded task cards. */
  chatCardWorkoutActions?: TaskModalChatCardWorkoutActions | null;
  /**
   * Resolved bubble for this task (`TaskModal`’s `bubbleId`) so coach agent bindings load
   * immediately instead of waiting on `tasks.bubble_id` / first message row.
   */
  taskBubbleIdHint?: string | null;
};

export const TaskModalCommentsPanel = forwardRef<
  TaskModalCommentsPanelHandle,
  TaskModalCommentsPanelProps
>(function TaskModalCommentsPanel(
  {
    taskId,
    workspaceId,
    bubbles,
    canWrite,
    initialCommentThreadMessageId = null,
    onThreadViewChange,
    onMarkedRead,
    showInlineGenerateWorkout = false,
    onGenerateWorkout,
    generateWorkoutBusy = false,
    onMessagesScroll,
    unifiedScrollLayout = false,
    composerPortalHost = null,
    scrollContainerRef,
    hideThreadBackRow = false,
    onCoachDraftFinalizeSuccess,
    chatCardWorkoutActions = null,
    taskBubbleIdHint = null,
  },
  ref,
) {
  const myProfile = useUserProfileStore((s) => s.profile);
  const [draft, setDraft] = useState('');
  const [threadDraft, setThreadDraft] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [threadPendingFiles, setThreadPendingFiles] = useState<File[]>([]);
  const [activeThreadParent, setActiveThreadParent] = useState<ChatMessage | null>(null);
  const [allTasks, setAllTasks] = useState<TaskPickerRow[]>([]);
  const [mediaModal, setMediaModal] = useState<{
    attachments: MessageAttachment[];
    index: number;
  } | null>(null);
  const composerPopoverRef = useRef<HTMLDivElement>(null);
  const threadComposerPopoverRef = useRef<HTMLDivElement>(null);
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const rootFeedScrollRef = useRef<HTMLDivElement>(null);
  const deepLinkConsumedRef = useRef(false);

  const unified = unifiedScrollLayout;
  const portalComposers = unifiedScrollLayout && Boolean(composerPortalHost);

  useImperativeHandle(ref, () => ({
    exitThread: () => setActiveThreadParent(null),
  }));

  const chat = useMessageThread({
    filter: { scope: 'task', taskId },
    workspaceId,
    bubbles,
    canPostMessages: canWrite,
    taskBubbleIdHint,
  });

  const { messages, userById, teamMembers, agentsByAuthUserId, replyCounts, sending, isLoading } =
    chat;

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
        '[TaskModalCommentsPanel] user_task_views upsert failed',
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

  useEffect(() => {
    setActiveThreadParent(null);
  }, [taskId]);

  useEffect(() => {
    onThreadViewChange?.(activeThreadParent != null);
  }, [activeThreadParent, onThreadViewChange]);

  useEffect(() => {
    setThreadDraft('');
    setThreadPendingFiles([]);
  }, [activeThreadParent?.id]);

  useEffect(() => {
    if (!workspaceId || bubbles.length === 0) {
      setAllTasks([]);
      return;
    }
    const bubbleIds = bubbles.map((b) => b.id);
    let cancelled = false;
    async function loadTasksForSlashMentions() {
      const supabase = createClient();
      const taskQuery = supabase
        .from('tasks')
        .select('id, title, status, bubble_id, position, archived_at')
        .in('bubble_id', bubbleIds)
        .is('archived_at', null)
        .order('bubble_id', { ascending: true })
        .order('position', { ascending: true });
      const { data, error } = await taskQuery;
      if (cancelled) return;
      if (error) {
        console.error(
          '[TaskModalCommentsPanel] load tasks for / mentions',
          supabaseClientErrorMessage(error),
        );
        setAllTasks([]);
        return;
      }
      const mapped: TaskPickerRow[] = (data ?? []).map((t) => {
        const row = t as Pick<TaskRow, 'id' | 'title' | 'status'>;
        return {
          id: row.id,
          title: row.title,
          status: row.status,
          type: 'task' as const,
        };
      });
      setAllTasks(mapped);
    }
    void loadTasksForSlashMentions();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, bubbles, myProfile?.id]);

  const teamMembersResolved = useMemo(() => {
    if (!myProfile) return teamMembers;
    return teamMembers.map((m) =>
      m.id === myProfile.id
        ? {
            ...m,
            name: myProfile.full_name?.trim() || m.name,
            avatar: myProfile.avatar_url ?? m.avatar,
          }
        : m,
    );
  }, [teamMembers, myProfile]);

  const richMentionConfig = useMemo(
    () => ({
      members: teamMembersResolved.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
      })),
    }),
    [teamMembersResolved],
  );

  const richSlashConfig = useMemo(() => ({ tasks: allTasks }), [allTasks]);

  const bubbleNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of bubbles) m[b.id] = b.name;
    return m;
  }, [bubbles]);

  const sortedRows = useMemo(
    () =>
      // Hide the silent Buddy onboarding sentinel from every downstream view (root feed, thread
      // panel, coach-typing detection). The raw string must NEVER reach the comment UI.
      [...messages]
        .filter((m) => m.content !== BUDDY_ONBOARDING_SYSTEM_EVENT)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [messages],
  );

  const agentScopeRootMessages = useMemo(
    () => sortedRows.filter((m) => m.parent_id == null || m.parent_id === ''),
    [sortedRows],
  );
  const agentScopeThreadMessages = useMemo(() => {
    const pid = activeThreadParent?.id;
    if (!pid) return [];
    return sortedRows.filter((m) => m.id === pid || m.parent_id === pid);
  }, [sortedRows, activeThreadParent?.id]);

  const availableAgents = useMemo(() => [...agentsByAuthUserId.values()], [agentsByAuthUserId]);
  const buddyAgent = useMemo(
    () => availableAgents.find((a) => a.slug === 'buddy') ?? null,
    [availableAgents],
  );

  const waitMain = useAgentResponseWait({
    messages: agentScopeRootMessages,
    myUserId: myProfile?.id ?? null,
    agentsByAuthUserId,
  });
  const waitThread = useAgentResponseWait({
    messages: agentScopeThreadMessages,
    myUserId: myProfile?.id ?? null,
    agentsByAuthUserId,
  });

  const waitMainClear = waitMain.clear;
  const waitMainRegisterIntent = waitMain.registerIntent;
  const waitMainRegisterSuccessfulSend = waitMain.registerSuccessfulSend;
  const waitThreadClear = waitThread.clear;

  const chatMessages: ChatMessage[] = useMemo(() => {
    return sortedRows.map((row) => {
      const base = userById[row.user_id];
      const user = myProfile && row.user_id === myProfile.id ? toChatUserSnapshot(myProfile) : base;
      return rowToChatMessage(
        row,
        user,
        bubbleNameById[row.bubble_id] ?? 'Bubble',
        replyCounts,
        agentsByAuthUserId,
      );
    });
  }, [sortedRows, userById, replyCounts, myProfile, bubbleNameById, agentsByAuthUserId]);

  useEffect(() => {
    deepLinkConsumedRef.current = false;
  }, [taskId, initialCommentThreadMessageId]);

  useEffect(() => {
    const raw = initialCommentThreadMessageId?.trim();
    if (!raw || isLoading || deepLinkConsumedRef.current) return;
    const hit = chatMessages.find((m) => m.id === raw);
    if (!hit) return;
    const pid = hit.parentId;
    const threadParent =
      pid != null && pid !== '' ? (chatMessages.find((m) => m.id === pid) ?? undefined) : hit;
    if (!threadParent) return;
    deepLinkConsumedRef.current = true;
    setActiveThreadParent(threadParent);
  }, [initialCommentThreadMessageId, isLoading, chatMessages]);

  const rootMessages = useMemo(() => chatMessages.filter((m) => !m.parentId), [chatMessages]);

  const threadMessages = useMemo(
    () => chatMessages.filter((m) => m.parentId === activeThreadParent?.id),
    [chatMessages, activeThreadParent?.id],
  );

  // ---------------------------------------------------------------------------
  // Buddy: proactive onboarding trigger + "typing" indicator for task comments.
  // When the user opens a card whose comment thread is empty, silently insert the sentinel so
  // `buddy-agent-dispatch` fires. `sortedRows` is already filtered to exclude the sentinel, so
  // the user never sees it. Loop-prevention is keyed on raw `messages.length` (NOT `sortedRows`
  // or `rootMessages`) — otherwise the filter would make the thread look permanently empty
  // after a fire and we would re-trigger forever.
  // ---------------------------------------------------------------------------

  /** Task ids we have already fired the trigger for in this mount — prevents re-fire loops. */
  const buddyTriggerFiredRef = useRef<Set<string>>(new Set());
  /** Stable ref to the current `sendMessage` so the trigger effect isn't re-run each render. */
  const sendMessageRef = useRef(chat.sendMessage);
  sendMessageRef.current = chat.sendMessage;

  // Reset any lingering pending typing state whenever the active task changes so switching
  // cards never leaves a phantom indicator running from a previous task.
  useEffect(() => {
    waitMainClear();
    waitThreadClear();
  }, [taskId, waitMainClear, waitThreadClear]);

  useEffect(() => {
    if (!taskId) return;
    if (isLoading) return;
    if (!canWrite) return;
    // IMPORTANT: check RAW `messages` (NOT `sortedRows` / `rootMessages`) so we truly detect an
    // empty thread. Using filtered lists would re-fire indefinitely after the hidden sentinel
    // is inserted.
    if (messages.length !== 0) return;
    if (buddyTriggerFiredRef.current.has(taskId)) return;
    if (!buddyAgent) return;

    buddyTriggerFiredRef.current.add(taskId);

    waitMainRegisterIntent(buddyAgent);

    void sendMessageRef
      .current(BUDDY_ONBOARDING_SYSTEM_EVENT)
      .then((sent) => {
        if (sent) {
          waitMainRegisterSuccessfulSend(sent, buddyAgent);
        }
      })
      .catch((e) => {
        console.error('[Buddy UI] task panel silent onboarding trigger failed', e);
        // On failure, allow a future reopen of this task to try again.
        buddyTriggerFiredRef.current.delete(taskId);
        waitMainClear();
      });
  }, [
    taskId,
    isLoading,
    canWrite,
    messages.length,
    buddyAgent,
    waitMainRegisterIntent,
    waitMainRegisterSuccessfulSend,
    waitMainClear,
  ]);

  const prevThreadParentIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const next = activeThreadParent?.id ?? null;
    if (prevThreadParentIdRef.current === undefined) {
      prevThreadParentIdRef.current = next;
      return;
    }
    if (prevThreadParentIdRef.current === next) return;
    prevThreadParentIdRef.current = next;
    waitThreadClear();
  }, [activeThreadParent?.id, waitThreadClear]);

  const hasMainPending = waitMain.pending != null;
  const hasThreadPending = waitThread.pending != null;

  useLayoutEffect(() => {
    if (!(hasMainPending || hasThreadPending)) return;
    const scrollEl = unified
      ? (scrollContainerRef?.current ?? null)
      : activeThreadParent
        ? threadScrollRef.current
        : rootFeedScrollRef.current;
    if (!scrollEl) return;
    requestAnimationFrame(() => {
      scrollEl.scrollTop = scrollEl.scrollHeight;
    });
  }, [
    hasMainPending,
    hasThreadPending,
    messages.length,
    activeThreadParent?.id,
    unified,
    scrollContainerRef,
    threadMessages.length,
    rootMessages.length,
  ]);

  useEffect(() => {
    const el = unified ? (scrollContainerRef?.current ?? null) : threadScrollRef.current;
    if (!el || !activeThreadParent) return;
    el.scrollTop = el.scrollHeight;
  }, [threadMessages, activeThreadParent?.id, unified, scrollContainerRef]);

  const embeddedTaskIds = useMemo(() => {
    const s = new Set<string>();
    for (const m of messages) {
      if (m.attached_task_id) s.add(m.attached_task_id);
    }
    return [...s];
  }, [messages]);

  const { bubbleUpPropsFor } = useTaskBubbleUps(embeddedTaskIds);

  const renderMessageContent = useCallback((content: string) => {
    return <span className="whitespace-pre-wrap">{content}</span>;
  }, []);

  const handleOpenThread = useCallback((msg: ChatMessage) => {
    setActiveThreadParent(msg);
  }, []);

  const inlineGenerateRow =
    showInlineGenerateWorkout && onGenerateWorkout ? (
      <div className="shrink-0 border-b border-border px-6 py-1.5">
        <div className="flex justify-end">
          <PremiumGate feature="ai" inline>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs shadow-sm"
              disabled={generateWorkoutBusy || sending || isLoading}
              onClick={() => onGenerateWorkout()}
              title="Build the plan from this card’s title, description, and duration (same as Details → AI workout)."
            >
              <Sparkles className="size-3.5 shrink-0" aria-hidden />
              {generateWorkoutBusy ? 'Generating…' : 'Generate'}
            </Button>
          </PremiumGate>
        </div>
      </div>
    ) : null;

  const rootScrollClass = unified
    ? 'space-y-6 px-6 pb-2'
    : 'custom-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto scroll-smooth px-6 pb-2';

  const rootComposer = (
    <RichMessageComposer
      density="rail"
      popoverContainerRef={composerPopoverRef}
      className="border-t border-border px-6 pt-4"
      value={draft}
      onChange={(next, _meta) => setDraft(next)}
      onSubmitIntent={() => {
        const result = resolveTargetAgent({
          messageDraft: draft,
          availableAgents,
          contextDefaultAgentSlug: TASK_COMMENTS_DEFAULT_AGENT_SLUG,
        });
        if (result) {
          waitMain.registerIntent(result.agent);
        }
      }}
      onSubmit={async ({ text, files }) => {
        if (!text.trim() && (!files || files.length === 0)) return false;
        const sent = await chat.sendMessage(text, undefined, files);
        if (sent) {
          setDraft('');
          setPendingFiles([]);
          const result = resolveTargetAgent({
            messageDraft: text,
            availableAgents,
            contextDefaultAgentSlug: TASK_COMMENTS_DEFAULT_AGENT_SLUG,
          });
          if (result) {
            waitMain.registerSuccessfulSend(sent, result.agent);
          }
        }
        return sent != null;
      }}
      pendingFiles={pendingFiles}
      onPendingFilesChange={setPendingFiles}
      fileAccept={MESSAGE_ATTACHMENT_FILE_ACCEPT}
      onAttachmentFilesSelected={() => chat.clearError()}
      disabled={!canWrite || sending}
      isSending={sending}
      canSubmit={(!!draft.trim() || pendingFiles.length > 0) && canWrite && !sending}
      attachDisabled={!canWrite || sending}
      placeholder="Write a comment…"
      errorText={chat.error}
      mentionConfig={richMentionConfig}
      slashConfig={richSlashConfig}
      features={{
        enableAtMentions: true,
        enableSlashTaskLinks: true,
        enableCreateAndAttachCard: false,
      }}
      footerHint={
        <>
          <b>Return</b> to send • <b>@</b> to mention • <b>/</b> to link a card
        </>
      }
    />
  );

  const threadComposer = (
    <RichMessageComposer
      density="thread"
      popoverContainerRef={threadComposerPopoverRef}
      className="border-t border-border px-6 py-4"
      value={threadDraft}
      onChange={(next, _meta) => setThreadDraft(next)}
      onSubmitIntent={() => {
        // Thread-composer gating (fixes the "ungated bleed" documented in the audit): only arm
        // the thread-scoped typing indicator when the resolver returns a non-null target agent.
        const result = resolveTargetAgent({
          messageDraft: threadDraft,
          availableAgents,
          contextDefaultAgentSlug: TASK_COMMENTS_DEFAULT_AGENT_SLUG,
        });
        if (result) {
          waitThread.registerIntent(result.agent);
        }
      }}
      onSubmit={async ({ text, files }) => {
        if ((!text.trim() && (!files || files.length === 0)) || sending) return false;
        const parentId = activeThreadParent!.id;
        const sent = await chat.sendMessage(text, parentId, files);
        if (sent) {
          setThreadDraft('');
          setThreadPendingFiles([]);
          const result = resolveTargetAgent({
            messageDraft: text,
            availableAgents,
            contextDefaultAgentSlug: TASK_COMMENTS_DEFAULT_AGENT_SLUG,
          });
          if (result) {
            waitThread.registerSuccessfulSend(sent, result.agent);
          }
        }
        return sent != null;
      }}
      pendingFiles={threadPendingFiles}
      onPendingFilesChange={setThreadPendingFiles}
      fileAccept={MESSAGE_ATTACHMENT_FILE_ACCEPT}
      onAttachmentFilesSelected={() => chat.clearError()}
      disabled={!canWrite || sending}
      isSending={sending}
      canSubmit={(!!threadDraft.trim() || threadPendingFiles.length > 0) && canWrite && !sending}
      attachDisabled={!canWrite || sending}
      placeholder="Write a reply…"
      errorText={chat.error}
      features={{ enableAtMentions: false, enableSlashTaskLinks: false }}
    />
  );

  const renderRootComposer = () => {
    const wrapped = <div ref={composerPopoverRef}>{rootComposer}</div>;
    if (portalComposers && composerPortalHost) {
      return createPortal(wrapped, composerPortalHost);
    }
    return <div className="relative shrink-0">{wrapped}</div>;
  };

  const renderThreadComposer = () => {
    const wrapped = <div ref={threadComposerPopoverRef}>{threadComposer}</div>;
    if (portalComposers && composerPortalHost) {
      return createPortal(wrapped, composerPortalHost);
    }
    return <div className="relative shrink-0">{wrapped}</div>;
  };

  const threadMessagesClass = unified
    ? 'px-6 pb-2 pt-2'
    : 'custom-scrollbar min-h-0 flex-1 overflow-y-auto scroll-smooth px-6 pb-2 pt-2';

  const showInlineBack = !(unifiedScrollLayout && hideThreadBackRow);

  return (
    <div
      className={
        unified ? 'relative w-full min-w-0' : 'relative -mx-6 flex min-h-0 flex-1 flex-col'
      }
    >
      <MessageMediaModal
        open={mediaModal !== null}
        onOpenChange={(open) => {
          if (!open) setMediaModal(null);
        }}
        attachments={mediaModal?.attachments ?? []}
        initialIndex={mediaModal?.index ?? 0}
      />

      {!activeThreadParent ? (
        <>
          {inlineGenerateRow}
          <div
            ref={rootFeedScrollRef}
            className={rootScrollClass}
            onScroll={unified ? undefined : onMessagesScroll}
          >
            {isLoading && rootMessages.length === 0 ? (
              <p className="text-sm text-muted-foreground">Loading comments…</p>
            ) : null}
            {rootMessages.length > 0
              ? rootMessages.map((msg) => (
                  <ChatMessageRow
                    key={msg.id}
                    message={msg}
                    density="rail"
                    renderContent={renderMessageContent}
                    onOpenAttachment={(attachments, index) => setMediaModal({ attachments, index })}
                    bubbleUpPropsFor={bubbleUpPropsFor}
                    onOpenThread={handleOpenThread}
                    onCoachDraftFinalizeSuccess={onCoachDraftFinalizeSuccess}
                    chatCardWorkoutActions={chatCardWorkoutActions}
                    liveSessionViewerUserId={myProfile?.id ?? null}
                  />
                ))
              : null}
            {!isLoading && rootMessages.length === 0 && !waitMain.pending ? (
              <p className="text-sm text-muted-foreground">No comments yet.</p>
            ) : null}
            {waitMain.pending ? (
              <div className="mt-6 w-full shrink-0">
                <AgentTypingIndicator density="rail" pending={waitMain.pending} />
              </div>
            ) : null}
          </div>
          {renderRootComposer()}
        </>
      ) : (
        <>
          {inlineGenerateRow}
          {showInlineBack ? (
            <div className="shrink-0 border-b border-border px-6 py-1">
              <button
                type="button"
                onClick={() => setActiveThreadParent(null)}
                className="inline-flex items-center gap-2 rounded-md px-1.5 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft className="size-4 shrink-0" aria-hidden />
                Back to comments
              </button>
            </div>
          ) : null}

          <div
            ref={unified ? undefined : threadScrollRef}
            className={threadMessagesClass}
            onScroll={unified ? undefined : onMessagesScroll}
          >
            <div className="mb-3 rounded-xl border border-border bg-muted/35 p-3 shadow-sm ring-1 ring-border/40 dark:bg-muted/20">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Original comment
              </p>
              <ChatMessageRow
                message={activeThreadParent}
                density="thread"
                renderContent={renderMessageContent}
                onOpenAttachment={(attachments, index) => setMediaModal({ attachments, index })}
                bubbleUpPropsFor={bubbleUpPropsFor}
                onCoachDraftFinalizeSuccess={onCoachDraftFinalizeSuccess}
                chatCardWorkoutActions={chatCardWorkoutActions}
                liveSessionViewerUserId={myProfile?.id ?? null}
              />
            </div>
            <div className="ml-2 space-y-5 border-l-2 border-primary/25 pl-4">
              {threadMessages.length === 0 ? (
                <p className="py-1 text-xs text-muted-foreground">No replies yet.</p>
              ) : null}
              {threadMessages.map((reply) => (
                <ChatMessageRow
                  key={reply.id}
                  message={reply}
                  density="thread"
                  renderContent={renderMessageContent}
                  onOpenAttachment={(attachments, index) => setMediaModal({ attachments, index })}
                  bubbleUpPropsFor={bubbleUpPropsFor}
                  onCoachDraftFinalizeSuccess={onCoachDraftFinalizeSuccess}
                  chatCardWorkoutActions={chatCardWorkoutActions}
                  liveSessionViewerUserId={myProfile?.id ?? null}
                />
              ))}
              {waitThread.pending ? (
                <div className="mt-6 w-full shrink-0">
                  <AgentTypingIndicator density="thread" pending={waitThread.pending} />
                </div>
              ) : null}
            </div>
          </div>
          {renderThreadComposer()}
        </>
      )}
    </div>
  );
});
