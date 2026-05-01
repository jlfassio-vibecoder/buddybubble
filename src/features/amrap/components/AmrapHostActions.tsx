'use client';

import { Button } from '@/components/ui/button';
import type { AmrapSessionEngine } from '@/features/amrap/types/amrap-engine';

export interface AmrapHostActionsProps {
  engine: AmrapSessionEngine;
}

export default function AmrapHostActions({ engine }: AmrapHostActionsProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {engine.startTimer ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={engine.timerPhase === 'work'}
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
