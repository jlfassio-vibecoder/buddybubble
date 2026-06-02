import type { ReactNode } from 'react';

import type { AmrapBlockSnapshotPayload } from '@/features/amrap/utils/buildAmrapBlockSnapshot';
import type { TabataMechanicsState } from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import type { Json } from '@/types/database';

export type IntervalType = 'amrap' | 'tabata' | 'emom';

export type IntervalTimerPhase = 'idle' | 'setup' | 'work' | 'finished';

export interface IntervalParticipantEngine {
  id: string;
  name: string;
  rounds: number;
  avgLapSec: number | null;
  isHost: boolean;
  isSelf: boolean;
  userId: string | null;
  workoutLogTaskId: string | null;
}

export type IntervalLapEntry = { round: number; durationLabel: string };

export interface ParticipantRoundLapGroup {
  participantId: string;
  displayName: string;
  isSelf: boolean;
  entries: IntervalLapEntry[];
}

export interface IntervalSessionEngine {
  intervalType: IntervalType;
  timerPhase: IntervalTimerPhase;
  remainingSec: number;
  totalSec: number;
  workStartedAt: string | null;
  blockSnapshot: AmrapBlockSnapshotPayload | null;
  mechanicsState: TabataMechanicsState | null;
  segmentLabel: string;
  currentRoundIndex: number;
  resultsFinalizedAt: string | null;
  leaderboardSnapshotRaw: Json | null;

  participants: IntervalParticipantEngine[];
  selfParticipant: IntervalParticipantEngine | null;

  startTimer: (() => Promise<void>) | null;
  resetTimer: (() => Promise<void>) | null;
  advanceSegment: ((next: TabataMechanicsState) => Promise<void>) | null;
  logRound: (() => Promise<void>) | null;
  finalizeSession: (() => Promise<void>) | null;

  participantRoundLaps: ParticipantRoundLapGroup[];
  roundLapEntries: IntervalLapEntry[];

  loading: boolean;
  error: string | null;

  slots: {
    sessionDrawer: ReactNode;
    hostNavActions: ReactNode;
  };

  pageState: {
    showViewResultsModal: boolean;
    handleOpenViewResults: () => void;
    handleCloseViewResults: () => void;
    viewResultsText: string;
    roundDurations: number[];
    copyResults: () => Promise<void>;
    copyResultsToast: 'success' | 'error' | null;
    isHost: boolean;
    savedToAnalytics: boolean;
  };
}

export type IntervalMechanicsContext = {
  engine: IntervalSessionEngine;
  intervalSessionId: string;
  liveSessionId: string;
  isHost: boolean;
  authUserId: string | null;
  supabase: ReturnType<typeof import('@utils/supabase/client').createClient>;
  onWrapperError?: (err: string) => void;
};
