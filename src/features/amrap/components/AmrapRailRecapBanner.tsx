'use client';

import { Button } from '@/components/ui/button';
import { useAmrapRailOptional } from '@/features/live-video/contexts/AmrapRailContext';
import { cn } from '@/lib/utils';

export type AmrapRailRecapBannerProps = {
  className?: string;
};

export function AmrapRailRecapBanner({ className }: AmrapRailRecapBannerProps) {
  const rail = useAmrapRailOptional();
  const engine = rail?.engine;
  const isHost = rail?.isHost ?? false;

  if (engine == null || engine.timerPhase !== 'finished') {
    return null;
  }

  const finalized = engine.resultsFinalizedAt != null;

  const statusLine = isHost
    ? engine.intervalType === 'tabata'
      ? 'Tabata complete'
      : engine.intervalType === 'emom'
        ? 'EMOM complete'
        : 'AMRAP complete'
    : finalized
      ? 'Results locked'
      : 'Waiting for host to lock results';

  const viewResultsLabel = isHost || finalized ? 'View results' : 'View provisional results';

  return (
    <div
      className={cn('mb-2 shrink-0 rounded-lg border border-border bg-muted/50 p-2', className)}
      role="region"
      aria-label="AMRAP results actions"
    >
      <p className="mb-2 text-[11px] font-medium text-foreground">{statusLine}</p>
      <div className="flex flex-wrap gap-1.5">
        {isHost && engine.finalizeSession ? (
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void engine.finalizeSession?.()}
          >
            Lock &amp; Save
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => engine.pageState.handleOpenViewResults()}
        >
          {viewResultsLabel}
        </Button>
      </div>
    </div>
  );
}
