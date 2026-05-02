'use client';

import { useMemo } from 'react';

import { AmrapParticipantAvatarPills } from '@/features/amrap/components/AmrapParticipantAvatarPills';
import type { AmrapParticipantEngine } from '@/features/amrap/types/amrap-engine';
import { buildAmrapLeaderboardRowAriaLabel } from '@/features/amrap/utils/buildAmrapLeaderboardRowAriaLabel';
import { computeAmrapLeaderboard } from '@/features/amrap/utils/computeAmrapLeaderboard';
import { parseLeaderboardSnapshot } from '@/features/amrap/utils/parseLeaderboardSnapshot';
import type { Json } from '@/types/database';

export interface AmrapLeaderboardProps {
  participants: AmrapParticipantEngine[];
  /** When parseable, leaderboard rows render from this frozen JSON instead of live `computeAmrapLeaderboard`. */
  leaderboardSnapshotRaw?: Json | null;
}

function formatAvgSec(sec: number): string {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function AmrapLeaderboard({
  participants,
  leaderboardSnapshotRaw = null,
}: AmrapLeaderboardProps) {
  const viewerAuthUserId = useMemo(
    () => participants.find((p) => p.isSelf)?.userId ?? null,
    [participants],
  );
  const frozenGroups = useMemo(
    () => parseLeaderboardSnapshot(leaderboardSnapshotRaw, viewerAuthUserId),
    [leaderboardSnapshotRaw, viewerAuthUserId],
  );
  const groups = useMemo(
    () => frozenGroups ?? computeAmrapLeaderboard(participants),
    [frozenGroups, participants],
  );

  return (
    <div className="space-y-2 text-sm text-foreground">
      <div className="font-medium">Leaderboard</div>
      <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
        {groups.map((group) => {
          const roundsVals = group.participants.map((p) => p.rounds);
          const allSameRounds = roundsVals.every((r) => r === roundsVals[0]);
          const showAvg = group.avgLapSec != null && roundsVals.some((r) => r > 0);
          const n = roundsVals[0] ?? 0;
          const ariaLabel = buildAmrapLeaderboardRowAriaLabel(
            group.participants,
            allSameRounds,
            group.avgLapSec,
            showAvg,
            formatAvgSec,
          );

          return (
            <li key={group.participants.map((p) => p.id).join('-')} aria-label={ariaLabel}>
              <div className="flex flex-col gap-0.5 text-muted-foreground">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <AmrapParticipantAvatarPills
                    participants={group.participants}
                    includeRoundsInTitle={!allSameRounds}
                  />
                  {allSameRounds ? (
                    <span>
                      — {n} round{n === 1 ? '' : 's'}
                      {showAvg ? <span>{` (avg ${formatAvgSec(group.avgLapSec!)})`}</span> : null}
                    </span>
                  ) : null}
                </div>
                {!allSameRounds ? (
                  <div className="text-xs">
                    {group.participants.map((p) => `${p.rounds}r`).join(' · ')}
                    {showAvg ? <span>{` — avg ${formatAvgSec(group.avgLapSec!)}`}</span> : null}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
