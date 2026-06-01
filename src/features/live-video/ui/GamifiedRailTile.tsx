'use client';

import type { ReactNode } from 'react';
import type { ILocalVideoTrack } from 'agora-rtc-sdk-ng';
import { LocalVideoPreview } from '@/features/live-video/LocalVideoPreview';
import { RemoteVideoPreview } from '@/features/live-video/RemoteVideoPreview';
import { AmrapRailLapChips } from '@/features/amrap/components/AmrapRailLapChips';
import { AmrapRailRankBadge } from '@/features/amrap/components/AmrapRailRankBadge';
import type {
  GamifiedRailEntry,
  RailParticipant,
} from '@/features/live-video/ui/gamified-rail.types';
import { cn } from '@/lib/utils';

const railTileClass =
  'relative w-full aspect-video shrink-0 overflow-hidden rounded-lg border border-border bg-black shadow-md';

const videoHiddenPlaceholderClass =
  'absolute inset-0 z-[1] flex items-center justify-center bg-black/80 text-xs text-muted-foreground';

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

export type GamifiedRailTileProps = {
  rail: RailParticipant;
  entry?: GamifiedRailEntry;
  isGamified: boolean;
  excluded: boolean;
  localVideoTrack: ILocalVideoTrack | null;
  isMicMuted: boolean;
  isCameraOff: boolean;
  legacyBottomOverlay?: ReactNode;
};

export function GamifiedRailTile({
  rail,
  entry,
  isGamified,
  excluded,
  localVideoTrack,
  isMicMuted,
  isCameraOff,
  legacyBottomOverlay,
}: GamifiedRailTileProps) {
  const showGamifiedChrome = isGamified && entry != null;
  const showInitials = showGamifiedChrome && !entry.hasVideo;

  if (rail.kind === 'local') {
    return (
      <div className={railTileClass}>
        {excluded ? (
          <div className={cn(videoHiddenPlaceholderClass, 'text-[10px]')}>Video hidden</div>
        ) : (
          <>
            {showInitials ? (
              <div className="absolute inset-0 z-[1] flex items-center justify-center bg-zinc-900 text-lg font-semibold text-white">
                {initialsFromName(entry.displayName || 'You')}
              </div>
            ) : (
              <>
                <LocalVideoPreview
                  track={localVideoTrack}
                  isMicMuted={isMicMuted}
                  isCameraOff={isCameraOff}
                  className="absolute inset-0 h-full w-full min-h-0 min-w-0"
                />
                {localVideoTrack == null && !showGamifiedChrome ? (
                  <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-black/70 text-[10px] text-muted-foreground">
                    Camera off
                  </div>
                ) : null}
              </>
            )}
            {showGamifiedChrome ? (
              <>
                <AmrapRailRankBadge rank={entry.rank} />
                <span className="absolute right-1.5 top-1.5 z-[2] rounded-md border border-white/20 bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                  {entry.rounds} rnd{entry.rounds === 1 ? '' : 's'}
                </span>
                <AmrapRailLapChips entries={entry.lapEntries} />
              </>
            ) : legacyBottomOverlay != null ? (
              <div className="pointer-events-none absolute inset-0 z-[44] flex items-end justify-end p-2">
                {legacyBottomOverlay}
              </div>
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <div className={railTileClass}>
      {excluded ? (
        <div className={cn(videoHiddenPlaceholderClass, 'text-[10px]')}>Video hidden</div>
      ) : (
        <>
          {showInitials ? (
            <div className="absolute inset-0 z-[1] flex items-center justify-center bg-zinc-900 text-lg font-semibold text-white">
              {initialsFromName(entry!.displayName)}
            </div>
          ) : (
            <RemoteVideoPreview
              user={rail.user}
              className="absolute inset-0 h-full w-full min-h-0 min-w-0 rounded-none border-0"
            />
          )}
          {showGamifiedChrome ? (
            <>
              <AmrapRailRankBadge rank={entry!.rank} />
              <span className="absolute right-1.5 top-1.5 z-[2] rounded-md border border-white/20 bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                {entry!.rounds} rnd{entry!.rounds === 1 ? '' : 's'}
              </span>
              <AmrapRailLapChips entries={entry!.lapEntries} />
            </>
          ) : legacyBottomOverlay != null ? (
            <div className="pointer-events-none absolute inset-0 z-[44] flex items-end justify-end p-2">
              {legacyBottomOverlay}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
