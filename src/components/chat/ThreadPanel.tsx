'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X } from 'lucide-react';
import type { OpenTaskOptions } from '@/types/open-task-options';
import type { TaskBubbleUpControlProps } from '@/components/tasks/bubbly-button';
import type { ChatMessage } from '@/types/chat';
import type { MessageAttachment } from '@/types/message-attachment';
import { MESSAGE_ATTACHMENT_FILE_ACCEPT } from '@/lib/message-attachment-limits';
import { ChatMessageRow } from './ChatMessageRow';
import { RichMessageComposer } from './RichMessageComposer';

export type ThreadPanelProps = {
  activeThreadParent: ChatMessage | null;
  threadMessages: ChatMessage[];
  canPostMessages: boolean;
  onClose: () => void;
  /** Submit a new reply in the current thread (parent id is handled by the caller). */
  onSendMessage: (content: string, files?: File[]) => Promise<boolean>;
  onOpenAttachment: (attachments: MessageAttachment[], index: number) => void;
  /** Opens the task modal for an embedded Kanban card (chat feed cards). */
  onOpenTask?: (taskId: string, opts?: OpenTaskOptions) => void;
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

  useEffect(() => {
    if (threadScrollRef.current) {
      threadScrollRef.current.scrollTop = threadScrollRef.current.scrollHeight;
    }
  }, [threadMessages]);

  useEffect(() => {
    setThreadInput('');
    setPendingFiles([]);
  }, [activeThreadParent?.id]);

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
              <ChatMessageRow
                message={activeThreadParent}
                density="thread"
                renderContent={renderMessageContent}
                onOpenAttachment={onOpenAttachment}
                onOpenTask={onOpenTask}
                bubbleUpPropsFor={bubbleUpPropsFor}
              />
            </div>

            {/* Replies */}
            <div className="space-y-6">
              {threadMessages.map((reply) => (
                <ChatMessageRow
                  key={reply.id}
                  message={reply}
                  density="thread"
                  renderContent={renderMessageContent}
                  onOpenAttachment={onOpenAttachment}
                  onOpenTask={onOpenTask}
                  bubbleUpPropsFor={bubbleUpPropsFor}
                />
              ))}
            </div>
          </div>

          <RichMessageComposer
            density="thread"
            className="border-t border-border bg-background p-4"
            value={threadInput}
            onChange={(next, _meta) => setThreadInput(next)}
            onSubmit={async ({ text, files }) => {
              if (!text.trim() || sending) return false;
              const ok = await onSendMessage(text, files);
              if (!ok) return false;
              setThreadInput('');
              setPendingFiles([]);
              return true;
            }}
            pendingFiles={pendingFiles}
            onPendingFilesChange={setPendingFiles}
            fileAccept={MESSAGE_ATTACHMENT_FILE_ACCEPT}
            disabled={!canPostMessages || !activeThreadParent || sending}
            isSending={sending}
            canSubmit={
              !!threadInput.trim() && !!canPostMessages && !!activeThreadParent && !sending
            }
            attachDisabled={!canPostMessages || !activeThreadParent || sending}
            placeholder="Reply to thread…"
            features={{ enableAtMentions: false, enableSlashTaskLinks: false }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
