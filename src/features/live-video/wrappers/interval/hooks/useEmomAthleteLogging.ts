'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { useLiveSessionDeck } from '@/features/live-video/hooks/useLiveSessionDeck';
import { useWorkoutLogs } from '@/features/live-video/hooks/useWorkoutLogs';
import { useWorkoutDeckSelectionOptional } from '@/features/live-video/shells/huddle/workout-deck-selection-context';
import type { SessionPhase } from '@/features/live-video/state/sessionStateMachine';
import { parseIntervalSessionIdFromWrapperConfig } from '@/features/live-video/wrappers/parseWrapperConfig';
import { resolveEmomAthleteTaskId } from '@/features/live-video/wrappers/interval/utils/resolveEmomAthleteTaskId';
import {
  blockContextForGlobalIndex,
  buildPlayerExerciseIndexLookup,
} from '@/lib/workout-factory/workout-player-exercise-index';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import type { Database } from '@/types/database';

export type EmomFlatExerciseTarget = {
  name: string;
  globalIndex: number;
  exerciseIndexInBlock: number;
};

export type UseEmomAthleteLoggingOptions = {
  supabase: SupabaseClient<Database>;
  sessionId: string;
  userId: string | null;
  phase: SessionPhase;
  isHost: boolean;
  activeDeckItemId: string | null;
  /**
   * Subscribe to `workout_exercise_logs` postgres_changes. Default true.
   * Disable when another component already owns the subscription (e.g. interval engine).
   */
  enableLogRealtime?: boolean;
  /** When false, skips EMOM deck/log work (e.g. AMRAP/Tabata interval sessions). */
  enabled?: boolean;
};

function removeWorkoutLogRealtimeChannel(
  supabase: SupabaseClient<Database>,
  channelKey: string,
): void {
  const topic = `realtime:${channelKey}`;
  for (const ch of supabase.getChannels()) {
    if (ch.topic === topic) {
      void supabase.removeChannel(ch);
    }
  }
}

export function useEmomAthleteLogging(options: UseEmomAthleteLoggingOptions) {
  const {
    supabase,
    sessionId,
    userId,
    phase,
    isHost,
    activeDeckItemId,
    enableLogRealtime = true,
    enabled = true,
  } = options;
  const isEmomPhase = enabled && phase === 'emom';

  const [intervalSessionId, setIntervalSessionId] = useState('');

  useEffect(() => {
    if (!isEmomPhase || !sessionId.trim()) {
      setIntervalSessionId('');
      return;
    }
    let cancelled = false;
    void supabase
      .from('live_sessions')
      .select('interval_wrapper_config')
      .eq('id', sessionId.trim())
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const id = parseIntervalSessionIdFromWrapperConfig(data?.interval_wrapper_config);
        setIntervalSessionId(id ?? '');
      });
    return () => {
      cancelled = true;
    };
  }, [isEmomPhase, sessionId, supabase]);

  const deckSel = useWorkoutDeckSelectionOptional();
  const hostSnapshotTaskId = useMemo(() => {
    if (!isHost || !deckSel?.activeSnapshotId) return null;
    const snap = deckSel.deck.find((s) => s.snapshotId === deckSel.activeSnapshotId);
    return snap?.task.id ?? null;
  }, [isHost, deckSel?.activeSnapshotId, deckSel?.deck]);

  const sessionDeck = useLiveSessionDeck({
    supabase,
    sessionId,
    enabled: Boolean(sessionId.trim()) && isEmomPhase,
  });

  const taskId = useMemo(
    () =>
      resolveEmomAthleteTaskId({
        isHost,
        activeDeckItemId,
        hostSnapshotTaskId,
        deckRows: sessionDeck.rows,
      }),
    [isHost, activeDeckItemId, hostSnapshotTaskId, sessionDeck.rows],
  );

  const activeTask = useMemo(() => {
    const sessionRow = activeDeckItemId
      ? sessionDeck.rows.find((r) => r.id === activeDeckItemId)
      : null;
    if (sessionRow?.tasks) return sessionRow.tasks;
    if (isHost && deckSel?.activeSnapshotId) {
      const snap = deckSel.deck.find((s) => s.snapshotId === deckSel.activeSnapshotId);
      return snap?.task ?? null;
    }
    return null;
  }, [activeDeckItemId, sessionDeck.rows, isHost, deckSel?.activeSnapshotId, deckSel?.deck]);

  const loggingEnabled = Boolean(
    isEmomPhase && userId && taskId && sessionId.trim() && intervalSessionId.trim(),
  );

  const {
    logs,
    loading: logsLoading,
    error: logsError,
    logSet,
    saving,
    refresh: refreshWorkoutLogs,
  } = useWorkoutLogs({
    supabase,
    sessionId,
    taskId,
    userId,
    enabled: loggingEnabled,
  });

  useEffect(() => {
    if (!loggingEnabled || !userId || !taskId || !sessionId.trim()) return;

    void refreshWorkoutLogs();

    if (!enableLogRealtime) return;

    const sid = sessionId.trim();
    const channelKey = `workout_exercise_logs_emom:${sid}:${taskId}:${userId}`;
    const logChangeHandler = () => {
      void refreshWorkoutLogs();
    };

    removeWorkoutLogRealtimeChannel(supabase, channelKey);

    const channel = supabase
      .channel(channelKey)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'workout_exercise_logs',
          filter: `session_id=eq.${sid}`,
        },
        logChangeHandler,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'workout_exercise_logs',
          filter: `session_id=eq.${sid}`,
        },
        logChangeHandler,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loggingEnabled, enableLogRealtime, userId, taskId, sessionId, supabase, refreshWorkoutLogs]);

  const sessionVm = useMemo(
    () => (activeTask ? buildWorkoutSessionViewModel(activeTask.metadata) : null),
    [activeTask],
  );

  const blocks: WorkoutSessionBlockView[] = sessionVm?.blocks ?? [];
  const emomBlock = blocks.find((b) => b.blockFormat?.trim().toLowerCase() === 'emom');
  const formatParams = emomBlock?.formatParams ?? {};

  const flatExerciseNames: EmomFlatExerciseTarget[] = useMemo(() => {
    if (!sessionVm) return [];
    const lookup = buildPlayerExerciseIndexLookup(sessionVm.blocks);
    return sessionVm.flatExercises.flatMap((ex, globalIndex) => {
      const ctx = blockContextForGlobalIndex(globalIndex, sessionVm.blocks, lookup);
      if (ctx?.blockFormat?.trim().toLowerCase() !== 'emom') return [];
      return [
        {
          name: ex.name,
          globalIndex,
          exerciseIndexInBlock: ctx.exerciseIndexInBlock,
        },
      ];
    });
  }, [sessionVm]);

  const logFor = useCallback(
    (exerciseName: string, setNumber: number) =>
      logs.find((l) => l.exercise_name === exerciseName && l.set_number === setNumber) ?? null,
    [logs],
  );

  const getExistingLog = useCallback(
    (exerciseName: string, setNumber: number) => {
      const row = logFor(exerciseName, setNumber);
      if (!row) return null;
      return {
        weight_lbs: row.weight_lbs,
        reps: row.reps,
        rpe: row.rpe,
      };
    },
    [logFor],
  );

  const ready = Boolean(loggingEnabled && activeTask);

  return {
    intervalSessionId,
    taskId,
    activeTask,
    sessionVm,
    blocks,
    formatParams,
    flatExerciseNames,
    logs,
    logsLoading,
    logsError,
    logSet,
    saving,
    refreshWorkoutLogs,
    logFor,
    getExistingLog,
    ready,
    loggingEnabled,
  };
}
