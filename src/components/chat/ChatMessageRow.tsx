'use client';

import type { ReactNode } from 'react';
import { MessageSquare } from 'lucide-react';

import type { OpenTaskOptions } from '@/types/open-task-options';
import type { TaskBubbleUpControlProps } from '@/components/tasks/bubbly-button';
import { formatMessageTimestamp } from '@/lib/message-timestamp';
import { cn } from '@/lib/utils';
import type { MessageAttachment } from '@/types/message-attachment';
import type { ChatMessage } from '@/types/chat';

import { ChatFeedTaskCard } from './ChatFeedTaskCard';
import { MessageAttachmentThumbnails } from './MessageAttachmentThumbnails';

export type ChatMessageRowProps = {
  message: ChatMessage;
  renderContent: (text: string) => ReactNode;

  onOpenAttachment?: (attachments: MessageAttachment[], index: number) => void;

  onOpenTask?: (taskId: string, opts?: OpenTaskOptions) => void;
  bubbleUpPropsFor?: (taskId: string) => Omit<TaskBubbleUpControlProps, 'density'> | undefined;

  onOpenThread?: (message: ChatMessage) => void;
  isActiveThreadParent?: boolean;
  threadUnread?: boolean;

  /** When set, shows the badge when message.department equals this string (e.g. ALL_BUBBLES_LABEL). */
  showDepartmentBadgeLabel?: string;

  density?: 'rail' | 'thread';
  className?: string;
};

export function ChatMessageRow({
  message,
  renderContent,
  onOpenAttachment,
  onOpenTask,
  bubbleUpPropsFor,
  onOpenThread,
  isActiveThreadParent = false,
  threadUnread = false,
  showDepartmentBadgeLabel,
  density = 'rail',
  className,
}: ChatMessageRowProps) {
  const avatarSize = density === 'thread' ? 'h-8 w-8' : 'h-10 w-10';
  const senderClass = density === 'thread' ? 'text-sm' : 'text-base';
  const bodyClass = density === 'thread' ? 'mt-1 text-sm' : 'leading-relaxed mt-0.5';
  const showDepartmentBadge =
    showDepartmentBadgeLabel != null && message.department === showDepartmentBadgeLabel;

  return (
    <div
      className={cn(
        'flex gap-4 group relative',
        isActiveThreadParent && density === 'rail' && 'bg-primary/15 -mx-6 px-6 py-2',
        className,
      )}
    >
      <div
        className={cn(
          avatarSize,
          'rounded-lg bg-primary/15 flex items-center justify-center text-primary font-bold shrink-0 overflow-hidden border border-border',
        )}
      >
        {message.senderAvatar ? (
          <img
            src={message.senderAvatar}
            alt={message.sender}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          message.sender[0]
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={cn('font-bold text-foreground', senderClass)}>{message.sender}</span>

          {showDepartmentBadge ? (
            <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-full font-bold border border-primary/20">
              {showDepartmentBadgeLabel}
            </span>
          ) : null}

          <span
            className={cn(
              density === 'thread' ? 'text-[10px]' : 'text-xs',
              'text-muted-foreground',
            )}
          >
            {formatMessageTimestamp(message.timestamp)}
          </span>
        </div>

        <div className={cn('text-foreground', bodyClass)}>{renderContent(message.content)}</div>

        {message.attachedTask ? (
          <ChatFeedTaskCard
            task={message.attachedTask}
            hostBubbleMessageId={message.id}
            onOpenTask={onOpenTask ? (taskId, opts) => onOpenTask(taskId, opts) : undefined}
            bubbleUp={bubbleUpPropsFor?.(message.attachedTask.id)}
          />
        ) : null}

        {message.attachments && message.attachments.length > 0 ? (
          <MessageAttachmentThumbnails
            attachments={message.attachments}
            onOpenAttachment={(i) => {
              if (!onOpenAttachment) return;
              onOpenAttachment(message.attachments!, i);
            }}
            className="mt-2"
          />
        ) : null}

        {onOpenThread ? (
          message.threadCount && message.threadCount > 0 ? (
            <button
              onClick={() => onOpenThread(message)}
              className="mt-2 flex items-center gap-2 text-[10px] font-bold text-primary hover:text-primary transition-colors bg-primary/10 px-2 py-1 rounded-md border border-primary/20"
            >
              <MessageSquare className="w-3 h-3" />
              {message.threadCount} {message.threadCount === 1 ? 'reply' : 'replies'}
              {threadUnread ? (
                <span className="animate-pulse rounded-full bg-destructive px-1 py-0.5 text-[7px] font-medium uppercase tracking-tighter text-destructive-foreground">
                  New
                </span>
              ) : null}
            </button>
          ) : (
            <button
              onClick={() => onOpenThread(message)}
              className="mt-1 opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-primary transition-all"
            >
              <MessageSquare className="w-3 h-3" />
              Reply in thread
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
