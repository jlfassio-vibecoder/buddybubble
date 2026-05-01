'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import type { AmrapTimerPhase } from '@/features/amrap/types/amrap-engine';
import type { AmrapBlockSnapshotPayload } from '@/features/amrap/utils/buildAmrapBlockSnapshot';
import type { WorkoutExercise } from '@/lib/item-metadata';
import type { Database } from '@/types/database';

type AmrapSessionRow = Database['public']['Tables']['amrap_sessions']['Row'];

function parseAmrapBlockSnapshot(raw: unknown): AmrapBlockSnapshotPayload | null {
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

export interface AmrapTimerState {
  phase: AmrapTimerPhase;
  remainingSec: number;
  totalSec: number;
  workStartedAt: string | null;
  blockSnapshot: AmrapBlockSnapshotPayload | null;
}

export function useAmrapTimerState(amrapSessionId: string): AmrapTimerState {
  const supabase = useMemo(() => createClient(), []);
  const [sessionRow, setSessionRow] = useState<AmrapSessionRow | null>(null);
  const [remainingSec, setRemainingSec] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('amrap_sessions')
      .select('*')
      .eq('id', amrapSessionId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) return;
        if (data) setSessionRow(data);
      });
    return () => {
      cancelled = true;
    };
  }, [amrapSessionId, supabase]);

  useEffect(() => {
    const channel = supabase
      .channel(`amrap_session:${amrapSessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'amrap_sessions',
          filter: `id=eq.${amrapSessionId}`,
        },
        (payload) => {
          setSessionRow(payload.new as AmrapSessionRow);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [amrapSessionId, supabase]);

  useEffect(() => {
    if (!sessionRow || sessionRow.timer_phase !== 'work' || !sessionRow.work_started_at) {
      if (sessionRow?.timer_phase === 'finished') {
        setRemainingSec(0);
        return;
      }
      setRemainingSec(sessionRow?.duration_seconds ?? 0);
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
  }, [sessionRow]);

  const phase: AmrapTimerPhase = useMemo(() => {
    if (!sessionRow) return 'idle';
    if (sessionRow.timer_phase === 'finished') return 'finished';
    if (sessionRow.timer_phase === 'work' && sessionRow.work_started_at && remainingSec <= 0) {
      return 'finished';
    }
    return (sessionRow.timer_phase as AmrapTimerPhase) ?? 'idle';
  }, [sessionRow, remainingSec]);

  const blockSnapshot = useMemo(
    () => parseAmrapBlockSnapshot(sessionRow?.block_snapshot),
    [sessionRow?.block_snapshot],
  );

  return {
    phase,
    remainingSec,
    totalSec: sessionRow?.duration_seconds ?? 0,
    workStartedAt: sessionRow?.work_started_at ?? null,
    blockSnapshot,
  };
}
