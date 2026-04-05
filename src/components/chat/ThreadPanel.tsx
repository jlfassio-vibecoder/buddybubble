'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X, Send, Paperclip, Loader2 } from 'lucide-react';
import type { ChatMessage } from './ChatArea';
import { formatMessageTimestamp } from '@/lib/message-timestamp';
import { MessageAttachmentThumbnails } from './MessageAttachmentThumbnails';
import type { MessageAttachment } from '@/types/message-attachment';
import { cn } from '@/lib/utils';
import { MESSAGE_ATTACHMENT_FILE_ACCEPT } from '@/lib/message-attachment-limits';

export type ThreadPanelProps = {
  activeThreadParent: ChatMessage | null;
  threadMessages: ChatMessage[];
  canWrite: boolean;
  onClose: () => void;
  /** Submit a new reply in the current thread (parent id is handled by the caller). */
  onSendMessage: (content: string, files?: File[]) => Promise<boolean>;
  onOpenAttachment: (attachments: MessageAttachment[], index: number) => void;
  renderMessageContent: (content: string) => ReactNode;
  /** True while main chat is uploading attachments for a message */
  sending?: boolean;
};

export function ThreadPanel({
  activeThreadParent,
  threadMessages,
  canWrite,
  onClose,
  onSendMessage,
  onOpenAttachment,
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
          className="w-80 border-l border-slate-200 bg-slate-50 flex flex-col shadow-2xl z-10"
        >
          <div className="h-16 border-b border-slate-200 flex items-center justify-between px-4 bg-white shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-600" />
              <h3 className="font-bold text-slate-900 text-sm">Thread</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar" ref={threadScrollRef}>
            {/* Parent Message */}
            <div className="mb-6 pb-6 border-b border-slate-200">
              <div className="flex gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold shrink-0 overflow-hidden border border-slate-100">
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
                    <span className="text-sm font-bold text-slate-900">
                      {activeThreadParent.sender}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {formatMessageTimestamp(activeThreadParent.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 mt-1">
                    {renderMessageContent(activeThreadParent.content)}
                  </p>
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
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold shrink-0 overflow-hidden border border-slate-100">
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
                      <span className="text-sm font-bold text-slate-900">{reply.sender}</span>
                      <span className="text-[10px] text-slate-400">
                        {formatMessageTimestamp(reply.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 mt-1">
                      {renderMessageContent(reply.content)}
                    </p>
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
          <div className="p-4 bg-white border-t border-slate-200">
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
                    className="inline-flex max-w-[140px] items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] text-slate-700"
                  >
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      className="shrink-0 text-slate-500 hover:text-slate-800"
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
                className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-600 disabled:opacity-30"
                disabled={!canWrite || !activeThreadParent || sending}
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
                  disabled={!canWrite || !activeThreadParent || sending}
                  className={cn(
                    'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 pr-10 text-sm',
                    'focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50',
                  )}
                />
                <button
                  type="submit"
                  disabled={!threadInput.trim() || !canWrite || !activeThreadParent || sending}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-30 transition-colors"
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
