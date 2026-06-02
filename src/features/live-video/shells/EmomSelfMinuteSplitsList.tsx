'use client';

import type { EmomMinuteSplitEntry } from '@/features/live-video/wrappers/interval/types/interval-engine';
import { cn } from '@/lib/utils';

export type EmomSelfMinuteSplitsListProps = {
  entries: EmomMinuteSplitEntry[];
  className?: string;
};

/** Read-only self pacing chips (not a huddle-wide leaderboard). */
export function EmomSelfMinuteSplitsList({ entries, className }: EmomSelfMinuteSplitsListProps) {
  if (entries.length === 0) return null;

  return (
    <ul
      className={cn(
        'flex flex-wrap gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-2',
        className,
      )}
      data-region="emom-self-minute-splits"
      aria-label="Your EMOM minute splits"
    >
      {entries.map((e) => (
        <li
          key={e.minuteIndex}
          className="rounded-md bg-background/80 px-2 py-1 text-[11px] tabular-nums text-muted-foreground"
        >
          <span className="font-medium text-foreground/80">M{e.minuteIndex}</span> {e.durationLabel}
        </li>
      ))}
    </ul>
  );
}
