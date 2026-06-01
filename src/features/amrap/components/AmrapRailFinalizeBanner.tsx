'use client';

import { Button } from '@/components/ui/button';
import { useAmrapRailOptional } from '@/features/live-video/contexts/AmrapRailContext';
import { cn } from '@/lib/utils';

export type AmrapRailFinalizeBannerProps = {
  className?: string;
};

export function AmrapRailFinalizeBanner({ className }: AmrapRailFinalizeBannerProps) {
  const rail = useAmrapRailOptional();
  const engine = rail?.engine;
  const isHost = rail?.isHost ?? false;

  if (!isHost || engine == null || engine.timerPhase !== 'finished') {
    return null;
  }

  return (
    <div
      className={cn('mb-2 shrink-0 rounded-lg border border-border bg-muted/50 p-2', className)}
      role="region"
      aria-label="AMRAP results actions"
    >
      <p className="mb-2 text-[11px] font-medium text-foreground">AMRAP complete</p>
      <div className="flex flex-wrap gap-1.5">
        {engine.finalizeSession ? (
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
          View results
        </Button>
      </div>
    </div>
  );
}
