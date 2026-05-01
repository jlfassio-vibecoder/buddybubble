'use client';

import type { AmrapParticipantEngine } from '@/features/amrap/types/amrap-engine';

export interface AmrapLeaderboardProps {
  participants: AmrapParticipantEngine[];
}

export default function AmrapLeaderboard({ participants }: AmrapLeaderboardProps) {
  const sorted = [...participants].sort((a, b) => {
    if (b.rounds !== a.rounds) return b.rounds - a.rounds;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-2 text-sm text-foreground">
      <div className="font-medium">Leaderboard</div>
      <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
        {sorted.map((p) => (
          <li key={p.id}>
            {p.name} — {p.rounds} round{p.rounds === 1 ? '' : 's'}
            {p.isSelf ? ' (you)' : ''}
          </li>
        ))}
      </ol>
    </div>
  );
}
