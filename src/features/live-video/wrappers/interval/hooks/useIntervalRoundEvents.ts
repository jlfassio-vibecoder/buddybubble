'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import type { Database } from '@/types/database';

type RoundEventRow = Database['public']['Tables']['interval_round_events']['Row'];

export function useIntervalRoundEvents(intervalSessionId: string) {
  const supabase = useMemo(() => createClient(), []);
  const channelInstanceId = useMemo(() => crypto.randomUUID(), []);
  const [rows, setRows] = useState<RoundEventRow[]>([]);

  useEffect(() => {
    if (!intervalSessionId.trim()) {
      setRows([]);
      return;
    }
    let cancelled = false;

    const fetchRounds = async () => {
      const { data, error } = await supabase
        .from('interval_round_events')
        .select('id, interval_session_id, participant_id, logged_at')
        .eq('interval_session_id', intervalSessionId)
        .order('logged_at', { ascending: true });
      if (cancelled || error) return;
      setRows((data ?? []) as RoundEventRow[]);
    };

    void fetchRounds();

    const channel = supabase
      .channel(`interval_round_events:${intervalSessionId}:${channelInstanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'interval_round_events',
          filter: `interval_session_id=eq.${intervalSessionId}`,
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
  }, [intervalSessionId, supabase, channelInstanceId]);

  return { rows };
}
