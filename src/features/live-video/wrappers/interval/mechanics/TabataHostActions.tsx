'use client';

import { Button } from '@/components/ui/button';
import type { IntervalSessionEngine } from '@/features/live-video/wrappers/interval/types/interval-engine';

export interface TabataHostActionsProps {
  engine: IntervalSessionEngine;
}

export default function TabataHostActions({ engine }: TabataHostActionsProps) {
  const isActive = engine.timerPhase === 'work';

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {engine.startTimer ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={isActive}
          onClick={() => void engine.startTimer?.()}
        >
          Start timer
        </Button>
      ) : null}
      {engine.resetTimer ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void engine.resetTimer?.()}
        >
          Reset
        </Button>
      ) : null}
    </div>
  );
}
