'use client';

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { ILocalVideoTrack, IRemoteVideoTrack } from 'agora-rtc-sdk-ng';

import type { AmrapSessionEngine } from '@/features/amrap/types/amrap-engine';
import { computeAmrapLeaderboard } from '@/features/amrap/utils/computeAmrapLeaderboard';
import { useAgoraSession } from '@/features/live-video/agora-session-context';
import { useTimerBackground } from '@/features/live-video/contexts/TimerBackgroundContext';
import { agoraUidFromUuid } from '@/lib/live-video/agora-uid';

export interface TimerVideoBackgroundProps {
  engine: AmrapSessionEngine;
  /** Caller's Agora uid as a string (String(agoraUidFromUuid(authUserId))). */
  participantId: string;
  role: 'host' | 'participant';
  /** Host-only mode; participant path ignores this. */
  mode: 'self' | 'leader';
  /** Host's agora_uid from live_session_list_participants (I4). */
  hostParticipantId: string | null;
  /** Wrapper-driven uid that is currently rendered as a tile placeholder. */
  videoTileExcludeUid?: string | null;
  videoBottomOverlay?: ReactNode;
}

export default function TimerVideoBackground({
  engine,
  participantId,
  role,
  mode,
  hostParticipantId,
  videoTileExcludeUid,
  videoBottomOverlay,
}: TimerVideoBackgroundProps) {
  const { localVideoTrack, remoteUsers } = useAgoraSession();
  const { setSpotlightParticipantId } = useTimerBackground();

  const leaderParticipant = useMemo(() => {
    const groups = computeAmrapLeaderboard(engine.participants);
    return groups[0]?.participants[0] ?? null;
  }, [engine.participants]);

  const leaderId = leaderParticipant?.id ?? null;
  const leaderUserId = leaderParticipant?.userId ?? null;
  const leaderAgoraUid = leaderUserId != null ? String(agoraUidFromUuid(leaderUserId)) : null;
  const leaderIsSelf = leaderAgoraUid != null && leaderAgoraUid === participantId;

  const remoteForLeader =
    !leaderIsSelf && leaderAgoraUid != null
      ? remoteUsers.find((u) => String(u.uid) === leaderAgoraUid)
      : undefined;

  const remoteForHost =
    role === 'participant' && hostParticipantId != null
      ? remoteUsers.find((u) => String(u.uid) === String(hostParticipantId))
      : undefined;

  const clientFallback =
    role === 'participant' && remoteForHost == null
      ? remoteUsers.find((u) => String(u.uid) !== participantId)
      : undefined;

  const activeTrack: ILocalVideoTrack | IRemoteVideoTrack | null =
    role === 'participant'
      ? ((remoteForHost ?? clientFallback)?.videoTrack ?? null)
      : mode === 'self' || leaderIsSelf
        ? localVideoTrack
        : (remoteForLeader?.videoTrack ?? null);

  useEffect(() => {
    let spotlight: string | null;
    if (role === 'participant') {
      spotlight = hostParticipantId;
    } else {
      spotlight =
        mode === 'self' || leaderIsSelf || leaderAgoraUid == null ? participantId : leaderAgoraUid;
    }
    setSpotlightParticipantId(spotlight);
    return () => setSpotlightParticipantId(null);
  }, [
    role,
    mode,
    participantId,
    hostParticipantId,
    leaderId,
    leaderAgoraUid,
    leaderIsSelf,
    setSpotlightParticipantId,
  ]);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!activeTrack || !el) return;
    activeTrack.play(el, { fit: 'cover' });
    // NO track.stop() in cleanup.
    // The same ICameraVideoTrack / IRemoteVideoTrack instance is shared with the tile grid.
    // When this uid's tile is excluded, BaseVideoHarness unmounts the tile -> tile calls track.stop().
    // videoTileExcludeUid is a dep so this effect re-runs immediately after that stop(),
    // re-attaching play() to our container before the user sees a blank background.
  }, [activeTrack, videoTileExcludeUid]);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-0 aspect-video w-full overflow-hidden rounded-b-2xl"
      data-region="timer-video-background"
    >
      <div
        ref={containerRef}
        className="h-full w-full [&>video]:h-full [&>video]:w-full [&>video]:object-cover"
      />
      <div className="absolute inset-0 bg-black/50" aria-hidden />
      {videoBottomOverlay != null ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] flex max-h-[55%] flex-col justify-end">
          <div className="pointer-events-auto max-h-full overflow-y-auto rounded-b-2xl bg-gradient-to-t from-black/90 via-black/50 to-transparent px-2 pb-2 pt-8">
            {videoBottomOverlay}
          </div>
        </div>
      ) : null}
    </div>
  );
}
