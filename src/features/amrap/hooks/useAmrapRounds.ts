'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import type { Database } from '@/types/database';

type RoundRow = Database['public']['Tables']['amrap_session_rounds']['Row'];

export function useAmrapRounds(amrapSessionId: string) {
  const supabase = useMemo(() => createClient(), []);
  /** Unique per hook instance so multiple subscribers (e.g. session + results drawer) do not reuse one channel. */
  const channelInstanceId = useMemo(() => crypto.randomUUID(), []);
  const [rows, setRows] = useState<RoundRow[]>([]);

  useEffect(() => {
    if (!amrapSessionId.trim()) {
      setRows([]);
      return;
    }
    let cancelled = false;

    const fetchRounds = async () => {
      const { data, error } = await supabase
        .from('amrap_session_rounds')
        .select('id, amrap_session_id, participant_id, logged_at')
        .eq('amrap_session_id', amrapSessionId)
        .order('logged_at', { ascending: true });
      if (cancelled || error) return;
      setRows((data ?? []) as RoundRow[]);
    };

    void fetchRounds();

    const channel = supabase
      .channel(`amrap_session_rounds:${amrapSessionId}:${channelInstanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'amrap_session_rounds',
          filter: `amrap_session_id=eq.${amrapSessionId}`,
        },
        () => {
          void fetchRounds();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [amrapSessionId, supabase, channelInstanceId]);

  return { rows };
}
