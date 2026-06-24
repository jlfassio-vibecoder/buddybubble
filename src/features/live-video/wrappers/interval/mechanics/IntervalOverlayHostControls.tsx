'use client';

import { Button } from '@/components/ui/button';

export type IntervalOverlayHostControlsProps = {
  showHostControls: boolean;
  canPause: boolean;
  canResume: boolean;
  onPause: () => void;
  onResume: () => void;
};

export function IntervalOverlayHostControls({
  showHostControls,
  canPause,
  canResume,
  onPause,
  onResume,
}: IntervalOverlayHostControlsProps) {
  if (!showHostControls || (!canPause && !canResume)) return null;

  return (
    <div className="flex shrink-0 items-center gap-1">
      {canPause ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 px-2 text-[10px] uppercase tracking-wide"
          onClick={onPause}
          data-testid="interval-overlay-pause"
        >
          Pause
        </Button>
      ) : null}
      {canResume ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 px-2 text-[10px] uppercase tracking-wide"
          onClick={onResume}
          data-testid="interval-overlay-resume"
        >
          Resume
        </Button>
      ) : null}
    </div>
  );
}
