'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { useWorkoutLogs } from '@/features/live-video/hooks/useWorkoutLogs';
import type { AmrapSessionEngine } from '@/features/amrap/types/amrap-engine';
import { metadataFieldsFromParsed } from '@/lib/item-metadata';
import type { WorkoutExercise } from '@/lib/item-metadata';
import type { Database } from '@/types/database';

type TaskRow = Database['public']['Tables']['tasks']['Row'];
type LogRow = Database['public']['Tables']['workout_exercise_logs']['Row'];

function parseOptionalInt(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function prescriptionNumbers(ex: WorkoutExercise): {
  weightLbs: number | null;
  reps: number | null;
  rpe: number | null;
} {
  const w = Number(ex.weight);
  const weightLbs = Number.isFinite(w) ? w : null;
  let reps: number | null = null;
  if (typeof ex.reps === 'number' && Number.isFinite(ex.reps)) {
    reps = Math.round(ex.reps);
  } else if (typeof ex.reps === 'string') {
    reps = parseOptionalInt(ex.reps);
  }
  const r = Number(ex.rpe);
  const rpe = Number.isFinite(r) ? Math.round(r) : null;
  return { weightLbs, reps, rpe };
}

async function fetchLogsForTask(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
  taskId: string,
): Promise<{ logs: LogRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('workout_exercise_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('session_id', sessionId.trim())
    .eq('task_id', taskId.trim())
    .order('exercise_name', { ascending: true })
    .order('set_number', { ascending: true });
  if (error) {
    return { logs: [], error: new Error(error.message) };
  }
  return { logs: (data ?? []) as LogRow[], error: null };
}

/**
 * When the participant's AMRAP round count increases, append one `workout_exercise_logs` row
 * per exercise (set_number = max existing + 1) copied from the latest row or prescription.
 */
export function useAmrapSetDuplication(options: {
  engine: AmrapSessionEngine;
  liveSessionId: string;
  activeTask: TaskRow | null;
  userId: string | null;
  supabase: SupabaseClient<Database>;
  isHost: boolean;
}): void {
  const { engine, liveSessionId, activeTask, userId, supabase, isHost } = options;

  const taskId = activeTask?.id ?? '';
  const enabled = Boolean(!isHost && userId && taskId.trim());

  const { refresh } = useWorkoutLogs({
    supabase,
    sessionId: liveSessionId,
    taskId,
    userId,
    enabled,
  });

  const prevRoundsRef = useRef(0);

  const exercises = useMemo(() => {
    if (!activeTask) return [];
    return metadataFieldsFromParsed(activeTask.metadata).workoutExercises;
  }, [activeTask]);

  const taskKey = activeTask?.id ?? '';

  /** New deck card: align with server round count so we do not backfill onto the new task. */
  useEffect(() => {
    prevRoundsRef.current = engine.selfParticipant?.rounds ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when the active task id changes
  }, [taskKey]);

  useEffect(() => {
    if (isHost || !userId || !enabled || exercises.length === 0) {
      /** Do not sync `prevRoundsRef` here: a brief `enabled` false (deck refetch) would jump `prev`
       *  to the current round count and cause the next increment to be missed. */
      return;
    }

    const current = engine.selfParticipant?.rounds ?? 0;
    const prev = prevRoundsRef.current;
    if (current <= prev) {
      prevRoundsRef.current = current;
      return;
    }

    const sid = liveSessionId.trim();
    const tid = taskId.trim();
    const uid = userId!;

    void (async () => {
      const delta = current - prev;
      for (let step = 0; step < delta; step++) {
        const { logs: freshLogs, error: fetchErr } = await fetchLogsForTask(
          supabase,
          uid,
          sid,
          tid,
        );
        if (fetchErr != null) {
          if (process.env.NODE_ENV === 'development') {
            console.warn(
              '[useAmrapSetDuplication] fetch logs failed; skipping duplication',
              fetchErr.message,
            );
          }
          return;
        }
        for (const ex of exercises) {
          const mine = freshLogs.filter((l) => l.exercise_name === ex.name);
          const maxSet = mine.reduce((m, l) => Math.max(m, l.set_number), 0);
          let weightLbs: number | null;
          let reps: number | null;
          let rpe: number | null;
          if (maxSet > 0) {
            const row = mine.find((l) => l.set_number === maxSet);
            weightLbs =
              row?.weight_lbs != null && Number.isFinite(Number(row.weight_lbs))
                ? Number(row.weight_lbs)
                : null;
            reps =
              row?.reps != null && Number.isFinite(Number(row.reps))
                ? Math.round(Number(row.reps))
                : null;
            rpe =
              row?.rpe != null && Number.isFinite(Number(row.rpe))
                ? Math.round(Number(row.rpe))
                : null;
          } else {
            const p = prescriptionNumbers(ex);
            weightLbs = p.weightLbs;
            reps = p.reps;
            rpe = p.rpe;
          }
          if (weightLbs == null && reps == null && rpe == null) continue;

          const row: Database['public']['Tables']['workout_exercise_logs']['Insert'] = {
            user_id: uid,
            session_id: sid,
            task_id: tid,
            exercise_name: ex.name,
            set_number: maxSet + 1,
            weight_lbs: weightLbs,
            reps,
            rpe,
          };
          const { error: upErr } = await supabase.from('workout_exercise_logs').upsert(row, {
            onConflict: 'user_id,session_id,task_id,exercise_name,set_number',
          });
          if (upErr && process.env.NODE_ENV === 'development') {
            console.warn('[useAmrapSetDuplication] upsert failed', ex.name, upErr.message);
          }
        }
      }
      prevRoundsRef.current = current;
      await refresh();
    })();
  }, [
    engine.selfParticipant?.rounds,
    enabled,
    exercises,
    isHost,
    liveSessionId,
    refresh,
    supabase,
    taskId,
    userId,
  ]);
}
