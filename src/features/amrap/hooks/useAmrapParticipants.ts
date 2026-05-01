'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import type { Database } from '@/types/database';

type AmrapParticipantRow = Database['public']['Tables']['amrap_participants']['Row'] & {
  rounds?: number;
};

function mapParticipantRow(
  row: Database['public']['Tables']['amrap_participants']['Row'] & {
    amrap_session_rounds?: { count: number }[] | null;
  },
): AmrapParticipantRow {
  const agg = row.amrap_session_rounds;
  const count = Array.isArray(agg) && agg[0] && typeof agg[0].count === 'number' ? agg[0].count : 0;
  const { amrap_session_rounds: _r, ...rest } = row;
  return { ...rest, rounds: count };
}

async function fetchParticipants(
  supabase: ReturnType<typeof createClient>,
  amrapSessionId: string,
): Promise<AmrapParticipantRow[]> {
  const { data, error } = await supabase
    .from('amrap_participants')
    .select('*, amrap_session_rounds(count)')
    .eq('amrap_session_id', amrapSessionId);

  if (error || !data) return [];
  return data.map((row) => mapParticipantRow(row));
}

export function useAmrapParticipants(
  amrapSessionId: string,
  _authUserId: string | null,
  displayName: string,
  role: 'host' | 'participant',
) {
  const supabase = useMemo(() => createClient(), []);
  const [participants, setParticipants] = useState<AmrapParticipantRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const hasJoinedRef = useRef(false);

  useEffect(() => {
    if (hasJoinedRef.current || role === 'host') return;
    if (!amrapSessionId.trim()) return;
    hasJoinedRef.current = true;
    void supabase
      .rpc('amrap_join_session', {
        p_amrap_session_id: amrapSessionId,
        p_display_name: displayName,
      })
      .then(({ error: rpcError }) => {
        if (rpcError) setError(rpcError.message);
      });
  }, [amrapSessionId, displayName, role, supabase]);

  useEffect(() => {
    let cancelled = false;

    void fetchParticipants(supabase, amrapSessionId).then((rows) => {
      if (!cancelled) setParticipants(rows);
    });

    const channel = supabase
      .channel(`amrap_participants:${amrapSessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'amrap_participants',
          filter: `amrap_session_id=eq.${amrapSessionId}`,
        },
        () => {
          void fetchParticipants(supabase, amrapSessionId).then((rows) => {
            if (!cancelled) setParticipants(rows);
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'amrap_session_rounds',
          filter: `amrap_session_id=eq.${amrapSessionId}`,
        },
        () => {
          void fetchParticipants(supabase, amrapSessionId).then((rows) => {
            if (!cancelled) setParticipants(rows);
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [amrapSessionId, supabase]);

  return { participants, error };
}
