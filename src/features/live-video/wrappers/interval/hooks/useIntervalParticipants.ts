'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import type { Database } from '@/types/database';

type IntervalParticipantRow = Database['public']['Tables']['live_interval_participants']['Row'] & {
  rounds?: number;
};

function mapParticipantRow(
  row: Database['public']['Tables']['live_interval_participants']['Row'] & {
    interval_round_events?: { count: number }[] | null;
  },
): IntervalParticipantRow {
  const agg = row.interval_round_events;
  const count = Array.isArray(agg) && agg[0] && typeof agg[0].count === 'number' ? agg[0].count : 0;
  const { interval_round_events: _r, ...rest } = row;
  return { ...rest, rounds: count };
}

async function fetchParticipants(
  supabase: ReturnType<typeof createClient>,
  intervalSessionId: string,
): Promise<IntervalParticipantRow[]> {
  const { data, error } = await supabase
    .from('live_interval_participants')
    .select('*, interval_round_events(count)')
    .eq('interval_session_id', intervalSessionId);

  if (error || !data) return [];
  return data.map((row) => mapParticipantRow(row));
}

export function useIntervalParticipants(
  intervalSessionId: string,
  _authUserId: string | null,
  displayName: string,
  role: 'host' | 'participant',
) {
  const supabase = useMemo(() => createClient(), []);
  const [participants, setParticipants] = useState<IntervalParticipantRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const hasJoinedRef = useRef(false);

  useEffect(() => {
    if (hasJoinedRef.current || role === 'host') return;
    if (!intervalSessionId.trim()) return;
    hasJoinedRef.current = true;
    void supabase
      .rpc('amrap_join_session', {
        p_amrap_session_id: intervalSessionId,
        p_display_name: displayName,
      })
      .then(({ error: rpcError }) => {
        if (rpcError) setError(rpcError.message);
      });
  }, [intervalSessionId, displayName, role, supabase]);

  useEffect(() => {
    let cancelled = false;

    void fetchParticipants(supabase, intervalSessionId).then((rows) => {
      if (!cancelled) setParticipants(rows);
    });

    const channel = supabase
      .channel(`live_interval_participants:${intervalSessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_interval_participants',
          filter: `interval_session_id=eq.${intervalSessionId}`,
        },
        () => {
          void fetchParticipants(supabase, intervalSessionId).then((rows) => {
            if (!cancelled) setParticipants(rows);
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'interval_round_events',
          filter: `interval_session_id=eq.${intervalSessionId}`,
        },
        () => {
          void fetchParticipants(supabase, intervalSessionId).then((rows) => {
            if (!cancelled) setParticipants(rows);
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [intervalSessionId, supabase]);

  return { participants, error };
}
