'use client';

import type { SessionControlsActionsProps } from '@/features/live-video/shells/huddle/SessionControlsActions';
import { SessionControlsActions } from '@/features/live-video/shells/huddle/SessionControlsActions';
import { SessionClockMini } from '@/features/live-video/shells/huddle/SessionClockMini';
import { cn } from '@/lib/utils';

/** @deprecated Use LiveSessionTopBar in LiveSessionView. Legacy footer layout wrapper. */
export type SessionControlsProps = SessionControlsActionsProps;

/** @deprecated Use LiveSessionTopBar. */
export function SessionControls({ className, state, ...rest }: SessionControlsProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-3 sm:flex-nowrap sm:justify-between sm:gap-4 sm:px-4',
        className,
      )}
    >
      <SessionClockMini state={state} className="min-w-0 shrink-0 sm:mr-2" />
      <SessionControlsActions state={state} {...rest} className="flex-1 sm:justify-end" />
    </div>
  );
}
