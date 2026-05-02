export type IntervalWrapperKind = 'none' | 'simple_countdown' | 'amrap' | 'amrap_minimal';

export type WrapperBaseProps = {
  intervalWrapperKind: IntervalWrapperKind;
  intervalWrapperConfig: unknown;
  hostParticipantId: string | null;
  videoTileExcludeUid: string | null;
  /** Agora channel id === live_sessions.id */
  liveSessionId: string;
  /** String(agoraUidFromUuid(auth user id)) for Agora tile / TimerVideoBackground identity */
  participantId: string;
  role: 'host' | 'participant';
  displayName: string;
  authUserId: string | null;
  onWrapperError?: (err: string) => void;
};
