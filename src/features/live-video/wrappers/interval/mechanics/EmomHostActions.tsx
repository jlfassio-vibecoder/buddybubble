'use client';

import { Button } from '@/components/ui/button';
import type { IntervalSessionEngine } from '@/features/live-video/wrappers/interval/types/interval-engine';

type EmomHostActionsProps = {
  engine: IntervalSessionEngine;
};

export default function EmomHostActions({ engine }: EmomHostActionsProps) {
  const isActive = engine.timerPhase === 'work';

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {engine.startTimer ? (
        <Button disabled={isActive} onClick={() => void engine.startTimer?.()}>
          Start timer
        </Button>
      ) : null}
      {engine.resetTimer ? <Button onClick={() => void engine.resetTimer?.()}>Reset</Button> : null}
    </div>
  );
}
