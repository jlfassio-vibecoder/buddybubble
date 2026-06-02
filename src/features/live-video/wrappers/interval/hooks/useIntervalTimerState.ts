'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import {
  deriveTabataSegmentRemainingSec,
  parseTabataMechanicsState,
  tabataSegmentLabel,
  type TabataMechanicsState,
} from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import type {
  IntervalTimerPhase,
  IntervalType,
} from '@/features/live-video/wrappers/interval/types/interval-engine';
import type { AmrapBlockSnapshotPayload } from '@/features/amrap/utils/buildAmrapBlockSnapshot';
import type { WorkoutExercise } from '@/lib/item-metadata';
import type { Database, Json } from '@/types/database';

type IntervalSessionRow = Database['public']['Tables']['live_interval_sessions']['Row'];

function parseBlockSnapshot(raw: unknown): AmrapBlockSnapshotPayload | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.origin_task_id !== 'string' || typeof o.title !== 'string') return null;
  const wt = o.workout_type;
  const dm = o.duration_min;
  const ex = o.exercises;
  const exercises: WorkoutExercise[] = Array.isArray(ex) ? (ex as WorkoutExercise[]) : [];
  return {
    origin_task_id: o.origin_task_id,
    title: o.title,
    workout_type: typeof wt === 'string' ? wt : null,
    duration_min: typeof dm === 'number' && Number.isFinite(dm) ? dm : null,
    exercises,
  };
}

export interface IntervalTimerState {
  intervalType: IntervalType;
  phase: IntervalTimerPhase;
  remainingSec: number;
  totalSec: number;
  workStartedAt: string | null;
  blockSnapshot: AmrapBlockSnapshotPayload | null;
  mechanicsState: TabataMechanicsState | null;
  segmentLabel: string;
  currentRoundIndex: number;
  leaderboardSnapshotRaw: Json | null;
  resultsFinalizedAt: string | null;
}

export function useIntervalTimerState(intervalSessionId: string): IntervalTimerState {
  const supabase = useMemo(() => createClient(), []);
  const [sessionRow, setSessionRow] = useState<IntervalSessionRow | null>(null);
  const [remainingSec, setRemainingSec] = useState(0);

  const fetchSessionRow = useCallback(
    async (signal?: AbortSignal) => {
      const { data, error } = await supabase
        .from('live_interval_sessions')
        .select('*')
        .eq('id', intervalSessionId)
        .maybeSingle();
      if (signal?.aborted) return;
      if (error) return;
      if (data) setSessionRow(data);
    },
    [intervalSessionId, supabase],
  );

  useEffect(() => {
    const ac = new AbortController();
    void fetchSessionRow(ac.signal);
    return () => {
      ac.abort();
    };
  }, [fetchSessionRow]);

  useEffect(() => {
    const hadEverSubscribedRef = { current: false };
    const channel = supabase
      .channel(`live_interval_session:${intervalSessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_interval_sessions',
          filter: `id=eq.${intervalSessionId}`,
        },
        (payload) => {
          setSessionRow(payload.new as IntervalSessionRow);
        },
      )
      .subscribe((status) => {
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          return;
        }
        if (status === 'SUBSCRIBED') {
          if (hadEverSubscribedRef.current) {
            void fetchSessionRow();
          }
          hadEverSubscribedRef.current = true;
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [intervalSessionId, supabase, fetchSessionRow]);

  const intervalType: IntervalType = useMemo(() => {
    const t = sessionRow?.interval_type;
    if (t === 'tabata' || t === 'emom') return t;
    return 'amrap';
  }, [sessionRow?.interval_type]);

  const mechanicsState = useMemo(
    () => parseTabataMechanicsState(sessionRow?.mechanics_state),
    [sessionRow?.mechanics_state],
  );

  const segmentLabel = useMemo(() => {
    if (intervalType === 'tabata' && mechanicsState) {
      return tabataSegmentLabel(mechanicsState.segment, {
        isPaused: mechanicsState.is_paused,
      });
    }
    return '';
  }, [intervalType, mechanicsState]);

  const currentRoundIndex = mechanicsState?.round_index ?? 0;

  useEffect(() => {
    if (!sessionRow) return;

    if (intervalType === 'tabata' && mechanicsState) {
      const frozenRemaining = deriveTabataSegmentRemainingSec(mechanicsState, Date.now());
      setRemainingSec(frozenRemaining);
      if (mechanicsState.is_paused) {
        return;
      }
      const tick = () => {
        setRemainingSec(deriveTabataSegmentRemainingSec(mechanicsState, Date.now()));
      };
      const id = setInterval(tick, 250);
      return () => clearInterval(id);
    }

    if (sessionRow.timer_phase !== 'work' || !sessionRow.work_started_at) {
      if (sessionRow.timer_phase === 'finished') {
        setRemainingSec(0);
        return;
      }
      setRemainingSec(sessionRow.duration_seconds ?? 0);
      return;
    }

    const tick = () => {
      const elapsed =
        (Date.now() - new Date(sessionRow.work_started_at as string).getTime()) / 1000;
      const remaining = Math.max(0, sessionRow.duration_seconds - elapsed);
      setRemainingSec(Math.ceil(remaining));
    };

    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [sessionRow, intervalType, mechanicsState]);

  const totalSec = useMemo(() => {
    if (intervalType === 'tabata' && mechanicsState) {
      if (mechanicsState.segment === 'setup') return mechanicsState.setup_seconds;
      if (mechanicsState.segment === 'rest') return mechanicsState.rest_seconds;
      if (mechanicsState.segment === 'work') return mechanicsState.work_seconds;
      if (mechanicsState.segment === 'idle') return mechanicsState.setup_seconds;
      return mechanicsState.work_seconds;
    }
    return sessionRow?.duration_seconds ?? 0;
  }, [intervalType, mechanicsState, sessionRow?.duration_seconds]);

  const phase: IntervalTimerPhase = useMemo(() => {
    if (!sessionRow) return 'idle';
    if (sessionRow.timer_phase === 'finished') return 'finished';
    if (intervalType === 'tabata' && mechanicsState) {
      if (mechanicsState.segment === 'done') return 'finished';
      if (mechanicsState.segment === 'idle') return 'idle';
      if (mechanicsState.segment === 'setup' && !mechanicsState.segment_started_at) {
        return 'idle';
      }
      return 'work';
    }
    if (sessionRow.timer_phase === 'work' && sessionRow.work_started_at && remainingSec <= 0) {
      return 'finished';
    }
    return (sessionRow.timer_phase as IntervalTimerPhase) ?? 'idle';
  }, [sessionRow, intervalType, mechanicsState, remainingSec]);

  const blockSnapshot = useMemo(
    () => parseBlockSnapshot(sessionRow?.block_snapshot),
    [sessionRow?.block_snapshot],
  );

  return {
    intervalType,
    phase,
    remainingSec,
    totalSec,
    workStartedAt: sessionRow?.work_started_at ?? null,
    blockSnapshot,
    mechanicsState,
    segmentLabel,
    currentRoundIndex,
    leaderboardSnapshotRaw: sessionRow?.leaderboard_snapshot ?? null,
    resultsFinalizedAt: sessionRow?.results_finalized_at ?? null,
  };
}
