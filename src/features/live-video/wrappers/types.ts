export type IntervalWrapperKind = 'none' | 'simple_countdown' | 'amrap' | 'amrap_minimal';

export type WrapperBaseProps = {
  intervalWrapperKind: IntervalWrapperKind;
  intervalWrapperConfig: unknown;
  hostParticipantId: string | null;
  videoTileExcludeUid: string | null;
  /**
   * Durable session UUID; matches `public.live_sessions.id` and the broadcast `sessionId`.
   * This is NOT the Agora channel id — the channel is the opaque `bb-live-…` string passed
   * to `AgoraSessionProvider`. Wrappers should use this UUID for any DB read/write keyed
   * by session, and route Agora-side operations through `useAgoraSession()` instead.
   */
  liveSessionId: string;
  /** String(agoraUidFromUuid(auth user id)) for Agora tile / TimerVideoBackground identity */
  participantId: string;
  role: 'host' | 'participant';
  displayName: string;
  authUserId: string | null;
  onWrapperError?: (err: string) => void;
};
