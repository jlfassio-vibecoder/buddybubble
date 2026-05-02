'use client';

import { cn } from '@/lib/utils';
import type { AmrapSessionEngine } from '@/features/amrap/types/amrap-engine';

const LAPS_PER_ROW = 4;

export type AmrapRoundLapsOverlayVariant = 'host-stage-bottom' | 'participant-pip-bottom-right';

function chunkLaps<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export default function AmrapRoundLapsOverlay({
  engine,
  variant,
  /** When set, only that AMRAP participant row is shown (for a single video tile). */
  filterToParticipantId,
}: {
  engine: AmrapSessionEngine;
  variant: AmrapRoundLapsOverlayVariant;
  filterToParticipantId?: string | null;
}) {
  const allWithLaps = engine.participantRoundLaps.filter((p) => p.entries.length > 0);
  const groups =
    filterToParticipantId != null && filterToParticipantId !== ''
      ? allWithLaps.filter((p) => p.participantId === filterToParticipantId)
      : allWithLaps;
  if (groups.length === 0) return null;

  const isHostStrip = variant === 'host-stage-bottom';
  const singleTileMode = Boolean(filterToParticipantId);

  const chipClass =
    'whitespace-nowrap rounded-md border border-white/15 bg-black/40 px-1.5 py-0.5 tabular-nums';

  return (
    <div
      className={cn(
        'flex max-h-[min(52vh,22rem)] flex-col gap-y-2 overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-black/50 text-white shadow-lg backdrop-blur-md',
        isHostStrip
          ? 'max-w-full items-stretch px-3 py-2 text-xs'
          : 'max-w-full items-stretch p-2 text-[10px] leading-tight',
      )}
      aria-label={singleTileMode ? 'Round lap times' : 'Round lap times for all participants'}
    >
      {groups.map((p) => {
        const rows = chunkLaps(p.entries, LAPS_PER_ROW);
        return (
          <div
            key={p.participantId}
            className="flex w-full flex-col items-end gap-y-1 border-t border-white/10 pt-2 first:border-t-0 first:pt-0"
          >
            {!singleTileMode ? (
              <div className="w-full max-w-full truncate text-right text-[10px] font-medium text-white/65">
                {p.displayName}
                {p.isSelf ? ' (you)' : ''}
              </div>
            ) : null}
            {rows.map((row, ri) => (
              <div key={ri} className="flex w-full flex-row flex-nowrap justify-end gap-x-2">
                {row.map((e) => (
                  <span key={`${p.participantId}-${e.round}`} className={chipClass}>
                    RD {e.round} - {e.durationLabel}
                  </span>
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
