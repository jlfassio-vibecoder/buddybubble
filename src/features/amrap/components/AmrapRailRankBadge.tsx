'use client';

import { cn } from '@/lib/utils';

export type AmrapRailRankBadgeProps = {
  rank: number | null;
  className?: string;
};

export function AmrapRailRankBadge({ rank, className }: AmrapRailRankBadgeProps) {
  if (rank == null) return null;
  return (
    <span
      className={cn(
        'absolute left-1.5 top-1.5 z-[2] rounded-md border border-white/20 bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white shadow',
        className,
      )}
      aria-label={`Rank ${rank}`}
    >
      #{rank}
    </span>
  );
}
