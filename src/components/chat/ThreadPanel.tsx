'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X, Send, Paperclip, Loader2 } from 'lucide-react';
import type { TaskModalTab } from '@/components/modals/TaskModal';
import type { TaskBubbleUpControlProps } from '@/components/tasks/bubbly-button';
import type { ChatMessage } from './ChatArea';
import { ChatFeedTaskCard } from './ChatFeedTaskCard';
import { formatMessageTimestamp } from '@/lib/message-timestamp';
import { MessageAttachmentThumbnails } from './MessageAttachmentThumbnails';
import type { MessageAttachment } from '@/types/message-attachment';
import { cn } from '@/lib/utils';
import { MESSAGE_ATTACHMENT_FILE_ACCEPT } from '@/lib/message-attachment-limits';

export type ThreadPanelProps = {
  activeThreadParent: ChatMessage | null;
  threadMessages: ChatMessage[];
  canPostMessages: boolean;
  onClose: () => void;
  /** Submit a new reply in the current thread (parent id is handled by the caller). */
  onSendMessage: (content: string, files?: File[]) => Promise<boolean>;
  onOpenAttachment: (attachments: MessageAttachment[], index: number) => void;
  /** Opens the task modal for an embedded Kanban card (chat feed cards). */
  onOpenTask?: (taskId: string, opts?: { tab?: TaskModalTab }) => void;
  /** Bubble Up summaries for embedded task ids (same hook as main `ChatArea`). */
  bubbleUpPropsFor?: (taskId: string) => Omit<TaskBubbleUpControlProps, 'density'> | undefined;
  renderMessageContent: (content: string) => ReactNode;
  /** True while main chat is uploading attachments for a message */
  sending?: boolean;
};

export function ThreadPanel({
  activeThreadParent,
  threadMessages,
  canPostMessages,
  onClose,
  onSendMessage,
  onOpenAttachment,
  onOpenTask,
  bubbleUpPropsFor,
  renderMessageContent,
  sending = false,
}: ThreadPanelProps) {
  const [threadInput, setThreadInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const threadAttachmentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (threadScrollRef.current) {
      threadScrollRef.current.scrollTop = threadScrollRef.current.scrollHeight;
    }
  }, [threadMessages]);

  useEffect(() => {
    setThreadInput('');
    setPendingFiles([]);
  }, [activeThreadParent?.id]);

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = e.target.files;
    const picked = incoming?.length ? Array.from(incoming) : [];
    e.target.value = '';
    if (picked.length === 0) return;
    setPendingFiles((prev) => [...prev, ...picked]);
  };

  return (
    <AnimatePresence>
      {activeThreadParent && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="z-10 flex w-80 flex-col border-l border-border bg-background shadow-2xl"
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Thread</h3>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar" ref={threadScrollRef}>
            {/* Parent Message */}
            <div className="mb-6 border-b border-border pb-6">
              <div className="mb-2 flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-primary/15 text-sm font-bold text-primary">
                  {activeThreadParent.senderAvatar ? (
                    <img
                      src={activeThreadParent.senderAvatar}
                      alt={activeThreadParent.sender}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    activeThreadParent.sender[0]
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-foreground">
                      {activeThreadParent.sender}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatMessageTimestamp(activeThreadParent.timestamp)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-foreground">
                    {renderMessageContent(activeThreadParent.content)}
                  </p>
                  {activeThreadParent.attachedTask ? (
                    <ChatFeedTaskCard
                      task={activeThreadParent.attachedTask}
                      onOpenTask={
                        onOpenTask ? (taskId, opts) => onOpenTask(taskId, opts) : undefined
                      }
                      bubbleUp={bubbleUpPropsFor?.(activeThreadParent.attachedTask.id)}
                    />
                  ) : null}
                  {activeThreadParent.attachments && activeThreadParent.attachments.length > 0 && (
                    <MessageAttachmentThumbnails
                      attachments={activeThreadParent.attachments}
                      onOpenAttachment={(i) => onOpenAttachment(activeThreadParent.attachments!, i)}
                      className="mt-2"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Replies */}
            <div className="space-y-6">
              {threadMessages.map((reply) => (
                <div key={reply.id} className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-primary/15 text-sm font-bold text-primary">
                    {reply.senderAvatar ? (
                      <img
                        src={reply.senderAvatar}
                        alt={reply.sender}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      reply.sender[0]
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-bold text-foreground">{reply.sender}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatMessageTimestamp(reply.timestamp)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-foreground">
                      {renderMessageContent(reply.content)}
                    </p>
                    {reply.attachedTask ? (
                      <ChatFeedTaskCard
                        task={reply.attachedTask}
                        onOpenTask={
                          onOpenTask ? (taskId, opts) => onOpenTask(taskId, opts) : undefined
                        }
                        bubbleUp={bubbleUpPropsFor?.(reply.attachedTask.id)}
                      />
                    ) : null}
                    {reply.attachments && reply.attachments.length > 0 && (
                      <MessageAttachmentThumbnails
                        attachments={reply.attachments}
                        onOpenAttachment={(i) => onOpenAttachment(reply.attachments!, i)}
                        className="mt-2"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Thread Input */}
          <div className="border-t border-border bg-background p-4">
            <input
              ref={threadAttachmentInputRef}
              type="file"
              className="hidden"
              multiple
              accept={MESSAGE_ATTACHMENT_FILE_ACCEPT}
              onChange={handlePick}
            />
            {pendingFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {pendingFiles.map((f, i) => (
                  <span
                    key={`${f.name}-${i}`}
                    className="inline-flex max-w-[140px] items-center gap-1 rounded border border-border bg-muted/70 px-1.5 py-0.5 text-[9px] text-foreground"
                  >
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}
                      aria-label="Remove file"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!threadInput.trim() || sending) return;
                const text = threadInput;
                const files = [...pendingFiles];
                const ok = await onSendMessage(text, files);
                if (!ok) return;
                setThreadInput('');
                setPendingFiles([]);
              }}
              className="flex items-center gap-1.5"
            >
              <button
                type="button"
                className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-primary disabled:opacity-30"
                disabled={!canPostMessages || !activeThreadParent || sending}
                aria-label="Attach file"
                title="Attach image, video, or document"
                onClick={() => threadAttachmentInputRef.current?.click()}
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <div className="relative min-w-0 flex-1">
                <input
                  type="text"
                  value={threadInput}
                  onChange={(e) => setThreadInput(e.target.value)}
                  placeholder="Reply to thread..."
                  disabled={!canPostMessages || !activeThreadParent || sending}
                  className={cn(
                    'w-full rounded-xl border border-input bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground',
                    'transition-all focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50',
                  )}
                />
                <button
                  type="submit"
                  disabled={
                    !threadInput.trim() || !canPostMessages || !activeThreadParent || sending
                  }
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-primary transition-colors hover:bg-primary/10 disabled:opacity-30"
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
