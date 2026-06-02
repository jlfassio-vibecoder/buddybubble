'use client';

import type { EmomMechanicsState } from '@/features/live-video/wrappers/interval/mechanics/emom-mechanics-state';
import { emomMinuteDisplayLabel } from '@/features/live-video/wrappers/interval/mechanics/emom-mechanics-state';
import type { IntervalSessionEngine } from '@/features/live-video/wrappers/interval/types/interval-engine';

function fmt(remainingSec: number): string {
  const s = Math.max(0, Math.floor(remainingSec));
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

function isEmomState(ms: IntervalSessionEngine['mechanicsState']): ms is EmomMechanicsState {
  return ms != null && 'minute_index' in ms && 'total_minutes' in ms;
}

export default function EmomTimerOverlay({ engine }: { engine: IntervalSessionEngine }) {
  const ms = isEmomState(engine.mechanicsState) ? engine.mechanicsState : null;
  const minuteLabel = ms ? emomMinuteDisplayLabel(ms) : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[43]">
      <div className="pointer-events-auto absolute top-4 left-4 max-w-[min(100vw-2rem,20rem)] rounded-xl border border-white/10 bg-black/50 p-4 text-white shadow-lg backdrop-blur-md">
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/50">EMOM</p>
        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-white/40">
          {engine.timerPhase === 'finished'
            ? 'Finished'
            : engine.segmentLabel.toUpperCase() || 'Ready'}
        </p>
        {minuteLabel ? (
          <p className="mt-0.5 text-xs font-medium text-white/60">{minuteLabel}</p>
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
