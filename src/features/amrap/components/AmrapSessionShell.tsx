'use client';

import { Button } from '@/components/ui/button';
import type { AmrapSessionEngine } from '@/features/amrap/types/amrap-engine';
import type { ReactNode } from 'react';

export interface AmrapSessionShellProps {
  engine: AmrapSessionEngine;
  role: 'host' | 'participant';
  titleBarAccessory?: ReactNode;
  recapDismissed?: boolean;
}

export default function AmrapSessionShell({
  engine,
  role,
  titleBarAccessory,
  recapDismissed = false,
}: AmrapSessionShellProps) {
  const ps = engine.pageState;

  return (
    <div className="flex min-h-[120px] flex-col gap-3 rounded-b-2xl border border-white/10 bg-black/40 px-4 py-3 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-white">
          {engine.timerPhase === 'work' ? (
            <span>
              {engine.remainingSec}s / {engine.totalSec}s
            </span>
          ) : engine.timerPhase === 'finished' ? (
            <span>Finished</span>
          ) : (
            <span>Ready — {engine.totalSec}s block</span>
          )}
        </div>
        {role === 'host' ? titleBarAccessory : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {engine.logRound ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={engine.timerPhase !== 'work'}
            onClick={() => void engine.logRound?.()}
          >
            Log round
          </Button>
        ) : null}
        {engine.timerPhase === 'finished' && !recapDismissed ? (
          <>
            {engine.finalizeSession && !engine.resultsFinalizedAt ? (
              <Button type="button" size="sm" onClick={() => void engine.finalizeSession?.()}>
                Lock & Save Results
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => ps?.handleOpenViewResults()}
            >
              Open results
            </Button>
          </>
        ) : null}
      </div>

      {engine.error ? <p className="text-xs text-amber-200">{engine.error}</p> : null}
    </div>
  );
}
