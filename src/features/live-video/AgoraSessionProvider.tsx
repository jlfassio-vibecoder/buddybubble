'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ICameraVideoTrack,
  ILocalVideoTrack,
  IMicrophoneAudioTrack,
} from 'agora-rtc-sdk-ng';
import {
  AgoraSessionContext,
  type AgoraSessionProviderProps,
} from '@/features/live-video/agora-session-context';
import {
  bindRemoteUserListeners,
  snapshotRemoteUsers,
} from '@/features/live-video/agora-remote-user-listeners';
import { loadAgoraRTC } from '@/features/live-video/load-agora';

type RtcCredentials = {
  token: string;
  appId: string;
  uid: number;
  channelId: string;
  expiresAt: number;
};

function isRtcCredentials(value: unknown): value is RtcCredentials {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.token === 'string' &&
    typeof o.appId === 'string' &&
    typeof o.uid === 'number' &&
    Number.isFinite(o.uid) &&
    typeof o.channelId === 'string' &&
    typeof o.expiresAt === 'number' &&
    Number.isFinite(o.expiresAt)
  );
}

function isPermissionLikeError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === 'NotAllowedError') return true;
  if (typeof e === 'object' && e !== null && 'code' in e) {
    const code = (e as { code?: string }).code;
    if (code === 'PERMISSION_DENIED' || code === 'NOT_READABLE') return true;
  }
  return false;
}

async function releaseClientAndTracks(
  client: IAgoraRTCClient | null,
  audio: IMicrophoneAudioTrack | null,
  video: ICameraVideoTrack | null,
  hadPublished: boolean,
): Promise<void> {
  try {
    if (client && hadPublished && audio && video) {
      await client.unpublish([audio, video]).catch(() => {});
    }
    audio?.close();
    video?.close();
    await client?.leave().catch(() => {});
  } catch (err) {
    console.error('[AgoraSessionProvider] releaseClientAndTracks', err);
  }
}

/**
 * Token-fetch retry loop tuning: absorbs the host `live_session_create` /
 * `live_session_participant_join` race window where a participant can request a
 * token milliseconds before the durable `live_sessions` row exists.
 */
const TOKEN_FETCH_MAX_ATTEMPTS = 10;
const TOKEN_FETCH_RETRY_DELAY_MS = 500;

/** Resolves after `ms` or immediately when `signal` aborts; never rejects. */
function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * RTC session: server token + Agora Web SDK (`join` / `publish` / strict `leave` cleanup).
 * Certificate never leaves the server; see POST /api/live-video/token.
 */
export function AgoraSessionProvider({
  children,
  channelId,
  workspaceId,
  sessionId,
  role = 'publisher',
}: AgoraSessionProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [localVideoTrack, setLocalVideoTrack] = useState<ILocalVideoTrack | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
  const [rtcClient, setRtcClient] = useState<IAgoraRTCClient | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  const joinSeqRef = useRef(0);
  const unbindRemoteListenersRef = useRef<(() => void) | null>(null);

  const detachRemoteListeners = useCallback(() => {
    unbindRemoteListenersRef.current?.();
    unbindRemoteListenersRef.current = null;
    setRemoteUsers([]);
  }, []);
  const abortRef = useRef<AbortController | null>(null);
  const credentialsRef = useRef<RtcCredentials | null>(null);
  const sessionRef = useRef({ isConnecting: false, isConnected: false });
  useEffect(() => {
    sessionRef.current = { isConnecting, isConnected };
  }, [isConnecting, isConnected]);

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const localVideoTrackRef = useRef<ICameraVideoTrack | null>(null);
  const hasPublishedRef = useRef(false);

  const leaveChannel = useCallback(() => {
    joinSeqRef.current += 1;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    credentialsRef.current = null;
    setJoinError(null);

    detachRemoteListeners();

    const client = clientRef.current;
    const audio = localAudioTrackRef.current;
    const video = localVideoTrackRef.current;
    const hadPublished = hasPublishedRef.current;

    clientRef.current = null;
    setRtcClient(null);
    localAudioTrackRef.current = null;
    localVideoTrackRef.current = null;
    hasPublishedRef.current = false;

    setLocalVideoTrack(null);
    setIsConnecting(false);
    setIsConnected(false);
    setIsMicMuted(false);
    setIsCameraOff(false);

    void releaseClientAndTracks(client, audio, video, hadPublished);
  }, [detachRemoteListeners]);

  const toggleMic = useCallback(() => {
    void (async () => {
      if (role !== 'publisher' || !sessionRef.current.isConnected) return;
      const track = localAudioTrackRef.current;
      if (!track) return;
      const nextEnabled = !track.enabled;
      try {
        await track.setEnabled(nextEnabled);
        setIsMicMuted(!track.enabled);
      } catch (e) {
        console.error('[AgoraSessionProvider] toggleMic', e);
      }
    })();
  }, [role]);

  const toggleCamera = useCallback(() => {
    void (async () => {
      if (role !== 'publisher' || !sessionRef.current.isConnected) return;
      const track = localVideoTrackRef.current;
      if (!track) return;
      const nextEnabled = !track.enabled;
      try {
        await track.setEnabled(nextEnabled);
        setIsCameraOff(!track.enabled);
      } catch (e) {
        console.error('[AgoraSessionProvider] toggleCamera', e);
      }
    })();
  }, [role]);

  const joinChannel = useCallback(() => {
    const { isConnecting: busy, isConnected: live } = sessionRef.current;
    if (busy || live) return;

    setJoinError(null);
    const seq = ++joinSeqRef.current;
    const ac = new AbortController();
    abortRef.current = ac;
    setIsConnecting(true);

    void (async () => {
      let client: IAgoraRTCClient | null = null;
      let audio: IMicrophoneAudioTrack | null = null;
      let video: ICameraVideoTrack | null = null;
      let published = false;

      try {
        // Retry loop: a 404 from the route means the host has not yet committed the
        // `live_sessions` row (Tier C race). 403 / other non-OK responses are explicit
        // denials and break immediately. 200 with a valid credentials payload also breaks.
        let payload: unknown = null;
        let lastErrorMsg: string | null = null;

        for (let attempt = 0; attempt < TOKEN_FETCH_MAX_ATTEMPTS; attempt++) {
          const res = await fetch('/api/live-video/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: ac.signal,
            body: JSON.stringify({
              channelId,
              role,
              ...(workspaceId !== undefined ? { workspaceId } : {}),
              ...(sessionId !== undefined ? { sessionId } : {}),
            }),
          });

          if (joinSeqRef.current !== seq || ac.signal.aborted) return;

          let body: unknown;
          try {
            body = await res.json();
          } catch {
            body = null;
          }

          if (joinSeqRef.current !== seq || ac.signal.aborted) return;

          const errorMsg =
            body &&
            typeof body === 'object' &&
            typeof (body as { error?: unknown }).error === 'string'
              ? (body as { error: string }).error
              : null;

          // 404: race with host `live_session_create` / participant `live_session_participant_join`.
          // Retry after a short backoff; do not surface as an error until we exhaust attempts.
          if (res.status === 404) {
            lastErrorMsg = errorMsg ?? 'Live session not ready';
            if (attempt + 1 >= TOKEN_FETCH_MAX_ATTEMPTS) break;
            await abortableSleep(TOKEN_FETCH_RETRY_DELAY_MS, ac.signal);
            if (joinSeqRef.current !== seq || ac.signal.aborted) return;
            continue;
          }

          // Any other non-OK status (403, 401, 400, 5xx) is an explicit decision —
          // do not retry, surface immediately.
          if (!res.ok) {
            const msg = errorMsg ?? 'Token request failed';
            console.error('[AgoraSessionProvider] token API', res.status, msg);
            setJoinError(msg);
            setIsConnecting(false);
            return;
          }

          if (!isRtcCredentials(body)) {
            console.error('[AgoraSessionProvider] invalid token response shape');
            setJoinError('Invalid token response');
            setIsConnecting(false);
            return;
          }

          payload = body;
          break;
        }

        if (!isRtcCredentials(payload)) {
          // Exhausted retries on 404 (or never produced a valid payload).
          console.error('[AgoraSessionProvider] token API exhausted retries on 404');
          setJoinError(lastErrorMsg ?? 'Live session not ready. Try again in a moment.');
          setIsConnecting(false);
          return;
        }

        if (joinSeqRef.current !== seq || ac.signal.aborted) return;

        credentialsRef.current = payload;

        const AgoraRTC = await loadAgoraRTC();
        if (joinSeqRef.current !== seq || ac.signal.aborted) return;

        const { appId, channelId: ch, token, uid } = payload;

        if (role === 'subscriber') {
          client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
          clientRef.current = client;
          setRtcClient(client);
          await client.join(appId, ch, token, uid);
          if (joinSeqRef.current !== seq || ac.signal.aborted) {
            detachRemoteListeners();
            await releaseClientAndTracks(client, null, null, false);
            clientRef.current = null;
            setRtcClient(null);
            return;
          }
          unbindRemoteListenersRef.current?.();
          unbindRemoteListenersRef.current = bindRemoteUserListeners(
            client,
            seq,
            joinSeqRef,
            setRemoteUsers,
            uid,
          );
          setRemoteUsers(() => snapshotRemoteUsers(client!, uid));
          setIsConnected(true);
          setIsConnecting(false);
          return;
        }

        try {
          const tracks = await AgoraRTC.createMicrophoneAndCameraTracks(
            {}, // default audio config
            {
              encoderConfig: '720p_2', // 1280x720, 30fps, wide-angle 16:9
            },
          );
          audio = tracks[0];
          video = tracks[1];
        } catch (e) {
          if (joinSeqRef.current !== seq) return;
          console.error('[AgoraSessionProvider] createMicrophoneAndCameraTracks', e);
          setJoinError(
            isPermissionLikeError(e)
              ? 'Camera or microphone permission denied'
              : 'Could not open camera or microphone',
          );
          setIsConnecting(false);
          return;
        }

        if (joinSeqRef.current !== seq || ac.signal.aborted) {
          detachRemoteListeners();
          await releaseClientAndTracks(null, audio, video, false);
          return;
        }

        localAudioTrackRef.current = audio;
        localVideoTrackRef.current = video;
        setLocalVideoTrack(video);

        client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        clientRef.current = client;
        setRtcClient(client);
        await client.join(appId, ch, token, uid);

        if (joinSeqRef.current !== seq || ac.signal.aborted) {
          detachRemoteListeners();
          await releaseClientAndTracks(client, audio, video, false);
          clientRef.current = null;
          setRtcClient(null);
          localAudioTrackRef.current = null;
          localVideoTrackRef.current = null;
          setLocalVideoTrack(null);
          return;
        }

        unbindRemoteListenersRef.current?.();
        unbindRemoteListenersRef.current = bindRemoteUserListeners(
          client,
          seq,
          joinSeqRef,
          setRemoteUsers,
          uid,
        );
        setRemoteUsers(() => snapshotRemoteUsers(client!, uid));

        await client.publish([audio, video]);
        published = true;
        hasPublishedRef.current = true;

        if (joinSeqRef.current !== seq || ac.signal.aborted) {
          detachRemoteListeners();
          await releaseClientAndTracks(client, audio, video, true);
          clientRef.current = null;
          setRtcClient(null);
          localAudioTrackRef.current = null;
          localVideoTrackRef.current = null;
          hasPublishedRef.current = false;
          setLocalVideoTrack(null);
          return;
        }

        setIsMicMuted(!audio.enabled);
        setIsCameraOff(!video.enabled);
        setIsConnected(true);
        setIsConnecting(false);
      } catch (e) {
        if (joinSeqRef.current !== seq) return;
        if (e instanceof DOMException && e.name === 'AbortError') return;
        console.error('[AgoraSessionProvider] joinChannel', e);
        detachRemoteListeners();
        await releaseClientAndTracks(client, audio, video, published);
        clientRef.current = null;
        setRtcClient(null);
        localAudioTrackRef.current = null;
        localVideoTrackRef.current = null;
        hasPublishedRef.current = false;
        setLocalVideoTrack(null);
        setJoinError('Connection failed');
        setIsConnecting(false);
      } finally {
        if (abortRef.current === ac) {
          abortRef.current = null;
        }
      }
    })();
  }, [channelId, workspaceId, sessionId, role, detachRemoteListeners]);

  useEffect(() => {
    return () => {
      leaveChannel();
    };
  }, [leaveChannel]);

  const value = useMemo(
    () => ({
      channelId,
      isConnected,
      isConnecting,
      joinChannel,
      leaveChannel,
      localVideoTrack,
      joinError,
      remoteUsers,
      client: rtcClient,
      role,
      isMicMuted,
      isCameraOff,
      toggleMic,
      toggleCamera,
    }),
    [
      channelId,
      isConnected,
      isConnecting,
      joinChannel,
      leaveChannel,
      localVideoTrack,
      joinError,
      remoteUsers,
      rtcClient,
      role,
      isMicMuted,
      isCameraOff,
      toggleMic,
      toggleCamera,
    ],
  );

  return <AgoraSessionContext.Provider value={value}>{children}</AgoraSessionContext.Provider>;
}

export { useAgoraSession } from '@/features/live-video/agora-session-context';
