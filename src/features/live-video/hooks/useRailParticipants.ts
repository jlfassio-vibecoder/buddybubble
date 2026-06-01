import { useMemo } from 'react';
import type { IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';
import { useAgoraSession } from '@/features/live-video/agora-session-context';
import { agoraUidFromUuid } from '@/lib/live-video/agora-uid';
import type { RailParticipant } from '@/features/live-video/ui/gamified-rail.types';

export function useRailParticipants(localUserId: string, hostUserId: string) {
  const { remoteUsers } = useAgoraSession();

  const hostRtcUid = agoraUidFromUuid(hostUserId);
  const localRtcUid = agoraUidFromUuid(localUserId);
  const localIsHost = localRtcUid === hostRtcUid;

  const sortedRemotes = useMemo(
    () => [...remoteUsers].sort((a, b) => Number(a.uid) - Number(b.uid)),
    [remoteUsers],
  );

  const railRemotes = useMemo(() => {
    if (localIsHost) return sortedRemotes;
    return sortedRemotes.filter((u) => Number(u.uid) !== hostRtcUid);
  }, [localIsHost, sortedRemotes, hostRtcUid]);

  const railHasLocalPip = !localIsHost;

  const allRailParticipants = useMemo((): RailParticipant[] => {
    const list: RailParticipant[] = [];
    if (railHasLocalPip) {
      list.push({ kind: 'local', key: 'local-pip' });
    }
    for (const user of railRemotes) {
      list.push({ kind: 'remote', key: user.uid, user });
    }
    return list;
  }, [railHasLocalPip, railRemotes]);

  return {
    localIsHost,
    hostRtcUid,
    localRtcUid,
    allRailParticipants,
  };
}

export function remoteUserHasVideo(user: IAgoraRTCRemoteUser): boolean {
  return Boolean(user.videoTrack);
}
