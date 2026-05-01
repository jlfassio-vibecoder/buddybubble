import type { ReactNode } from 'react';

import type { AmrapBlockSnapshotPayload } from '@/features/amrap/utils/buildAmrapBlockSnapshot';

export type AmrapTimerPhase = 'idle' | 'setup' | 'work' | 'finished';

export interface AmrapParticipantEngine {
  id: string;
  name: string;
  rounds: number;
  isHost: boolean;
  isSelf: boolean;
  /** Supabase auth.uid for the participant; null for guests without auth.uid(). */
  userId: string | null;
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
