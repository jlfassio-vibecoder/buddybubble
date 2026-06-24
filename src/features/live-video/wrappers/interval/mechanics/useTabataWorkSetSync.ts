'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  buildTabataWorkSetRowValues,
  shouldResetTabataWorkSetSyncRef,
  shouldSyncTabataWorkSet,
  tabataWorkSetSyncKey,
} from '@/features/live-video/wrappers/interval/mechanics/tabata-work-set-sync';
import { isTabataMechanicsState } from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import type { IntervalSessionEngine } from '@/features/live-video/wrappers/interval/types/interval-engine';
import type { Database } from '@/types/database';

type LogRow = Pick<
  Database['public']['Tables']['workout_exercise_logs']['Row'],
  'exercise_name' | 'set_number' | 'weight_lbs' | 'reps' | 'rpe'
>;

async function fetchLogsForTask(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
  taskId: string,
): Promise<{ logs: LogRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('workout_exercise_logs')
    .select('exercise_name, set_number, weight_lbs, reps, rpe')
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
 * When Tabata mechanics enter a work segment, upsert `workout_exercise_logs` rows with
 * `set_number = round_index` for each exercise in the block snapshot (participants only).
 */
export function useTabataWorkSetSync(options: {
  engine: IntervalSessionEngine;
  liveSessionId: string;
  userId: string | null;
  supabase: SupabaseClient<Database>;
  isHost: boolean;
}): void {
  const { engine, liveSessionId, userId, supabase, isHost } = options;

  const taskId = engine.blockSnapshot?.origin_task_id ?? '';
  const exercises = engine.blockSnapshot?.exercises ?? [];
  const enabled = Boolean(
    !isHost &&
    userId &&
    liveSessionId.trim() &&
    taskId.trim() &&
    engine.intervalType === 'tabata' &&
    exercises.length > 0,
  );

  const tabataState = useMemo(
    () => (isTabataMechanicsState(engine.mechanicsState) ? engine.mechanicsState : null),
    [engine.mechanicsState],
  );

  const lastSyncedKeyRef = useRef<string | null>(null);
  const syncingRef = useRef(false);
  const taskKey = taskId.trim();

  useEffect(() => {
    lastSyncedKeyRef.current = null;
  }, [taskKey]);

  useEffect(() => {
    if (!enabled || !userId || !tabataState) return;

    if (shouldResetTabataWorkSetSyncRef(tabataState)) {
      lastSyncedKeyRef.current = null;
      return;
    }

    if (!shouldSyncTabataWorkSet(tabataState)) return;

    const syncKey = tabataWorkSetSyncKey(tabataState);
    if (!syncKey || lastSyncedKeyRef.current === syncKey || syncingRef.current) return;

    const setNumber = tabataState.round_index;
    const sid = liveSessionId.trim();
    const tid = taskId.trim();
    const uid = userId;

    syncingRef.current = true;
    void (async () => {
      try {
        const { logs: freshLogs, error: fetchErr } = await fetchLogsForTask(
          supabase,
          uid,
          sid,
          tid,
        );
        if (fetchErr != null) {
          return;
        }

        let hadError = false;
        for (const ex of exercises) {
          const values = buildTabataWorkSetRowValues(ex, setNumber, freshLogs);
          if (!values) continue;

          const row: Database['public']['Tables']['workout_exercise_logs']['Insert'] = {
            user_id: uid,
            session_id: sid,
            task_id: tid,
            exercise_name: ex.name,
            set_number: setNumber,
            weight_lbs: values.weightLbs,
            reps: values.reps,
            rpe: values.rpe,
          };
          const { error: upErr } = await supabase.from('workout_exercise_logs').upsert(row, {
            onConflict: 'user_id,session_id,task_id,exercise_name,set_number',
          });
          if (upErr) {
            hadError = true;
          }
        }

        if (!hadError) {
          lastSyncedKeyRef.current = syncKey;
        }
      } finally {
        syncingRef.current = false;
      }
    })();
  }, [
    enabled,
    userId,
    tabataState,
    liveSessionId,
    taskKey,
    supabase,
    exercises,
    engine.remainingSec, // re-run while segment active so failed upserts can retry
  ]);
}
