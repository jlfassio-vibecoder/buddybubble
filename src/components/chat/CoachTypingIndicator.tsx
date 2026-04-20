'use client';

import { cn } from '@/lib/utils';

export type CoachTypingIndicatorProps = {
  className?: string;
  /** Match `ChatMessageRow` avatar sizing for root vs thread feeds (non-compact only). */
  density?: 'rail' | 'thread';
  /** First coach agent avatar URL; falls back to initial (non-compact only). */
  coachAvatarUrl?: string | null;
  /** Minimal dots-only row for floating pill / toast (no avatar). */
  compact?: boolean;
};

const COACH_LABEL = 'Coach';

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
 * Coach typing affordance: three Tailwind `animate-bounce` dots (staggered delays).
 * No Framer Motion, BubbleBurst, or timers.
 */
export function CoachTypingIndicator({
  className,
  density = 'rail',
  coachAvatarUrl = null,
  compact = false,
}: CoachTypingIndicatorProps) {
  if (compact) {
    return <BouncingDots />;
  }

  const avatarSize = density === 'thread' ? 'h-8 w-8' : 'h-10 w-10';

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex w-full shrink-0 min-h-12 items-end justify-start gap-3 overflow-visible py-1',
        className,
      )}
    >
      <span className="sr-only">Coach is replying…</span>

      <div
        className={cn(
          avatarSize,
          'flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted font-semibold text-primary',
        )}
        aria-hidden
      >
        {coachAvatarUrl ? (
          <img
            src={coachAvatarUrl}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span>{COACH_LABEL[0]}</span>
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
