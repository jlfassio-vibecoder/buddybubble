'use client';

import { Button } from '@/components/ui/button';
import { useAmrapRounds } from '@/features/amrap/hooks/useAmrapRounds';
import type { AmrapSessionEngine } from '@/features/amrap/types/amrap-engine';

function formatElapsedSec(s: number): string {
  const sec = Math.max(0, Math.round(s));
  const mm = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const ss = (sec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

export default function AmrapResultsDrawer({
  amrapSessionId,
  engine,
}: {
  amrapSessionId: string;
  engine: AmrapSessionEngine;
}) {
  const { rows } = useAmrapRounds(amrapSessionId);
  const startedAt = engine.workStartedAt ? new Date(engine.workStartedAt).getTime() : null;
  const sortedParticipants = [...engine.participants].sort((a, b) => {
    if (b.rounds !== a.rounds) return b.rounds - a.rounds;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-3 text-sm text-foreground">
      {engine.blockSnapshot ? (
        <div>
          <div className="font-medium">{engine.blockSnapshot.title}</div>
          {engine.blockSnapshot.workout_type ? (
            <p className="text-xs text-muted-foreground">{engine.blockSnapshot.workout_type}</p>
          ) : null}
          <ol className="mt-1 list-inside list-decimal text-xs text-muted-foreground">
            {engine.blockSnapshot.exercises.slice(0, 12).map((ex, i) => (
              <li key={i}>
                {typeof ex.sets === 'number' && ex.sets > 0 ? `${ex.sets}× ` : ''}
                {ex.reps !== undefined && ex.reps !== null && String(ex.reps).trim() !== ''
                  ? `${ex.reps} `
                  : ''}
                {ex.name}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div>
        <div className="font-medium">Leaderboard</div>
        <ol className="mt-1 list-inside list-decimal space-y-1 text-muted-foreground">
          {sortedParticipants.map((p) => {
            const times =
              startedAt != null
                ? rows
                    .filter((r) => r.participant_id === p.id)
                    .map((r) =>
                      Math.max(0, Math.round((new Date(r.logged_at).getTime() - startedAt) / 1000)),
                    )
                : [];
            return (
              <li key={p.id}>
                <div>
                  {p.name} — {p.rounds} round{p.rounds === 1 ? '' : 's'}
                  {p.isSelf ? ' (you)' : ''}
                </div>
                {times.length > 0 ? (
                  <div className="ml-4 text-xs">
                    {times.map((sec, i) => `R${i + 1} @ ${formatElapsedSec(sec)}`).join(' · ')}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>

      {engine.timerPhase === 'finished' ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => engine.pageState.handleOpenViewResults()}
        >
          Open results
        </Button>
      ) : null}
    </div>
  );
}
