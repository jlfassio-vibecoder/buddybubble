import type { ReactNode } from 'react';

import type { AmrapBlockSnapshotPayload } from '@/features/amrap/utils/buildAmrapBlockSnapshot';
import type { Json } from '@/types/database';

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
  /** Workout block metadata persisted on `amrap_sessions` (attach-time snapshot). Not shown in the chat-drawer leaderboard. */
  blockSnapshot: AmrapBlockSnapshotPayload | null;
  /** When the host locked official results (`amrap_finalize_session`). Null for legacy / unfinalized sessions. */
  resultsFinalizedAt: string | null;
  /** Raw frozen leaderboard JSON from `amrap_sessions.leaderboard_snapshot`; UI parses for display when valid. */
  leaderboardSnapshotRaw: Json | null;

  participants: AmrapParticipantEngine[];
  selfParticipant: AmrapParticipantEngine | null;

  startTimer: (() => Promise<void>) | null;
  resetTimer: (() => Promise<void>) | null;
  logRound: (() => Promise<void>) | null;
  /** Host-only: persists frozen leaderboard + server `finished` phase; null when unavailable or already finalized. */
  finalizeSession: (() => Promise<void>) | null;

  /** Lap splits for every participant (same clock: work start → first log, then between logs). */
  participantRoundLaps: ParticipantRoundLapGroup[];

  /** Convenience: `participantRoundLaps` entry for the current user only. */
  roundLapEntries: AmrapLapEntry[];

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
  };
}
