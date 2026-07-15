'use client';

import { resolveTabataBillboardModel } from '@/features/live-video/wrappers/interval/mechanics/tabata-billboard-display';
import { isTabataMechanicsState } from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import type { IntervalSessionEngine } from '@/features/live-video/wrappers/interval/types/interval-engine';
import { cn } from '@/lib/utils';

export type TabataBillboardOverlayProps = {
  engine: IntervalSessionEngine;
};

export default function TabataBillboardOverlay({ engine }: TabataBillboardOverlayProps) {
  const ms = isTabataMechanicsState(engine.mechanicsState) ? engine.mechanicsState : null;
  const elapsedSec = Math.max(0, engine.totalSec - engine.remainingSec);
  const model = resolveTabataBillboardModel({
    mechanics: ms,
    formatParams: engine.blockSnapshot?.format_params,
    exercises: engine.blockSnapshot?.exercises ?? [],
    elapsedSec,
  });

  // Copilot suggestion ignored: Phase 2 locks instant unmount when !visible; soft opacity exit is Phase 4 polish.
  if (model == null || !model.visible) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[43]"
      data-testid="tabata-billboard-overlay"
    >
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'absolute top-4 left-1/2 w-[min(92vw,40rem)] -translate-x-1/2',
          'rounded-2xl border border-white/10 bg-black/50 px-6 py-4 shadow-lg backdrop-blur-md',
          'text-center text-white',
          'opacity-100 transition-opacity duration-500 ease-in-out motion-reduce:transition-none',
        )}
        data-testid="tabata-billboard-panel"
      >
        {model.prefix === 'next' ? (
          <p
            className="text-sm font-medium tracking-wider text-white/80 uppercase md:text-base"
            data-testid="tabata-billboard-prefix"
          >
            Next:
          </p>
        ) : null}
        <p
          className={cn(
            'text-3xl leading-tight font-bold text-white md:text-5xl',
            'line-clamp-2',
            model.prefix === 'next' ? 'mt-1' : null,
          )}
          data-testid="tabata-billboard-name"
        >
          {model.name}
        </p>
      </div>
    </div>
  );
}
