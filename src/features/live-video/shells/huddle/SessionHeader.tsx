'use client';

import { cn } from '@/lib/utils';

export type SessionHeaderProps = {
  className?: string;
  /** When the host is picking cards from the Kanban for the workout deck. */
  isSelectingFromBoard?: boolean;
  /** Builder emphasis before the global session starts; live title once the session is running. */
  uiMode?: 'builder' | 'live';
};

export function SessionHeader({
  className,
  isSelectingFromBoard = false,
  uiMode = 'builder',
}: SessionHeaderProps) {
  const title = uiMode === 'live' ? 'Live Session — The Huddle' : 'Workout Builder — The Huddle';
  const subtitle = isSelectingFromBoard
    ? 'Tap cards on the board to add them to your queue, then tap Done selecting.'
    : uiMode === 'live'
      ? 'Session in progress'
      : 'Queue exercises from your board below';

  return (
    <header className={cn('border-b border-border pb-3 text-center sm:text-left', className)}>
      <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">{title}</h1>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
    </header>
  );
}
