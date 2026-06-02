'use client';

import type { SessionState } from '@/features/live-video/state/sessionStateMachine';
import { cn } from '@/lib/utils';

export type SessionHeaderProps = {
  className?: string;
  /** When the host is picking cards from the Kanban for the workout deck. */
  isSelectingFromBoard?: boolean;
  /** Builder emphasis before the global session starts; live title once the session is running. */
  uiMode?: 'builder' | 'live';
  /** Override default “The Huddle” titles (e.g. class draft builder). */
  titleOverride?: string;
  /** Override default subtitle lines when provided. */
  subtitleOverride?: string;
  /** Session lifecycle status — drives contextual live subtitle copy. */
  status?: SessionState['status'];
};

export function SessionHeader({
  className,
  isSelectingFromBoard = false,
  uiMode = 'builder',
  titleOverride,
  subtitleOverride,
  status = 'idle',
}: SessionHeaderProps) {
  const defaultTitle =
    uiMode === 'live' ? 'Live Session — The Huddle' : 'Workout Builder — The Huddle';
  const title = titleOverride?.trim() || defaultTitle;
  const defaultSubtitle = isSelectingFromBoard
    ? 'Tap cards on the board to add them to your queue, then tap Done selecting.'
    : status !== 'idle'
      ? 'Session running'
      : uiMode === 'live'
        ? 'Session in progress'
        : 'Queue exercises from your board below';
  const subtitle = subtitleOverride?.trim() || defaultSubtitle;

  return (
    <header className={cn('border-b border-border pb-3 text-center sm:text-left', className)}>
      <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">{title}</h1>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
    </header>
  );
}
