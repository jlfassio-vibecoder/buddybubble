'use client';

import type { IntervalSessionEngine } from '@/features/live-video/wrappers/interval/types/interval-engine';

function fmt(remainingSec: number): string {
  const s = Math.max(0, Math.floor(remainingSec));
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

export default function TabataTimerOverlay({ engine }: { engine: IntervalSessionEngine }) {
  const ms = engine.mechanicsState;
  const showRound =
    ms != null && ms.segment !== 'setup' && ms.segment !== 'idle' && ms.total_rounds > 0;
  const roundLabel = showRound
    ? `Round ${Math.max(ms!.round_index, 1)} / ${ms!.total_rounds}`
    : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[43]">
      <div className="pointer-events-auto absolute top-4 left-4 max-w-[min(100vw-2rem,20rem)] rounded-xl border border-white/10 bg-black/50 p-4 text-white shadow-lg backdrop-blur-md">
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/50">Tabata</p>
        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-white/40">
          {engine.timerPhase === 'finished'
            ? 'Finished'
            : engine.segmentLabel.toUpperCase() || 'Ready'}
        </p>
        {roundLabel ? (
          <p className="mt-0.5 text-xs font-medium text-white/60">{roundLabel}</p>
        ) : null}
        <p
          className="mt-1 font-bold tabular-nums text-5xl leading-none tracking-tight text-white"
          aria-live="polite"
        >
          {fmt(engine.remainingSec)}
        </p>
      </div>
    </div>
  );
}
