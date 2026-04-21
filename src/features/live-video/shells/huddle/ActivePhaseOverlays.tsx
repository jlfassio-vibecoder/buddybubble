'use client';

import { useEffect, useState } from 'react';
import { useAgoraSession } from '@/features/live-video/agora-session-context';
import {
  formatSessionTime,
  type SessionTimeFormat,
} from '@/features/live-video/shells/TimerDisplay';
import {
  getBlockElapsedMs,
  type SessionState,
} from '@/features/live-video/state/sessionStateMachine';
import { cn } from '@/lib/utils';

/** Placeholder totals until block duration lives on session state (countdown display). */
const PLACEHOLDER_AMRAP_TOTAL_MS = 20 * 60 * 1000;
const PLACEHOLDER_TABATA_TOTAL_MS = 4 * 60 * 1000;

export type ActivePhaseOverlaysProps = {
  state: SessionState;
};

function phaseShowsOverlays(phase: SessionState['phase']): boolean {
  return phase === 'warmup' || phase === 'amrap' || phase === 'tabata';
}

export function ActivePhaseOverlays({ state }: ActivePhaseOverlaysProps) {
  const { remoteUsers } = useAgoraSession();
  const participantCount = remoteUsers.length + 1;

  const [clockLabel, setClockLabel] = useState('00:00.0');

  const phase = state.phase;
  const formatMode: SessionTimeFormat = phase === 'warmup' ? 'count-up' : 'countdown-tenths';
  const totalMs =
    phase === 'amrap'
      ? PLACEHOLDER_AMRAP_TOTAL_MS
      : phase === 'tabata'
        ? PLACEHOLDER_TABATA_TOTAL_MS
        : undefined;

  useEffect(() => {
    if (!phaseShowsOverlays(phase)) return;

    const tick = () => {
      const now = Date.now();
      const elapsed = getBlockElapsedMs(state, now);
      const next = formatSessionTime(elapsed, formatMode, totalMs);
      setClockLabel((prev) => (prev === next ? prev : next));
    };

    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [state, phase, formatMode, totalMs]);

  if (!phaseShowsOverlays(phase)) {
    return null;
  }

  const topLeftLabel = phase === 'warmup' ? 'WARM-UP' : phase === 'amrap' ? 'AMRAP' : 'TABATA';

  const showWarmupPill = phase === 'warmup';

  return (
    <div className="pointer-events-none absolute inset-0 z-[43]">
      <div className="pointer-events-auto absolute top-4 left-4 max-w-[min(100vw-2rem,20rem)] rounded-xl border border-white/10 bg-black/50 p-4 text-white shadow-lg backdrop-blur-md">
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/50">
          {topLeftLabel}
        </p>
        {phase !== 'warmup' ? (
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-white/40">
            Time remaining
          </p>
        ) : null}
        <p
          className="mt-1 font-bold tabular-nums text-5xl leading-none tracking-tight text-white"
          aria-live="polite"
        >
          {clockLabel}
        </p>

        {showWarmupPill ? (
          <div
            className={cn(
              'mt-2 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-sm text-white/95',
            )}
          >
            <span
              className={cn(
                'size-2 shrink-0 rounded-full',
                state.status === 'paused' ? 'bg-amber-400' : 'bg-emerald-400',
              )}
              aria-hidden
            />
            <span className="leading-none">
              {state.status === 'paused' ? 'Paused' : 'Active'} • {participantCount} joined
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
