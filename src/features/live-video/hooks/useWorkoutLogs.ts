'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export type WorkoutExerciseLogRow = Database['public']['Tables']['workout_exercise_logs']['Row'];

export type UseWorkoutLogsOptions = {
  supabase: SupabaseClient<Database>;
  sessionId: string;
  taskId: string;
  userId: string | null;
  /** When false, skips network I/O. */
  enabled?: boolean;
};

export type LogSetParams = {
  exerciseName: string;
  setNumber: number;
  weightLbs: number | null;
  reps: number | null;
  rpe: number | null;
};

export type UseWorkoutLogsResult = {
  logs: WorkoutExerciseLogRow[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  logSet: (params: LogSetParams) => Promise<{ error: Error | null }>;
  saving: boolean;
};

export function useWorkoutLogs(options: UseWorkoutLogsOptions): UseWorkoutLogsResult {
  const { supabase, sessionId, taskId, userId, enabled = true } = options;
  const [logs, setLogs] = useState<WorkoutExerciseLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [saving, setSaving] = useState(false);

  const sid = sessionId.trim();
  const tid = taskId.trim();

  const fetchLogs = useCallback(async () => {
    if (!enabled || !userId || !sid || !tid) {
      setLogs([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: qErr } = await supabase
      .from('workout_exercise_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('session_id', sid)
      .eq('task_id', tid)
      .order('exercise_name', { ascending: true })
      .order('set_number', { ascending: true });

    if (qErr) {
      setError(new Error(qErr.message));
      setLogs([]);
    } else {
      setLogs((data ?? []) as WorkoutExerciseLogRow[]);
    }
    setLoading(false);
  }, [enabled, supabase, sid, tid, userId]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const logSet = useCallback(
    async (params: LogSetParams): Promise<{ error: Error | null }> => {
      if (!enabled || !userId || !sid || !tid) {
        return { error: new Error('Missing session, task, or user') };
      }

      setSaving(true);
      const row: Database['public']['Tables']['workout_exercise_logs']['Insert'] = {
        user_id: userId,
        session_id: sid,
        task_id: tid,
        exercise_name: params.exerciseName,
        set_number: params.setNumber,
        weight_lbs: params.weightLbs,
        reps: params.reps,
        rpe: params.rpe,
      };

      const { error: upErr } = await supabase.from('workout_exercise_logs').upsert(row, {
        onConflict: 'user_id,session_id,task_id,exercise_name,set_number',
      });

      setSaving(false);

      if (upErr) {
        return { error: new Error(upErr.message) };
      }
      await fetchLogs();
      return { error: null };
    },
    [enabled, supabase, sid, tid, userId, fetchLogs],
  );

  const refresh = useMemo(() => fetchLogs, [fetchLogs]);

  return { logs, loading, error, refresh, logSet, saving };
}
