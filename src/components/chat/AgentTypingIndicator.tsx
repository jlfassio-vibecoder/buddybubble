'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { PendingAgentResponse } from '@/hooks/useAgentResponseWait';

export type AgentTypingIndicatorProps = {
  /**
   * Identity of the agent currently typing. When a caller has no pending response it must not
   * render this component — there is intentionally no "empty" render path here.
   */
  pending: PendingAgentResponse;
  className?: string;
  /** Match `ChatMessageRow` avatar sizing for root vs thread feeds (non-compact only). */
  density?: 'rail' | 'thread';
  /** Minimal dots-only row for floating pill / toast (no avatar). */
  compact?: boolean;
};

function BouncingDots({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-1.5', className)} aria-hidden>
      <div
        className={cn(
          'h-2 w-2 shrink-0 rounded-full bg-primary',
          'animate-bounce [animation-delay:-0.3s] motion-reduce:animate-none',
        )}
      />
      <div
        className={cn(
          'h-2 w-2 shrink-0 rounded-full bg-primary',
          'animate-bounce [animation-delay:-0.15s] motion-reduce:animate-none',
        )}
      />
      <div className="h-2 w-2 shrink-0 animate-bounce rounded-full bg-primary motion-reduce:animate-none" />
    </div>
  );
}

/**
 * Agent-agnostic typing affordance: three Tailwind `animate-bounce` dots (staggered delays)
 * plus an avatar resolved purely from `pending`. Identity never comes from agent-specific
 * props; all branding flows through `resolveAgentAvatar` into `pending.avatarUrl`.
 *
 * Layout preserves the original single-agent typing indicator geometry so the UI doesn't jump.
 */
export function AgentTypingIndicator({
  pending,
  className,
  density = 'rail',
  compact = false,
}: AgentTypingIndicatorProps) {
  if (compact) {
    return <BouncingDots />;
  }

  const avatarSize = density === 'thread' ? 'h-8 w-8' : 'h-10 w-10';
  const { avatarUrl, displayName } = pending;
  const fallbackLetter = displayName.trim().charAt(0).toUpperCase() || 'A';

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="agent-typing-indicator"
      data-pending-slug={pending.agentSlug}
      className={cn(
        'flex w-full shrink-0 min-h-12 items-end justify-start gap-3 overflow-visible py-1',
        className,
      )}
    >
      <span className="sr-only">{displayName} is replying…</span>

      <div
        className={cn(
          avatarSize,
          'flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted font-semibold text-primary',
        )}
        aria-hidden
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="font-semibold text-primary" aria-hidden>
            {fallbackLetter}
          </span>
        )}
      </div>

      <div
        className="inline-flex max-w-[min(100%,18rem)] items-center rounded-2xl border border-border bg-muted/80 px-3 py-2.5 shadow-sm"
        aria-hidden
      >
        <BouncingDots />
      </div>
    </div>
  );
}
