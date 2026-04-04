'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X, Send } from 'lucide-react';
import { format } from 'date-fns';
import type { ChatMessage } from './ChatArea';

export type ThreadPanelProps = {
  activeThreadParent: ChatMessage | null;
  threadMessages: ChatMessage[];
  canWrite: boolean;
  onClose: () => void;
  /** Submit a new reply in the current thread (parent id is handled by the caller). */
  onSendMessage: (content: string) => void | Promise<void>;
  renderMessageContent: (content: string) => ReactNode;
};

export function ThreadPanel({
  activeThreadParent,
  threadMessages,
  canWrite,
  onClose,
  onSendMessage,
  renderMessageContent,
}: ThreadPanelProps) {
  const [threadInput, setThreadInput] = useState('');
  const threadScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (threadScrollRef.current) {
      threadScrollRef.current.scrollTop = threadScrollRef.current.scrollHeight;
    }
  }, [threadMessages]);

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
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      {activeThreadParent.sender}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {format(activeThreadParent.timestamp, 'h:mm a')}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 mt-1">
                    {renderMessageContent(activeThreadParent.content)}
                  </p>
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
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-bold text-slate-900">{reply.sender}</span>
                      <span className="text-[10px] text-slate-400">
                        {format(reply.timestamp, 'h:mm a')}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 mt-1">
                      {renderMessageContent(reply.content)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Thread Input */}
          <div className="p-4 bg-white border-t border-slate-200">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (threadInput.trim()) {
                  void onSendMessage(threadInput);
                  setThreadInput('');
                }
              }}
              className="relative flex items-center"
            >
              <input
                type="text"
                value={threadInput}
                onChange={(e) => setThreadInput(e.target.value)}
                placeholder="Reply to thread..."
                disabled={!canWrite || !activeThreadParent}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!threadInput.trim() || !canWrite || !activeThreadParent}
                className="absolute right-1.5 p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-30 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
