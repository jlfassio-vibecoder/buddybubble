'use client';

import { SmilePlus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  MESSAGE_REACTION_EMOJIS,
  type MessageReactionAgg,
  type MessageReactionEmoji,
} from '@/lib/message-reactions';
import { cn } from '@/lib/utils';

export type ChatMessageReactionPillsProps = {
  reactions: MessageReactionAgg[];
  canReact: boolean;
  busy?: boolean;
  onToggleReaction: (emoji: MessageReactionEmoji) => void;
  className?: string;
};

export function ChatMessageReactionPills({
  reactions,
  canReact,
  busy = false,
  onToggleReaction,
  className,
}: ChatMessageReactionPillsProps) {
  if (!canReact && reactions.length === 0) return null;

  return (
    <div
      className={cn('mt-2 flex flex-wrap items-center gap-1.5', className)}
      data-testid="chat-message-reaction-pills"
    >
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          disabled={!canReact || busy}
          aria-pressed={r.reactedByMe}
          className={cn(
            'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[12px] font-semibold transition-colors',
            r.reactedByMe
              ? 'border-primary/35 bg-primary/15 text-primary'
              : 'border-border bg-secondary text-foreground hover:bg-secondary/80',
            (!canReact || busy) && 'opacity-80',
          )}
          onClick={() => onToggleReaction(r.emoji as MessageReactionEmoji)}
        >
          <span aria-hidden>{r.emoji}</span>
          <span className="tabular-nums">{r.count}</span>
        </button>
      ))}

      {canReact ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={busy}
              className="inline-flex size-6 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Add reaction"
              data-testid="chat-message-reaction-add"
            >
              <SmilePlus className="size-3.5" aria-hidden strokeWidth={2} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-1.5" align="start" side="top">
            <div className="flex gap-0.5" role="listbox" aria-label="Choose reaction">
              {MESSAGE_REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="flex size-8 items-center justify-center rounded-lg text-base transition-colors hover:bg-muted"
                  onClick={() => onToggleReaction(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
