'use client';

import { useEffect, useState } from 'react';
import { formatSessionTime } from '@/features/live-video/shells/TimerDisplay';
import type { SessionState } from '@/features/live-video/state/sessionStateMachine';
import { cn } from '@/lib/utils';

export type SessionClockMiniProps = {
  state: SessionState;
  className?: string;
};

function getGlobalElapsedMs(state: SessionState, now: number): number {
  if (state.globalStartedAt == null) return 0;
  return Math.max(0, now - state.globalStartedAt);
}

/**
 * Continuous session clock (wall time since Start Session). Independent of block pause/resume.
 */
export function SessionClockMini({ state, className }: SessionClockMiniProps) {
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
      <div className="text-3xl font-mono tabular-nums leading-none tracking-tight text-white">
        {label}
      </div>
    </div>
  );
}
