'use client';

/**
 * Chat-drawer leaderboard: ranks, optional per-row lap times (hidden once results are locked),
 * finished-state actions, and host **Lock & Save Results** (calls `amrap_finalize_session`).
 * Does not repeat the workout exercise list — participants already see exercises in the main session UI.
 */

import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { AmrapParticipantAvatarPills } from '@/features/amrap/components/AmrapParticipantAvatarPills';
import { useAmrapRounds } from '@/features/amrap/hooks/useAmrapRounds';
import type { AmrapSessionEngine } from '@/features/amrap/types/amrap-engine';
import { buildAmrapLeaderboardRowAriaLabel } from '@/features/amrap/utils/buildAmrapLeaderboardRowAriaLabel';
import { computeAmrapLeaderboard } from '@/features/amrap/utils/computeAmrapLeaderboard';
import { parseLeaderboardSnapshot } from '@/features/amrap/utils/parseLeaderboardSnapshot';

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
  const frozenLeaderboard = useMemo(
    () => parseLeaderboardSnapshot(engine.leaderboardSnapshotRaw),
    [engine.leaderboardSnapshotRaw],
  );
  const leaderboardGroups = useMemo(
    () => frozenLeaderboard ?? computeAmrapLeaderboard(engine.participants),
    [frozenLeaderboard, engine.participants],
  );
  const useFrozenLeaderboard = frozenLeaderboard != null;

  return (
    <div className="space-y-3 text-sm text-foreground">
      <div>
        <div className="font-medium">Leaderboard</div>
        <ol className="mt-1 list-inside list-decimal space-y-1 text-muted-foreground">
          {leaderboardGroups.map((group) => {
            const roundsVals = group.participants.map((p) => p.rounds);
            const allSameRounds = roundsVals.every((r) => r === roundsVals[0]);
            const roundsLineSame = `${roundsVals[0]} round${roundsVals[0] === 1 ? '' : 's'}`;
            const showAvg = group.avgLapSec != null && roundsVals.some((r) => r > 0);
            const ariaLabel = buildAmrapLeaderboardRowAriaLabel(
              group.participants,
              allSameRounds,
              group.avgLapSec,
              showAvg,
              formatAvgSec,
            );

            return (
              <li key={group.participants.map((p) => p.id).join('-')} aria-label={ariaLabel}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <AmrapParticipantAvatarPills
                    participants={group.participants}
                    includeRoundsInTitle={!allSameRounds}
                  />
                  {showAvg ? (
                    <span className="shrink-0 text-xs">avg {formatAvgSec(group.avgLapSec!)}</span>
                  ) : null}
                </div>
                <div>
                  {allSameRounds
                    ? roundsLineSame
                    : group.participants.map((p) => `${p.rounds}r`).join(' · ')}
                </div>
                {!useFrozenLeaderboard
                  ? group.participants.map((p) => {
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
                          {times
                            .map((sec, i) => `R${i + 1} @ ${formatElapsedSec(sec)}`)
                            .join(' · ')}
                        </div>
                      );
                    })
                  : null}
              </li>
            );
          })}
        </ol>
      </div>

      {engine.timerPhase === 'finished' ? (
        <div className="flex flex-wrap gap-2">
          {engine.finalizeSession ? (
            <Button type="button" size="sm" onClick={() => void engine.finalizeSession?.()}>
              Lock & Save Results
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => engine.pageState.handleOpenViewResults()}
          >
            Open results
          </Button>
        </div>
      ) : null}
    </div>
  );
}
