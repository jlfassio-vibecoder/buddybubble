'use client';

import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { useAgoraSession } from '@/features/live-video/agora-session-context';
import { useAmrapRailOptional } from '@/features/live-video/contexts/AmrapRailContext';
import { buildGamifiedRailModel } from '@/features/live-video/hooks/useGamifiedRailModel';
import {
  remoteUserHasVideo,
  useRailParticipants,
} from '@/features/live-video/hooks/useRailParticipants';
import { useLiveSessionRuntimeOptional } from '@/features/live-video/theater/live-session-runtime-context';
import { AmrapRailFinalizeBanner } from '@/features/amrap/components/AmrapRailFinalizeBanner';
import { GamifiedRailOfflineList } from '@/features/live-video/ui/GamifiedRailOfflineList';
import { GamifiedRailTile } from '@/features/live-video/ui/GamifiedRailTile';
import { cn } from '@/lib/utils';

export type GamifiedParticipantRailProps = {
  localUserId: string;
  hostUserId: string;
  excludeUidForTiles?: string | null;
  localRailPipOverlay?: ReactNode;
  renderRemoteRailBottomOverlay?: (agoraUidStr: string) => ReactNode;
  className?: string;
};

export function GamifiedParticipantRail({
  localUserId,
  hostUserId,
  excludeUidForTiles,
  localRailPipOverlay,
  renderRemoteRailBottomOverlay,
  className,
}: GamifiedParticipantRailProps) {
  const runtime = useLiveSessionRuntimeOptional();
  const sessionPhase = runtime?.state.phase ?? 'lobby';
  const amrapRail = useAmrapRailOptional();
  const { localVideoTrack, isMicMuted, isCameraOff } = useAgoraSession();
  const { localRtcUid, allRailParticipants } = useRailParticipants(localUserId, hostUserId);

  const model = useMemo(
    () =>
      buildGamifiedRailModel({
        phase: sessionPhase,
        engine: amrapRail?.engine ?? null,
        railParticipants: allRailParticipants,
        localHasVideo: localVideoTrack != null,
        localIsCameraOff: isCameraOff,
        remoteHasVideo: remoteUserHasVideo,
      }),
    [sessionPhase, amrapRail?.engine, allRailParticipants, localVideoTrack, isCameraOff],
  );

  const tiles = model.isGamified
    ? model.onVideoTiles
    : allRailParticipants.map((rail) => ({
        rail,
        entry: undefined as undefined,
      }));

  const hasContent = model.isGamified
    ? model.onVideoTiles.length > 0 || model.offlineEntries.length > 0
    : allRailParticipants.length > 0;

  if (!hasContent) {
    return null;
  }

  const exclude = excludeUidForTiles;

  return (
    <div
      className={cn(
        'flex h-full w-[220px] shrink-0 flex-none flex-col overflow-hidden rounded-xl border border-border bg-card/70 p-2 shadow-sm md:w-[260px]',
        model.isGamified && 'md:w-[280px]',
        className,
      )}
      aria-label="Participant thumbnails"
    >
      <AmrapRailFinalizeBanner />
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain">
        {tiles.map(({ rail, entry }) => {
          const uidStr = rail.kind === 'remote' ? String(rail.user.uid) : String(localRtcUid);
          const excluded = exclude != null && uidStr === String(exclude);
          const legacyOverlay =
            !model.isGamified && rail.kind === 'local'
              ? localRailPipOverlay
              : !model.isGamified && rail.kind === 'remote' && renderRemoteRailBottomOverlay
                ? renderRemoteRailBottomOverlay(String(rail.user.uid))
                : undefined;

          return (
            <GamifiedRailTile
              key={rail.key}
              rail={rail}
              entry={entry}
              isGamified={model.isGamified}
              excluded={excluded}
              localVideoTrack={localVideoTrack}
              isMicMuted={isMicMuted}
              isCameraOff={isCameraOff}
              legacyBottomOverlay={legacyOverlay}
            />
          );
        })}
        {model.isGamified ? <GamifiedRailOfflineList entries={model.offlineEntries} /> : null}
      </div>
    </div>
  );
}
