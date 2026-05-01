'use client';
// No routing library imports in this file or any file under src/features/amrap/hooks/.
// Navigation callbacks are props; links are <a href> with computed strings.

import { useCallback, useMemo, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import { buildResultsText } from '@/features/amrap/utils/buildResultsText';
import type {
  AmrapParticipantEngine,
  AmrapSessionEngine,
} from '@/features/amrap/types/amrap-engine';
import { useAmrapParticipants } from '@/features/amrap/hooks/useAmrapParticipants';
import { useAmrapRounds } from '@/features/amrap/hooks/useAmrapRounds';
import { useAmrapTimerState } from '@/features/amrap/hooks/useAmrapTimerState';
import type { Database } from '@/types/database';

type AmrapParticipantRow = Database['public']['Tables']['amrap_participants']['Row'] & {
  rounds?: number;
};

export interface UseAmrapSessionOptions {
  amrapSessionId: string;
  /**
   * BuddyBubble live_session_id. Forwarded to slot components so cross-table
   * identity resolution (amrap_participants.user_id -> live_session_participants.agora_uid)
   * stays inside the wrapper layer, not the engine. The engine itself never reads this value.
   */
  liveSessionId: string;
  displayName: string;
  authUserId: string | null;
  role: 'host' | 'participant';
  onDismissFinishedRecap?: () => void;
  recapDismissed?: boolean;
}

export function useAmrapSession(options: UseAmrapSessionOptions): AmrapSessionEngine {
  const {
    amrapSessionId,
    liveSessionId: _liveSessionId,
    displayName,
    authUserId,
    role,
    onDismissFinishedRecap,
    recapDismissed: _recapDismissed,
  } = options;

  const supabase = useMemo(() => createClient(), []);
  const timerState = useAmrapTimerState(amrapSessionId);
  const { rows: amrapRoundRows } = useAmrapRounds(amrapSessionId);
  const { participants, error: participantsError } = useAmrapParticipants(
    amrapSessionId,
    authUserId,
    displayName,
    role,
  );

  const [showViewResultsModal, setShowViewResultsModal] = useState(false);
  const [copyResultsToast, setCopyResultsToast] = useState<'success' | 'error' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const engineParticipants: AmrapParticipantEngine[] = useMemo(
    () =>
      [...participants]
        .sort((a, b) => {
          const ar = a.rounds ?? 0;
          const br = b.rounds ?? 0;
          if (br !== ar) return br - ar;
          return a.display_name.localeCompare(b.display_name);
        })
        .map((p: AmrapParticipantRow) => ({
          id: p.id,
          name: p.display_name,
          rounds: p.rounds ?? 0,
          isHost: p.is_host,
          isSelf: p.user_id != null && p.user_id === authUserId,
          userId: p.user_id,
        })),
    [participants, authUserId],
  );

  const selfParticipant = useMemo(
    () => engineParticipants.find((p) => p.isSelf) ?? null,
    [engineParticipants],
  );

  const roundDurations = useMemo(() => {
    const started = timerState.workStartedAt;
    if (!started || !selfParticipant) return [];
    const t0 = new Date(started).getTime();
    return amrapRoundRows
      .filter((r) => r.participant_id === selfParticipant.id)
      .map((r) => Math.max(0, Math.round((new Date(r.logged_at).getTime() - t0) / 1000)));
  }, [timerState.workStartedAt, selfParticipant, amrapRoundRows]);

  const isHost = role === 'host';

  const startTimer = useCallback(async () => {
    const { error: rpcError } = await supabase.rpc('amrap_start_timer', {
      p_amrap_session_id: amrapSessionId,
    });
    if (rpcError) setError(rpcError.message);
  }, [amrapSessionId, supabase]);

  const resetTimer = useCallback(async () => {
    const { error: rpcError } = await supabase.rpc('amrap_reset_timer', {
      p_amrap_session_id: amrapSessionId,
    });
    if (rpcError) setError(rpcError.message);
  }, [amrapSessionId, supabase]);

  const logRound = useCallback(async () => {
    if (!selfParticipant) return;
    const { error: rpcError } = await supabase.rpc('amrap_log_round', {
      p_amrap_session_id: amrapSessionId,
      p_participant_id: selfParticipant.id,
    });
    if (rpcError) setError(rpcError.message);
  }, [amrapSessionId, selfParticipant, supabase]);

  const viewResultsText = useMemo(() => buildResultsText(engineParticipants), [engineParticipants]);

  const copyResults = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(viewResultsText);
      setCopyResultsToast('success');
    } catch {
      setCopyResultsToast('error');
    }
  }, [viewResultsText]);

  const pageState = useMemo(
    () => ({
      showViewResultsModal,
      handleOpenViewResults: () => setShowViewResultsModal(true),
      handleCloseViewResults: () => {
        setShowViewResultsModal(false);
        onDismissFinishedRecap?.();
      },
      viewResultsText,
      roundDurations,
      copyResults,
      copyResultsToast,
      isHost,
    }),
    [
      showViewResultsModal,
      onDismissFinishedRecap,
      viewResultsText,
      roundDurations,
      copyResults,
      copyResultsToast,
      isHost,
    ],
  );

  return {
    timerPhase: timerState.phase,
    remainingSec: timerState.remainingSec,
    totalSec: timerState.totalSec,
    workStartedAt: timerState.workStartedAt,
    blockSnapshot: timerState.blockSnapshot,
    participants: engineParticipants,
    selfParticipant,
    startTimer: isHost ? startTimer : null,
    resetTimer: isHost ? resetTimer : null,
    logRound: selfParticipant ? logRound : null,
    loading: false,
    error: error ?? participantsError,
    slots: {
      chatDrawerLeaderboard: null,
      sessionDrawer: null,
      hostNavActions: null,
    },
    pageState,
  };
}
