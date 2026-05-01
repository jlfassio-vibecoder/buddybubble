'use client';

import { Button } from '@/components/ui/button';
import type { AmrapSessionEngine } from '@/features/amrap/types/amrap-engine';

export default function AmrapLogRoundOverlay({ engine }: { engine: AmrapSessionEngine }) {
  if (!engine.selfParticipant) return null;
  const rounds = engine.selfParticipant.rounds;
  const canLog = engine.timerPhase === 'work' && engine.logRound != null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[43]">
      <div className="pointer-events-auto absolute top-4 right-4 flex items-center gap-3 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-white shadow-lg backdrop-blur-md">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] font-medium uppercase tracking-wider text-white/50">
            Rounds
          </span>
          <span className="text-2xl font-bold tabular-nums">{rounds}</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!canLog}
          onClick={() => void engine.logRound?.()}
        >
          Log round
        </Button>
      </div>
    </div>
  );
}
