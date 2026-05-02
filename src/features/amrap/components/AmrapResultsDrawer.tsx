'use client';

import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { useAmrapRounds } from '@/features/amrap/hooks/useAmrapRounds';
import type { AmrapSessionEngine } from '@/features/amrap/types/amrap-engine';
import { computeAmrapLeaderboard } from '@/features/amrap/utils/computeAmrapLeaderboard';

function formatElapsedSec(s: number): string {
  const sec = Math.max(0, Math.round(s));
  const mm = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const ss = (sec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

function formatAvgSec(sec: number): string {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
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
  const leaderboardGroups = useMemo(
    () => computeAmrapLeaderboard(engine.participants),
    [engine.participants],
  );

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
          {leaderboardGroups.map((group) => {
            const namesJoined = group.participants
              .map((p) => `${p.name}${p.isSelf ? ' (you)' : ''}`)
              .join(', ');
            const roundsVals = group.participants.map((p) => p.rounds);
            const allSameRounds = roundsVals.every((r) => r === roundsVals[0]);
            const roundsLine = allSameRounds
              ? `${roundsVals[0]} round${roundsVals[0] === 1 ? '' : 's'}`
              : group.participants
                  .map((p) => `${p.name}${p.isSelf ? ' (you)' : ''} (${p.rounds}r)`)
                  .join(', ');
            const showAvg = group.avgLapSec != null && roundsVals.some((r) => r > 0);

            return (
              <li key={group.participants.map((p) => p.id).join('-')}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <span>{namesJoined}</span>
                  {showAvg ? (
                    <span className="shrink-0 text-xs">avg {formatAvgSec(group.avgLapSec!)}</span>
                  ) : null}
                </div>
                <div>{roundsLine}</div>
                {group.participants.map((p) => {
                  const times =
                    startedAt != null
                      ? rows
                          .filter((r) => r.participant_id === p.id)
                          .map((r) =>
                            Math.max(
                              0,
                              Math.round((new Date(r.logged_at).getTime() - startedAt) / 1000),
                            ),
                          )
                      : [];
                  if (times.length === 0) return null;
                  return (
                    <div key={p.id} className="ml-4 text-xs">
                      <span className="font-medium text-muted-foreground">{p.name}: </span>
                      {times.map((sec, i) => `R${i + 1} @ ${formatElapsedSec(sec)}`).join(' · ')}
                    </div>
                  );
                })}
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
