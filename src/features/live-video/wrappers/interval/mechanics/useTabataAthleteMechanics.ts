'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { SessionPhase } from '@/features/live-video/state/sessionStateMachine';
import {
  deriveTabataLoggerActiveSet,
  parseTabataMechanicsState,
  type TabataLoggerActiveSetPhase,
  type TabataMechanicsState,
} from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import { parseIntervalBlockSnapshot } from '@/features/live-video/wrappers/interval/utils/tabata-block-snapshot';
import { parseIntervalSessionIdFromWrapperConfig } from '@/features/live-video/wrappers/parseWrapperConfig';
import type { Database } from '@/types/database';

export type UseTabataAthleteMechanicsOptions = {
  supabase: SupabaseClient<Database>;
  sessionId: string;
  phase: SessionPhase;
  isHost: boolean;
  enabled?: boolean;
};

export type TabataAthleteMechanicsState = {
  intervalSessionId: string;
  mechanics: TabataMechanicsState | null;
  activeSetNumber: number | null;
  activeSetPhase: TabataLoggerActiveSetPhase | null;
  activeExerciseIndex: number | null;
};

export function useTabataAthleteMechanics(
  options: UseTabataAthleteMechanicsOptions,
): TabataAthleteMechanicsState {
  const { supabase, sessionId, phase, isHost, enabled = true } = options;
  const isTabataParticipant = enabled && phase === 'tabata' && !isHost;

  const [intervalSessionId, setIntervalSessionId] = useState('');
  const [mechanicsState, setMechanicsState] = useState<TabataMechanicsState | null>(null);
  const [exerciseCount, setExerciseCount] = useState(1);

  useEffect(() => {
    if (!isTabataParticipant || !sessionId.trim()) {
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
  }, [isTabataParticipant, sessionId, supabase]);

  useEffect(() => {
    if (!isTabataParticipant || !intervalSessionId.trim()) {
      setMechanicsState(null);
      setExerciseCount(1);
      return;
    }
    let cancelled = false;
    void supabase
      .from('live_interval_sessions')
      .select('mechanics_state, interval_type, block_snapshot')
      .eq('id', intervalSessionId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data?.interval_type === 'tabata') {
          setMechanicsState(parseTabataMechanicsState(data.mechanics_state));
          const snapshot = parseIntervalBlockSnapshot(data.block_snapshot);
          setExerciseCount(snapshot?.exercises?.length || 1);
        } else {
          setMechanicsState(null);
          setExerciseCount(1);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isTabataParticipant, intervalSessionId, supabase]);

  useEffect(() => {
    if (!isTabataParticipant || !intervalSessionId.trim()) return;
    const channel = supabase
      .channel(`tabata_athlete_mechanics:${intervalSessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_interval_sessions',
          filter: `id=eq.${intervalSessionId}`,
        },
        (payload) => {
          const row = payload.new as Database['public']['Tables']['live_interval_sessions']['Row'];
          if (row.interval_type === 'tabata') {
            setMechanicsState(parseTabataMechanicsState(row.mechanics_state));
            const snapshot = parseIntervalBlockSnapshot(row.block_snapshot);
            setExerciseCount(snapshot?.exercises?.length || 1);
          } else {
            setMechanicsState(null);
            setExerciseCount(1);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isTabataParticipant, intervalSessionId, supabase]);

  const active = useMemo(
    () =>
      mechanicsState != null ? deriveTabataLoggerActiveSet(mechanicsState, exerciseCount) : null,
    [mechanicsState, exerciseCount],
  );

  return {
    intervalSessionId,
    mechanics: mechanicsState,
    activeSetNumber: active?.setNumber ?? null,
    activeSetPhase: active?.phase ?? null,
    activeExerciseIndex: active?.activeExerciseIndex ?? null,
  };
}
