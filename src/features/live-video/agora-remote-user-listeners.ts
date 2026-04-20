import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { IAgoraRTCClient, IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';

type MediaType = Parameters<IAgoraRTCClient['subscribe']>[1];

export function snapshotRemoteUsers(
  client: IAgoraRTCClient,
  localUid: number | null,
): IAgoraRTCRemoteUser[] {
  const list = client.remoteUsers ?? [];
  const filtered = localUid == null ? list : list.filter((u) => u.uid !== localUid);
  return [...filtered];
}

/**
 * Binds Agora remote-user events. Call the returned cleanup before `client.leave()`.
 * `boundJoinSeq` must match `joinSeqRef.current` for handlers to run (stale after `leaveChannel`).
 */
export function bindRemoteUserListeners(
  client: IAgoraRTCClient,
  boundJoinSeq: number,
  joinSeqRef: MutableRefObject<number>,
  setRemoteUsers: Dispatch<SetStateAction<IAgoraRTCRemoteUser[]>>,
  localUid: number | null,
): () => void {
  const refresh = () => {
    setRemoteUsers(snapshotRemoteUsers(client, localUid));
  };

  const onUserPublished = async (user: IAgoraRTCRemoteUser, mediaType: MediaType) => {
    if (joinSeqRef.current !== boundJoinSeq) return;
    if (mediaType !== 'audio' && mediaType !== 'video') return;
    try {
      await client.subscribe(user, mediaType);
    } catch (e) {
      console.error('[AgoraSessionProvider] subscribe', e);
      return;
    }
    if (joinSeqRef.current !== boundJoinSeq) return;

    if (mediaType === 'audio') {
      user.audioTrack?.play();
    }

    refresh();
  };

  const onUserUnpublished = async (user: IAgoraRTCRemoteUser, mediaType: MediaType) => {
    if (joinSeqRef.current !== boundJoinSeq) return;
    if (mediaType !== 'audio' && mediaType !== 'video') return;
    try {
      await client.unsubscribe(user, mediaType).catch(() => {});
    } catch (e) {
      console.error('[AgoraSessionProvider] unsubscribe', e);
    }
    if (joinSeqRef.current !== boundJoinSeq) return;

    if (mediaType === 'audio') {
      user.audioTrack?.stop();
    }
    if (mediaType === 'video') {
      user.videoTrack?.stop();
    }

    refresh();
  };

  const onUserLeft = (user: IAgoraRTCRemoteUser) => {
    if (joinSeqRef.current !== boundJoinSeq) return;
    setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
  };

  client.on('user-published', onUserPublished);
  client.on('user-unpublished', onUserUnpublished);
  client.on('user-left', onUserLeft);

  return () => {
    client.off('user-published', onUserPublished);
    client.off('user-unpublished', onUserUnpublished);
    client.off('user-left', onUserLeft);
  };
}
