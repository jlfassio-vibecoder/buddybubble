'use client';

import type { AmrapLapEntry } from '@/features/amrap/types/amrap-engine';
import { cn } from '@/lib/utils';

export type AmrapRailLapChipsProps = {
  entries: AmrapLapEntry[];
  className?: string;
  maxVisible?: number;
};

export function AmrapRailLapChips({ entries, className, maxVisible = 3 }: AmrapRailLapChipsProps) {
  if (entries.length === 0) return null;
  const visible = entries.slice(-maxVisible);
  const overflow = entries.length - visible.length;

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-1 bottom-1 z-[2] flex flex-wrap justify-end gap-0.5',
        className,
      )}
    >
      {visible.map((e) => (
        <span
          key={`${e.round}-${e.durationLabel}`}
          className="whitespace-nowrap rounded border border-white/15 bg-black/60 px-1 py-px text-[9px] tabular-nums text-white"
        >
          R{e.round} {e.durationLabel}
        </span>
      ))}
      {overflow > 0 ? (
        <span className="rounded border border-white/15 bg-black/60 px-1 py-px text-[9px] text-white/80">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
