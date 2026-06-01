import type { IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';
import { computeAmrapLeaderboard } from '@/features/amrap/utils/computeAmrapLeaderboard';
import type { AmrapSessionEngine } from '@/features/amrap/types/amrap-engine';
import { agoraUidFromUuid } from '@/lib/live-video/agora-uid';
import type {
  GamifiedRailEntry,
  GamifiedRailModel,
  OnVideoRailTile,
  RailParticipant,
} from '@/features/live-video/ui/gamified-rail.types';

function lapEntriesForParticipant(
  engine: AmrapSessionEngine,
  participantId: string,
): GamifiedRailEntry['lapEntries'] {
  const group = engine.participantRoundLaps.find((p) => p.participantId === participantId);
  return group?.entries ?? [];
}

function buildClassicModel(railParticipants: RailParticipant[]): GamifiedRailModel {
  const onVideoTiles: OnVideoRailTile[] = railParticipants.map((rail) => ({
    rail,
    entry: {
      kind: 'on-video',
      agoraUidStr: rail.kind === 'remote' ? String(rail.user.uid) : undefined,
      amrapParticipantId: '',
      displayName: '',
      rank: null,
      rounds: 0,
      avgLapSec: null,
      lapEntries: [],
      isSelf: rail.kind === 'local',
      hasVideo: true,
    },
  }));
  return { isGamified: false, onVideoTiles, offlineEntries: [] };
}

export type BuildGamifiedRailModelArgs = {
  phase: string;
  engine: AmrapSessionEngine | null;
  railParticipants: RailParticipant[];
  localHasVideo: boolean;
  localIsCameraOff: boolean;
  remoteHasVideo: (user: IAgoraRTCRemoteUser) => boolean;
};

export function buildGamifiedRailModel({
  phase,
  engine,
  railParticipants,
  localHasVideo,
  localIsCameraOff,
  remoteHasVideo,
}: BuildGamifiedRailModelArgs): GamifiedRailModel {
  if (phase !== 'amrap' || engine == null || engine.participants.length === 0) {
    return buildClassicModel(railParticipants);
  }

  const uidToRail = new Map<string, RailParticipant>();
  for (const rail of railParticipants) {
    if (rail.kind === 'local') {
      continue;
    }
    uidToRail.set(String(rail.user.uid), rail);
  }

  const leaderboard = computeAmrapLeaderboard(engine.participants);
  const onVideoTiles: OnVideoRailTile[] = [];
  const offlineEntries: GamifiedRailEntry[] = [];
  const matchedParticipantIds = new Set<string>();

  for (const group of leaderboard) {
    for (const p of group.participants) {
      const uid = p.userId != null ? String(agoraUidFromUuid(p.userId)) : null;
      let rail: RailParticipant | undefined;
      if (p.isSelf) {
        rail = railParticipants.find((r) => r.kind === 'local');
      } else if (uid != null) {
        rail = uidToRail.get(uid);
      }

      const entry: GamifiedRailEntry = {
        kind: rail != null ? 'on-video' : 'offline',
        agoraUidStr: uid ?? undefined,
        amrapParticipantId: p.id,
        displayName: p.name,
        rank: group.rank,
        rounds: p.rounds,
        avgLapSec: p.avgLapSec,
        lapEntries: lapEntriesForParticipant(engine, p.id),
        isSelf: p.isSelf,
        hasVideo:
          rail?.kind === 'local'
            ? localHasVideo && !localIsCameraOff
            : rail?.kind === 'remote'
              ? remoteHasVideo(rail.user)
              : false,
      };

      matchedParticipantIds.add(p.id);

      if (rail != null) {
        onVideoTiles.push({ rail, entry });
      } else {
        offlineEntries.push(entry);
      }
    }
  }

  onVideoTiles.sort((a, b) => {
    const ra = a.entry.rank ?? 999;
    const rb = b.entry.rank ?? 999;
    return ra - rb;
  });

  offlineEntries.sort((a, b) => {
    const ra = a.rank ?? 999;
    const rb = b.rank ?? 999;
    return ra - rb;
  });

  return { isGamified: true, onVideoTiles, offlineEntries };
}
