'use client';

import { useEffect, useState } from 'react';
import { formatSessionTime } from '@/lib/timer';
import type { SessionState } from '@/features/live-video/state/sessionStateMachine';
import { cn } from '@/lib/utils';

export type SessionClockMiniProps = {
  state: SessionState;
  className?: string;
  /** Smaller clock for horizontal top app bar. */
  compact?: boolean;
};

function getGlobalElapsedMs(state: SessionState, now: number): number {
  if (state.globalStartedAt == null) return 0;
  return Math.max(0, now - state.globalStartedAt);
}

/**
 * Continuous session clock (wall time since Start Session). Independent of block pause/resume.
 */
export function SessionClockMini({ state, className, compact = false }: SessionClockMiniProps) {
  const [label, setLabel] = useState('00:00.0');

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const elapsed = getGlobalElapsedMs(state, now);
      const next =
        state.globalStartedAt == null ? '00:00.0' : formatSessionTime(elapsed, 'count-up');
      setLabel((prev) => (prev === next ? prev : next));
    };

    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [state.globalStartedAt]);

  return (
    <div className={cn('flex min-w-[7rem] flex-col gap-0.5', className)}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Session
      </span>
      <div
        className={cn(
          'font-mono tabular-nums leading-none tracking-tight text-foreground',
          compact ? 'text-2xl' : 'text-3xl text-white',
        )}
      >
        {label}
      </div>
    </div>
  );
}
