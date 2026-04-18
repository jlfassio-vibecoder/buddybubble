'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import type { BubbleRow, TaskRow } from '@/types/database';
import type { MessageAttachment } from '@/types/message-attachment';
import type { ChatMessage } from '@/types/chat';
import { useUserProfileStore } from '@/store/userProfileStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useMessageThread } from '@/hooks/useMessageThread';
import { useTaskBubbleUps } from '@/hooks/use-task-bubble-ups';
import { rowToChatMessage } from '@/lib/chat-message-mapper';
import { toChatUserSnapshot } from '@/lib/message-thread';
import { MESSAGE_ATTACHMENT_FILE_ACCEPT } from '@/lib/message-attachment-limits';
import { ChatMessageRow } from '@/components/chat/ChatMessageRow';
import { RichMessageComposer } from '@/components/chat/RichMessageComposer';
import { MessageMediaModal } from '@/components/chat/MessageMediaModal';
import { createClient } from '@utils/supabase/client';
import { supabaseClientErrorMessage } from '@/lib/supabase-client-error';
import { guestTaskAssignmentVisibilityOr, isGuestWorkspaceRole } from '@/lib/guest-task-query';
import { Button } from '@/components/ui/button';
import { PremiumGate } from '@/components/subscription/premium-gate';

type TaskPickerRow = {
  id: string;
  title: string;
  status: string;
  type: 'task' | 'request' | 'idea';
};

export type TaskModalCommentsPanelProps = {
  taskId: string;
  workspaceId: string;
  bubbles: BubbleRow[];
  canWrite: boolean;
  /** Task-scoped `messages.id` to open that comment thread after messages load (replies resolve via `parentId`). */
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
  /** Forwarded from TaskModal so scrolling the message list collapses the cinematic hero. */
  onMessagesScroll?: (e: UIEvent<HTMLDivElement>) => void;
};

export function TaskModalCommentsPanel({
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
}: TaskModalCommentsPanelProps) {
  const myProfile = useUserProfileStore((s) => s.profile);
  const workspaceRole = useWorkspaceStore((s) => s.activeWorkspace?.role ?? null);
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
  const deepLinkConsumedRef = useRef(false);

  const chat = useMessageThread({
    filter: { scope: 'task', taskId },
    workspaceId,
    bubbles,
    canPostMessages: canWrite,
  });

  const { messages, userById, teamMembers, replyCounts, sending, isLoading } = chat;

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
      // Copilot suggestion ignored: only the debounced timer records views; cleanup clears the timer without flushing (avoids marking read on brief open).
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

  /** Task picker for `/…` links (same rules as `ChatArea`). */
  useEffect(() => {
    if (!workspaceId || bubbles.length === 0) {
      setAllTasks([]);
      return;
    }
    const bubbleIds = bubbles.map((b) => b.id);
    let cancelled = false;
    async function loadTasksForSlashMentions() {
      const supabase = createClient();
      let taskQuery = supabase
        .from('tasks')
        .select('id, title, status, bubble_id, position, archived_at, assigned_to')
        .in('bubble_id', bubbleIds)
        .is('archived_at', null)
        .order('bubble_id', { ascending: true })
        .order('position', { ascending: true });
      if (isGuestWorkspaceRole(workspaceRole) && myProfile?.id) {
        taskQuery = taskQuery.or(guestTaskAssignmentVisibilityOr(myProfile.id));
      }
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
  }, [workspaceId, bubbles, workspaceRole, myProfile?.id]);

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
      [...messages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    [messages],
  );

  const chatMessages: ChatMessage[] = useMemo(() => {
    return sortedRows.map((row) => {
      const base = userById[row.user_id];
      const user = myProfile && row.user_id === myProfile.id ? toChatUserSnapshot(myProfile) : base;
      return rowToChatMessage(row, user, bubbleNameById[row.bubble_id] ?? 'Bubble', replyCounts);
    });
  }, [sortedRows, userById, replyCounts, myProfile, bubbleNameById]);

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

  useEffect(() => {
    if (threadScrollRef.current) {
      threadScrollRef.current.scrollTop = threadScrollRef.current.scrollHeight;
    }
  }, [threadMessages, activeThreadParent?.id]);

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

  return (
    <div className="relative -mx-6 flex min-h-0 flex-1 flex-col">
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
            className="custom-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto scroll-smooth px-6 pb-2"
            onScroll={onMessagesScroll}
          >
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading comments…</p>
            ) : rootMessages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No comments yet.</p>
            ) : (
              rootMessages.map((msg) => (
                <ChatMessageRow
                  key={msg.id}
                  message={msg}
                  density="rail"
                  renderContent={renderMessageContent}
                  onOpenAttachment={(attachments, index) => setMediaModal({ attachments, index })}
                  bubbleUpPropsFor={bubbleUpPropsFor}
                  onOpenThread={handleOpenThread}
                />
              ))
            )}
          </div>

          <div ref={composerPopoverRef} className="relative shrink-0">
            <RichMessageComposer
              density="rail"
              popoverContainerRef={composerPopoverRef}
              className="border-t border-border px-6 pt-4"
              value={draft}
              onChange={(next, _meta) => setDraft(next)}
              onSubmit={async ({ text, files }) => {
                if (!text.trim() && (!files || files.length === 0)) return false;
                const ok = await chat.sendMessage(text, undefined, files);
                if (ok) {
                  setDraft('');
                  setPendingFiles([]);
                }
                return ok;
              }}
              pendingFiles={pendingFiles}
              onPendingFilesChange={setPendingFiles}
              fileAccept={MESSAGE_ATTACHMENT_FILE_ACCEPT}
              onAttachmentFilesSelected={() => chat.clearError()}
              disabled={!canWrite || sending}
              isSending={sending}
              canSubmit={
                /* Copilot suggestion ignored: `sendMessage` allows attachment-only posts when `files.length > 0` (no attached card required). */
                (!!draft.trim() || pendingFiles.length > 0) && canWrite && !sending
              }
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
          </div>
        </>
      ) : (
        <>
          {inlineGenerateRow}
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

          <div
            ref={threadScrollRef}
            className="custom-scrollbar min-h-0 flex-1 overflow-y-auto scroll-smooth px-6 pb-2 pt-2"
            onScroll={onMessagesScroll}
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
                />
              ))}
            </div>
          </div>

          <div ref={threadComposerPopoverRef} className="relative shrink-0">
            <RichMessageComposer
              density="thread"
              popoverContainerRef={threadComposerPopoverRef}
              className="border-t border-border px-6 py-4"
              value={threadDraft}
              onChange={(next, _meta) => setThreadDraft(next)}
              onSubmit={async ({ text, files }) => {
                if ((!text.trim() && (!files || files.length === 0)) || sending) return false;
                const ok = await chat.sendMessage(text, activeThreadParent.id, files);
                if (ok) {
                  setThreadDraft('');
                  setThreadPendingFiles([]);
                }
                return ok;
              }}
              pendingFiles={threadPendingFiles}
              onPendingFilesChange={setThreadPendingFiles}
              fileAccept={MESSAGE_ATTACHMENT_FILE_ACCEPT}
              onAttachmentFilesSelected={() => chat.clearError()}
              disabled={!canWrite || sending}
              isSending={sending}
              canSubmit={
                (!!threadDraft.trim() || threadPendingFiles.length > 0) && canWrite && !sending
              }
              attachDisabled={!canWrite || sending}
              placeholder="Write a reply…"
              errorText={chat.error}
              features={{ enableAtMentions: false, enableSlashTaskLinks: false }}
            />
          </div>
        </>
      )}
    </div>
  );
}
