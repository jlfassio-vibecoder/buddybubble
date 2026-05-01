'use client';

import type { AmrapParticipantEngine } from '@/features/amrap/types/amrap-engine';

export interface AmrapWhosHereProps {
  participants: AmrapParticipantEngine[];
}

export default function AmrapWhosHere({ participants }: AmrapWhosHereProps) {
  return (
    <div className="space-y-2 text-sm text-foreground">
      <div className="font-medium">Who&apos;s here</div>
      <ul className="list-inside list-disc space-y-1 text-muted-foreground">
        {participants.map((p) => (
          <li key={p.id}>
            {p.name}
            {p.isHost ? ' (host)' : ''} — {p.rounds} round{p.rounds === 1 ? '' : 's'}
          </li>
        ))}
      </ul>
    </div>
  );
}
