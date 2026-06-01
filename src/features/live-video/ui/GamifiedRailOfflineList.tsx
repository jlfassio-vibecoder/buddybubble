'use client';

import type { GamifiedRailEntry } from '@/features/live-video/ui/gamified-rail.types';
import { cn } from '@/lib/utils';

function formatAvgSec(sec: number): string {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export type GamifiedRailOfflineListProps = {
  entries: GamifiedRailEntry[];
  className?: string;
};

export function GamifiedRailOfflineList({ entries, className }: GamifiedRailOfflineListProps) {
  if (entries.length === 0) return null;

  return (
    <div className={cn('mt-2 shrink-0 border-t border-border pt-2', className)}>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Off video
      </p>
      <ul className="space-y-1 text-[11px] text-muted-foreground">
        {entries.map((e) => (
          <li key={e.amrapParticipantId} className="flex flex-wrap items-baseline gap-x-1.5">
            {e.rank != null ? (
              <span className="font-semibold text-foreground">#{e.rank}</span>
            ) : null}
            <span className="font-medium text-foreground">{e.displayName}</span>
            <span>
              {e.rounds} rnd{e.rounds === 1 ? '' : 's'}
              {e.avgLapSec != null ? ` · avg ${formatAvgSec(e.avgLapSec)}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
