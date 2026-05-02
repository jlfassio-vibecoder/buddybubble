'use client';

import { useMemo } from 'react';

import type { AmrapParticipantEngine } from '@/features/amrap/types/amrap-engine';
import { computeAmrapLeaderboard } from '@/features/amrap/utils/computeAmrapLeaderboard';

export interface AmrapLeaderboardProps {
  participants: AmrapParticipantEngine[];
}

function formatAvgSec(sec: number): string {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function AmrapLeaderboard({ participants }: AmrapLeaderboardProps) {
  const groups = useMemo(() => computeAmrapLeaderboard(participants), [participants]);

  return (
    <div className="space-y-2 text-sm text-foreground">
      <div className="font-medium">Leaderboard</div>
      <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
        {groups.map((group) => {
          const roundsVals = group.participants.map((p) => p.rounds);
          const allSameRounds = roundsVals.every((r) => r === roundsVals[0]);
          const namesJoined = group.participants
            .map((p) => `${p.name}${p.isSelf ? ' (you)' : ''}`)
            .join(', ');
          const mixedRoundsLine = group.participants
            .map((p) => `${p.name}${p.isSelf ? ' (you)' : ''} (${p.rounds}r)`)
            .join(', ');
          const showAvg = group.avgLapSec != null && roundsVals.some((r) => r > 0);
          const body = allSameRounds
            ? `${namesJoined} — ${roundsVals[0]} round${roundsVals[0] === 1 ? '' : 's'}`
            : mixedRoundsLine;
          const avgSuffix = showAvg
            ? allSameRounds
              ? ` (avg ${formatAvgSec(group.avgLapSec!)})`
              : ` — avg ${formatAvgSec(group.avgLapSec!)}`
            : '';
          return (
            <li key={group.participants.map((p) => p.id).join('-')}>
              {body}
              {avgSuffix}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
