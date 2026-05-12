'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IAgoraRTCClient } from 'agora-rtc-sdk-ng';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

import {
  ROSTER_COMMAND_EVENT,
  parseRosterCommandPayload,
} from '@/features/live-video/state/session-sync.types';
import { agoraUidFromUuid } from '@/lib/live-video/agora-uid';
import type { Database } from '@/types/database';
import { removeRealtimeBroadcastListener } from '@/features/live-video/lib/remove-realtime-broadcast-listener';

export type RosterParticipant = {
  userId: string;
  agoraUid: number;
  displayName: string;
  role: string;
  hasAudio: boolean;
  hasVideo: boolean;
};

type DbParticipantIdentity = {
  userId: string;
  agoraUid: number;
  displayName: string;
  role: string;
};

export type UseLiveSessionRosterOptions = {
  sessionId: string;
  localUserId: string;
  hostUserId: string;
  supabase: SupabaseClient<Database>;
  client: IAgoraRTCClient | null;
  channel: RealtimeChannel | null;
  localMediaState?: { hasAudio: boolean; hasVideo: boolean };
  onLocalMuteRequested?: () => void;
};

export type UseLiveSessionRosterResult = {
  participants: RosterParticipant[];
  sendRemoteMute: (targetUid: number) => void;
};

function normalizeRemoteUid(uid: string | number): number | null {
  if (typeof uid === 'number' && Number.isFinite(uid)) return uid;
  if (typeof uid === 'string') {
    const n = Number(uid);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function readLocalMediaFromClient(client: IAgoraRTCClient | null): {
  hasAudio: boolean;
  hasVideo: boolean;
} {
  if (!client) return { hasAudio: false, hasVideo: false };
  let hasAudio = false;
  let hasVideo = false;
  for (const t of client.localTracks) {
    if (t.trackMediaType === 'audio' && t.enabled && !t.muted) hasAudio = true;
    if (t.trackMediaType === 'video' && t.enabled && !t.muted) hasVideo = true;
  }
  return { hasAudio, hasVideo };
}

async function muteLocalPublishedAudio(client: IAgoraRTCClient): Promise<void> {
  for (const t of client.localTracks) {
    if (t.trackMediaType === 'audio') {
      await t.setMuted(true).catch(() => {});
    }
  }
}

/**
 * Merges `live_session_list_participants` with Agora `remoteUsers` / local `localTracks`.
 *
 * **Realtime:** Listens on the shared `room-session:` channel for `ROSTER_COMMAND`. Cleanup removes
 * the broadcast binding when the channel reference or hook unmounts (StrictMode-safe).
 *
 * **Local media:** Pass `localMediaState` from the parent (e.g. `AgoraSessionProvider` mic/camera
 * state) for reactive local `hasAudio` / `hasVideo`. Otherwise the hook samples `client.localTracks`
 * when remote-user events fire (see `mediaTick`).
 */
export function useLiveSessionRoster(
  options: UseLiveSessionRosterOptions,
): UseLiveSessionRosterResult {
  const {
    sessionId,
    localUserId,
    hostUserId,
    supabase,
    client,
    channel,
    localMediaState,
    onLocalMuteRequested,
  } = options;

  const [dbParticipants, setDbParticipants] = useState<DbParticipantIdentity[]>([]);
  const [remoteMedia, setRemoteMedia] = useState<
    Record<number, { hasAudio: boolean; hasVideo: boolean }>
  >({});
  const [mediaTick, setMediaTick] = useState(0);

  const localUid = useMemo(() => agoraUidFromUuid(localUserId), [localUserId]);

  const hostUserIdRef = useRef(hostUserId);
  const localUidRef = useRef(localUid);
  const clientRef = useRef(client);
  const onLocalMuteRef = useRef(onLocalMuteRequested);
  const sessionIdRef = useRef(sessionId);
  const rosterRefetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    hostUserIdRef.current = hostUserId;
  }, [hostUserId]);
  useEffect(() => {
    localUidRef.current = localUid;
  }, [localUid]);
  useEffect(() => {
    clientRef.current = client;
  }, [client]);
  useEffect(() => {
    onLocalMuteRef.current = onLocalMuteRequested;
  }, [onLocalMuteRequested]);

  const refetchDbParticipants = useCallback(() => {
    const sid = sessionIdRef.current;
    if (!sid.trim()) {
      setDbParticipants([]);
      return;
    }
    void supabase
      .rpc('live_session_list_participants', { p_session_id: sid })
      .then(({ data, error }) => {
        if (sid !== sessionIdRef.current) return;
        if (error || !Array.isArray(data)) {
          setDbParticipants([]);
          return;
        }
        const rows: DbParticipantIdentity[] = [];
        for (const raw of data as Array<{
          user_id: string;
          display_name: string;
          role: string;
          agora_uid: string | null;
        }>) {
          if (raw.agora_uid == null || raw.agora_uid === '') continue;
          const agoraUid = Number(raw.agora_uid);
          if (!Number.isFinite(agoraUid)) continue;
          rows.push({
            userId: raw.user_id,
            agoraUid,
            displayName: raw.display_name ?? '',
            role: raw.role ?? '',
          });
        }
        if (sid !== sessionIdRef.current) return;
        setDbParticipants(rows);
      });
  }, [supabase]);

  useEffect(() => {
    refetchDbParticipants();
  }, [sessionId, refetchDbParticipants]);

  const scheduleDebouncedRosterRefetch = useCallback(() => {
    if (rosterRefetchDebounceRef.current) clearTimeout(rosterRefetchDebounceRef.current);
    rosterRefetchDebounceRef.current = setTimeout(() => {
      rosterRefetchDebounceRef.current = null;
      refetchDbParticipants();
    }, 600);
  }, [refetchDbParticipants]);

  useEffect(() => {
    if (!client) {
      setRemoteMedia({});
      setMediaTick((t) => t + 1);
      return;
    }

    const refreshRemote = () => {
      const next: Record<number, { hasAudio: boolean; hasVideo: boolean }> = {};
      for (const u of client.remoteUsers) {
        const uidN = normalizeRemoteUid(u.uid);
        if (uidN == null) continue;
        next[uidN] = { hasAudio: Boolean(u.hasAudio), hasVideo: Boolean(u.hasVideo) };
      }
      setRemoteMedia(next);
      setMediaTick((t) => t + 1);
    };

    const onUserJoined = () => {
      refreshRemote();
      scheduleDebouncedRosterRefetch();
    };

    refreshRemote();

    client.on('user-published', refreshRemote);
    client.on('user-unpublished', refreshRemote);
    client.on('user-left', refreshRemote);
    client.on('user-joined', onUserJoined);

    return () => {
      if (rosterRefetchDebounceRef.current) {
        clearTimeout(rosterRefetchDebounceRef.current);
        rosterRefetchDebounceRef.current = null;
      }
      client.off('user-published', refreshRemote);
      client.off('user-unpublished', refreshRemote);
      client.off('user-left', refreshRemote);
      client.off('user-joined', onUserJoined);
    };
  }, [client, scheduleDebouncedRosterRefetch]);

  const participants = useMemo((): RosterParticipant[] => {
    const localLive =
      localMediaState ??
      (client ? readLocalMediaFromClient(client) : { hasAudio: false, hasVideo: false });
    void mediaTick;
    return dbParticipants.map((row) => {
      const media =
        row.agoraUid === localUid
          ? localLive
          : (remoteMedia[row.agoraUid] ?? { hasAudio: false, hasVideo: false });
      return {
        userId: row.userId,
        agoraUid: row.agoraUid,
        displayName: row.displayName,
        role: row.role,
        hasAudio: media.hasAudio,
        hasVideo: media.hasVideo,
      };
    });
  }, [dbParticipants, remoteMedia, localMediaState, client, localUid, mediaTick]);

  useEffect(() => {
    if (!channel) return;

    let alive = true;

    const handleRosterCommand = (message: { payload: unknown }) => {
      if (!alive) return;
      const parsed = parseRosterCommandPayload(message.payload);
      if (!parsed) return;
      if (parsed.senderId !== hostUserIdRef.current) return;
      if (parsed.type !== 'REMOTE_MUTE') return;
      if (parsed.targetUid !== localUidRef.current) return;
      const cb = onLocalMuteRef.current;
      if (cb) {
        cb();
        return;
      }
      const rtc = clientRef.current;
      if (rtc) {
        void muteLocalPublishedAudio(rtc);
      }
    };

    channel.on('broadcast', { event: ROSTER_COMMAND_EVENT }, handleRosterCommand);
    return () => {
      alive = false;
      removeRealtimeBroadcastListener(channel, ROSTER_COMMAND_EVENT, handleRosterCommand);
    };
  }, [channel]);

  const sendRemoteMute = useCallback(
    (targetUid: number) => {
      if (!channel) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[useLiveSessionRoster] sendRemoteMute: no Realtime channel');
        }
        return;
      }
      if (localUserId !== hostUserId) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[useLiveSessionRoster] sendRemoteMute: only host may send');
        }
        return;
      }
      void channel.send({
        type: 'broadcast',
        event: ROSTER_COMMAND_EVENT,
        payload: { type: 'REMOTE_MUTE', targetUid, senderId: localUserId },
      });
    },
    [channel, localUserId, hostUserId],
  );

  return { participants, sendRemoteMute };
}
