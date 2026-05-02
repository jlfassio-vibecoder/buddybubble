import type { ReactNode } from 'react';

import type { AmrapBlockSnapshotPayload } from '@/features/amrap/utils/buildAmrapBlockSnapshot';

export type AmrapTimerPhase = 'idle' | 'setup' | 'work' | 'finished';

export interface AmrapParticipantEngine {
  id: string;
  name: string;
  rounds: number;
  /** Average lap duration in seconds (last_logged_at - workStartedAt) / rounds. Null when no rounds yet. */
  avgLapSec: number | null;
  isHost: boolean;
  isSelf: boolean;
  /** Supabase auth.uid for the participant; null for guests without auth.uid(). */
  userId: string | null;
}

export type AmrapLapEntry = { round: number; durationLabel: string };

export interface ParticipantRoundLapGroup {
  participantId: string;
  displayName: string;
  isSelf: boolean;
  entries: AmrapLapEntry[];
}

export interface AmrapSessionEngine {
  timerPhase: AmrapTimerPhase;
  remainingSec: number;
  totalSec: number;
  workStartedAt: string | null;
  blockSnapshot: AmrapBlockSnapshotPayload | null;

  participants: AmrapParticipantEngine[];
  selfParticipant: AmrapParticipantEngine | null;

  startTimer: (() => Promise<void>) | null;
  resetTimer: (() => Promise<void>) | null;
  logRound: (() => Promise<void>) | null;

  /** Lap splits for every participant (same clock: work start → first log, then between logs). */
  participantRoundLaps: ParticipantRoundLapGroup[];

  /** Convenience: `participantRoundLaps` entry for the current user only. */
  roundLapEntries: AmrapLapEntry[];

  loading: boolean;
  error: string | null;

  slots: {
    chatDrawerLeaderboard: ReactNode;
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
  };
}
