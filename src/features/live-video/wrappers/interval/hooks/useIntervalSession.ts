'use client';

import { useCallback, useMemo, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import {
  buildResultsText,
  buildResultsTextFromGroups,
} from '@/features/amrap/utils/buildResultsText';
import { computeAmrapLeaderboard } from '@/features/amrap/utils/computeAmrapLeaderboard';
import {
  parseLeaderboardSnapshot,
  serializeLeaderboardGroupsForFinalize,
} from '@/features/amrap/utils/parseLeaderboardSnapshot';
import { useLiveSessionRuntime } from '@/features/live-video/theater/live-session-runtime-context';
import { useEmomAthleteLogging } from '@/features/live-video/wrappers/interval/hooks/useEmomAthleteLogging';
import { useIntervalParticipants } from '@/features/live-video/wrappers/interval/hooks/useIntervalParticipants';
import { useIntervalRoundEvents } from '@/features/live-video/wrappers/interval/hooks/useIntervalRoundEvents';
import { useIntervalTimerState } from '@/features/live-video/wrappers/interval/hooks/useIntervalTimerState';
import { computeEmomSelfMinuteSplits } from '@/features/live-video/wrappers/interval/utils/computeEmomSelfMinuteSplits';
import {
  beginEmomSegmentTimer,
  emomMechanicsStateToJson,
} from '@/features/live-video/wrappers/interval/mechanics/emom-mechanics-state';
import {
  beginTabataSegmentTimer,
  tabataMechanicsStateToJson,
} from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import type {
  IntervalLapEntry,
  IntervalMechanicsState,
  IntervalParticipantEngine,
  IntervalSessionEngine,
  ParticipantRoundLapGroup,
} from '@/features/live-video/wrappers/interval/types/interval-engine';
import type { Database, Json } from '@/types/database';

type IntervalParticipantRow = Database['public']['Tables']['live_interval_participants']['Row'] & {
  rounds?: number;
};

function formatLapDurationMs(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type RoundEventRow = { participant_id: string; logged_at: string };

function computeLapEntriesForParticipant(
  workStartedAt: string,
  participantId: string,
  rows: RoundEventRow[],
): IntervalLapEntry[] {
  const t0 = new Date(workStartedAt).getTime();
  const mine = rows
    .filter((r) => r.participant_id === participantId)
    .map((r) => ({ t: new Date(r.logged_at).getTime() }))
    .sort((a, b) => a.t - b.t);
  const out: IntervalLapEntry[] = [];
  let prev = t0;
  for (let i = 0; i < mine.length; i++) {
    const lapMs = Math.max(0, mine[i].t - prev);
    prev = mine[i].t;
    out.push({ round: i + 1, durationLabel: formatLapDurationMs(lapMs) });
  }
  return out;
}

export interface UseIntervalSessionOptions {
  intervalSessionId?: string;
  /** @deprecated Prefer intervalSessionId */
  amrapSessionId?: string;
  liveSessionId: string;
  displayName: string;
  authUserId: string | null;
  role: 'host' | 'participant';
  onDismissFinishedRecap?: () => void;
  recapDismissed?: boolean;
}

export function useIntervalSession(options: UseIntervalSessionOptions): IntervalSessionEngine {
  const {
    intervalSessionId: intervalSessionIdProp,
    amrapSessionId,
    liveSessionId,
    displayName,
    authUserId,
    role,
    onDismissFinishedRecap,
    recapDismissed: _recapDismissed,
  } = options;

  const intervalSessionId = intervalSessionIdProp ?? amrapSessionId ?? '';

  const supabase = useMemo(() => createClient(), []);
  const { state } = useLiveSessionRuntime();
  const isHost = role === 'host';

  const emomLogging = useEmomAthleteLogging({
    supabase,
    sessionId: liveSessionId,
    userId: authUserId,
    phase: state.phase,
    isHost,
    activeDeckItemId: state.activeDeckItemId,
    enableLogRealtime: false,
  });

  const timerState = useIntervalTimerState(intervalSessionId);
  const { rows: roundEventRows } = useIntervalRoundEvents(intervalSessionId);
  const { participants, error: participantsError } = useIntervalParticipants(
    intervalSessionId,
    authUserId,
    displayName,
    role,
  );

  const [showViewResultsModal, setShowViewResultsModal] = useState(false);
  const [copyResultsToast, setCopyResultsToast] = useState<'success' | 'error' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const engineParticipants: IntervalParticipantEngine[] = useMemo(() => {
    const startedAtMs = timerState.workStartedAt
      ? new Date(timerState.workStartedAt).getTime()
      : null;
    const lastLoggedAtMsByParticipant = new Map<string, number>();
    for (const r of roundEventRows) {
      const t = new Date(r.logged_at).getTime();
      const cur = lastLoggedAtMsByParticipant.get(r.participant_id);
      if (cur == null || t > cur) lastLoggedAtMsByParticipant.set(r.participant_id, t);
    }
    return [...participants]
      .sort((a, b) => {
        const ar = a.rounds ?? 0;
        const br = b.rounds ?? 0;
        if (br !== ar) return br - ar;
        return a.display_name.localeCompare(b.display_name);
      })
      .map((p: IntervalParticipantRow) => {
        const rounds = p.rounds ?? 0;
        const lastLoggedAtMs = lastLoggedAtMsByParticipant.get(p.id) ?? null;
        const avgLapSec =
          startedAtMs != null && rounds > 0 && lastLoggedAtMs != null
            ? Math.max(0, (lastLoggedAtMs - startedAtMs) / rounds / 1000)
            : null;
        return {
          id: p.id,
          name: p.display_name,
          rounds,
          avgLapSec,
          isHost: p.is_host,
          isSelf: p.user_id != null && p.user_id === authUserId,
          userId: p.user_id,
          workoutLogTaskId: p.workout_log_task_id ?? null,
        };
      });
  }, [participants, authUserId, timerState.workStartedAt, roundEventRows]);

  const selfParticipant = useMemo(
    () => engineParticipants.find((p) => p.isSelf) ?? null,
    [engineParticipants],
  );

  const roundDurations = useMemo(() => {
    const started = timerState.workStartedAt;
    if (!started || !selfParticipant) return [];
    const t0 = new Date(started).getTime();
    return roundEventRows
      .filter((r) => r.participant_id === selfParticipant.id)
      .map((r) => Math.max(0, Math.round((new Date(r.logged_at).getTime() - t0) / 1000)));
  }, [timerState.workStartedAt, selfParticipant, roundEventRows]);

  const participantRoundLaps: ParticipantRoundLapGroup[] = useMemo(() => {
    const started = timerState.workStartedAt;
    const rows = roundEventRows as RoundEventRow[];
    if (!started) {
      return engineParticipants.map((p) => ({
        participantId: p.id,
        displayName: p.name,
        isSelf: p.isSelf,
        entries: [] as IntervalLapEntry[],
      }));
    }
    return engineParticipants.map((p) => ({
      participantId: p.id,
      displayName: p.name,
      isSelf: p.isSelf,
      entries: computeLapEntriesForParticipant(started, p.id, rows),
    }));
  }, [timerState.workStartedAt, engineParticipants, roundEventRows]);

  const roundLapEntries = useMemo(
    () => participantRoundLaps.find((x) => x.isSelf)?.entries ?? [],
    [participantRoundLaps],
  );

  const selfMinuteSplitEntries = useMemo(() => {
    if (timerState.intervalType !== 'emom') return [];
    return computeEmomSelfMinuteSplits({
      logs: emomLogging.logs,
      blocks: emomLogging.blocks,
      formatParams: emomLogging.formatParams,
    });
  }, [timerState.intervalType, emomLogging.logs, emomLogging.blocks, emomLogging.formatParams]);

  const emomRoundDurations = useMemo(
    () => selfMinuteSplitEntries.map((e) => e.activeSeconds),
    [selfMinuteSplitEntries],
  );

  const displayRoundDurations =
    timerState.intervalType === 'emom' ? emomRoundDurations : roundDurations;

  const startTimer = useCallback(async () => {
    if (timerState.intervalType === 'tabata') {
      const base = timerState.mechanicsState;
      if (!base || !('round_index' in base)) {
        setError('Tabata config missing');
        return;
      }
      const next = beginTabataSegmentTimer(base, Date.now());
      const { error: rpcError } = await supabase.rpc('interval_advance_segment', {
        p_interval_session_id: intervalSessionId,
        p_mechanics_state: tabataMechanicsStateToJson(next) as Json,
      });
      if (rpcError) setError(rpcError.message);
      return;
    }
    if (timerState.intervalType === 'emom') {
      const base = timerState.mechanicsState;
      if (!base || !('minute_index' in base)) {
        setError('EMOM config missing');
        return;
      }
      const next = beginEmomSegmentTimer(base, Date.now());
      const { error: rpcError } = await supabase.rpc('interval_advance_segment', {
        p_interval_session_id: intervalSessionId,
        p_mechanics_state: emomMechanicsStateToJson(next) as Json,
      });
      if (rpcError) setError(rpcError.message);
      return;
    }
    const { error: rpcError } = await supabase.rpc('amrap_start_timer', {
      p_amrap_session_id: intervalSessionId,
    });
    if (rpcError) setError(rpcError.message);
  }, [intervalSessionId, supabase, timerState.intervalType, timerState.mechanicsState]);

  const resetTimer = useCallback(async () => {
    const { error: rpcError } = await supabase.rpc('amrap_reset_timer', {
      p_amrap_session_id: intervalSessionId,
    });
    if (rpcError) setError(rpcError.message);
  }, [intervalSessionId, supabase]);

  const advanceSegment = useCallback(
    async (next: IntervalMechanicsState) => {
      const json =
        'minute_index' in next ? emomMechanicsStateToJson(next) : tabataMechanicsStateToJson(next);
      const { error: rpcError } = await supabase.rpc('interval_advance_segment', {
        p_interval_session_id: intervalSessionId,
        p_mechanics_state: json as Json,
      });
      if (rpcError) setError(rpcError.message);
    },
    [intervalSessionId, supabase],
  );

  const logRound = useCallback(async () => {
    if (!selfParticipant) return;
    const { error: rpcError } = await supabase.rpc('interval_log_round', {
      p_interval_session_id: intervalSessionId,
      p_participant_id: selfParticipant.id,
    });
    if (rpcError) setError(rpcError.message);
  }, [intervalSessionId, selfParticipant, supabase]);

  const frozenLeaderboard = useMemo(
    () => parseLeaderboardSnapshot(timerState.leaderboardSnapshotRaw, authUserId),
    [timerState.leaderboardSnapshotRaw, authUserId],
  );

  const finalizeSession = useCallback(async () => {
    const groups = computeAmrapLeaderboard(engineParticipants);
    const { error: rpcError } = await supabase.rpc('interval_finalize_session', {
      p_interval_session_id: intervalSessionId,
      p_snapshot: serializeLeaderboardGroupsForFinalize(groups),
    });
    if (rpcError) setError(rpcError.message);
  }, [intervalSessionId, supabase, engineParticipants]);

  const viewResultsText = useMemo(() => {
    if (frozenLeaderboard != null) {
      return buildResultsTextFromGroups(frozenLeaderboard);
    }
    return buildResultsText(engineParticipants);
  }, [frozenLeaderboard, engineParticipants]);

  const copyResults = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(viewResultsText);
      setCopyResultsToast('success');
    } catch {
      setCopyResultsToast('error');
    }
  }, [viewResultsText]);

  const savedToAnalytics = Boolean(selfParticipant?.workoutLogTaskId);

  const handleOpenViewResults = useCallback(async () => {
    if (timerState.intervalType === 'emom') {
      await emomLogging.refreshWorkoutLogs();
    }
    setShowViewResultsModal(true);
  }, [timerState.intervalType, emomLogging.refreshWorkoutLogs]);

  const pageState = useMemo(
    () => ({
      showViewResultsModal,
      handleOpenViewResults,
      handleCloseViewResults: () => {
        setShowViewResultsModal(false);
        onDismissFinishedRecap?.();
      },
      viewResultsText,
      roundDurations: displayRoundDurations,
      minuteSplitEntries: selfMinuteSplitEntries,
      copyResults,
      copyResultsToast,
      isHost,
      savedToAnalytics,
    }),
    [
      showViewResultsModal,
      handleOpenViewResults,
      onDismissFinishedRecap,
      viewResultsText,
      displayRoundDurations,
      selfMinuteSplitEntries,
      copyResults,
      copyResultsToast,
      isHost,
      savedToAnalytics,
    ],
  );

  const canFinalize =
    isHost && timerState.phase === 'finished' && timerState.resultsFinalizedAt == null;

  const isSegmented = timerState.intervalType === 'tabata' || timerState.intervalType === 'emom';

  return {
    intervalType: timerState.intervalType,
    timerPhase: timerState.phase,
    remainingSec: timerState.remainingSec,
    totalSec: timerState.totalSec,
    workStartedAt: timerState.workStartedAt,
    blockSnapshot: timerState.blockSnapshot,
    mechanicsState: timerState.mechanicsState,
    segmentLabel: timerState.segmentLabel,
    currentRoundIndex: timerState.currentRoundIndex,
    resultsFinalizedAt: timerState.resultsFinalizedAt,
    leaderboardSnapshotRaw: timerState.leaderboardSnapshotRaw,
    participants: engineParticipants,
    selfParticipant,
    startTimer: isHost ? startTimer : null,
    resetTimer: isHost ? resetTimer : null,
    advanceSegment: isHost && isSegmented ? advanceSegment : null,
    logRound: !isSegmented && selfParticipant ? logRound : null,
    finalizeSession: canFinalize ? finalizeSession : null,
    participantRoundLaps,
    roundLapEntries,
    selfMinuteSplitEntries,
    loading: false,
    error: error ?? participantsError,
    slots: {
      sessionDrawer: null,
      hostNavActions: null,
    },
    pageState,
  };
}
