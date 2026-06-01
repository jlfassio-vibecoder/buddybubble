import type { IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';
import type { AmrapLapEntry } from '@/features/amrap/types/amrap-engine';

export type RailParticipant =
  | { kind: 'local'; key: string }
  | { kind: 'remote'; key: string | number; user: IAgoraRTCRemoteUser };

export type GamifiedRailEntry = {
  kind: 'on-video' | 'offline';
  agoraUidStr?: string;
  amrapParticipantId: string;
  displayName: string;
  rank: number | null;
  rounds: number;
  avgLapSec: number | null;
  lapEntries: AmrapLapEntry[];
  isSelf: boolean;
  hasVideo: boolean;
};

export type OnVideoRailTile = {
  entry: GamifiedRailEntry;
  rail: RailParticipant;
};

export type GamifiedRailModel = {
  isGamified: boolean;
  onVideoTiles: OnVideoRailTile[];
  offlineEntries: GamifiedRailEntry[];
};
