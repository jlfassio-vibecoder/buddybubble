'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import {
  deriveEmomSegmentRemainingSec,
  parseEmomMechanicsState,
  type EmomMechanicsState,
} from '@/features/live-video/wrappers/interval/mechanics/emom-mechanics-state';
import type { Database } from '@/types/database';

export type EmomActiveMinuteState = {
  mechanics: EmomMechanicsState | null;
  segment: EmomMechanicsState['segment'] | null;
  minuteIndex: number;
  segmentStartedAt: string | null;
  remainingSec: number;
  intervalSeconds: number;
};

export function useEmomActiveMinute(intervalSessionId: string): EmomActiveMinuteState {
  const supabase = useMemo(() => createClient(), []);
  const [mechanicsState, setMechanicsState] = useState<EmomMechanicsState | null>(null);
  const [remainingSec, setRemainingSec] = useState(0);

  const fetchRow = useCallback(async () => {
    if (!intervalSessionId.trim()) return;
    const { data } = await supabase
      .from('live_interval_sessions')
      .select('mechanics_state, interval_type')
      .eq('id', intervalSessionId)
      .maybeSingle();
    if (data?.interval_type === 'emom') {
      setMechanicsState(parseEmomMechanicsState(data.mechanics_state));
    }
  }, [intervalSessionId, supabase]);

  useEffect(() => {
    void fetchRow();
  }, [fetchRow]);

  useEffect(() => {
    if (!intervalSessionId.trim()) return;
    const channel = supabase
      .channel(`emom_active_minute:${intervalSessionId}`)
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
          if (row.interval_type === 'emom') {
            setMechanicsState(parseEmomMechanicsState(row.mechanics_state));
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [intervalSessionId, supabase]);

  useEffect(() => {
    if (!mechanicsState) {
      setRemainingSec(0);
      return;
    }
    const tick = () => {
      setRemainingSec(deriveEmomSegmentRemainingSec(mechanicsState, Date.now()));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [mechanicsState]);

  return {
    mechanics: mechanicsState,
    segment: mechanicsState?.segment ?? null,
    minuteIndex: mechanicsState?.minute_index ?? 0,
    segmentStartedAt: mechanicsState?.segment_started_at ?? null,
    remainingSec,
    intervalSeconds: mechanicsState?.interval_seconds ?? 60,
  };
}
