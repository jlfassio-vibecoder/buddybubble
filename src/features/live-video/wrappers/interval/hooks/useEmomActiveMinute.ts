'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  deriveEmomSegmentRemainingSec,
  parseEmomMechanicsState,
  type EmomMechanicsState,
} from '@/features/live-video/wrappers/interval/mechanics/emom-mechanics-state';
import type { Database } from '@/types/database';
import { createClient } from '@utils/supabase/client';

export type EmomActiveMinuteState = {
  mechanics: EmomMechanicsState | null;
  segment: EmomMechanicsState['segment'] | null;
  minuteIndex: number;
  segmentStartedAt: string | null;
  remainingSec: number;
  intervalSeconds: number;
};

export type UseEmomActiveMinuteOptions = {
  supabase?: SupabaseClient<Database>;
  /** When false, skips fetch/subscribe/tick (e.g. parent owns mechanics state). */
  enabled?: boolean;
};

const IDLE_EMOM_ACTIVE_MINUTE: EmomActiveMinuteState = {
  mechanics: null,
  segment: null,
  minuteIndex: 0,
  segmentStartedAt: null,
  remainingSec: 0,
  intervalSeconds: 60,
};

export function useEmomActiveMinute(
  intervalSessionId: string | null | undefined,
  options: UseEmomActiveMinuteOptions = {},
): EmomActiveMinuteState {
  const { supabase: supabaseClient, enabled = true } = options;
  const sessionId = intervalSessionId?.trim() ?? '';
  const isActive = enabled && sessionId.length > 0;

  const supabase = useMemo(() => supabaseClient ?? createClient(), [supabaseClient]);
  const [mechanicsState, setMechanicsState] = useState<EmomMechanicsState | null>(null);
  const [remainingSec, setRemainingSec] = useState(0);

  const fetchRow = useCallback(async () => {
    if (!isActive) return;
    const { data } = await supabase
      .from('live_interval_sessions')
      .select('mechanics_state, interval_type')
      .eq('id', sessionId)
      .maybeSingle();
    if (data?.interval_type === 'emom') {
      setMechanicsState(parseEmomMechanicsState(data.mechanics_state));
    }
  }, [isActive, sessionId, supabase]);

  useEffect(() => {
    if (!isActive) {
      setMechanicsState(null);
      setRemainingSec(0);
      return;
    }
    void fetchRow();
  }, [fetchRow, isActive]);

  useEffect(() => {
    if (!isActive) return;
    const channel = supabase
      .channel(`emom_active_minute:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_interval_sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as Database['public']['Tables']['live_interval_sessions']['Row'];
          if (row.interval_type === 'emom') {
            setMechanicsState(parseEmomMechanicsState(row.mechanics_state));
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isActive, sessionId, supabase]);

  useEffect(() => {
    if (!isActive || !mechanicsState) {
      setRemainingSec(0);
      return;
    }
    const tick = () => {
      setRemainingSec(deriveEmomSegmentRemainingSec(mechanicsState, Date.now()));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [isActive, mechanicsState]);

  if (!isActive) {
    return IDLE_EMOM_ACTIVE_MINUTE;
  }

  return {
    mechanics: mechanicsState,
    segment: mechanicsState?.segment ?? null,
    minuteIndex: mechanicsState?.minute_index ?? 0,
    segmentStartedAt: mechanicsState?.segment_started_at ?? null,
    remainingSec,
    intervalSeconds: mechanicsState?.interval_seconds ?? 60,
  };
}
