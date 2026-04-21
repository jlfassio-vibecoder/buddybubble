'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export type LiveSessionDeckRow = Database['public']['Tables']['live_session_deck_items']['Row'] & {
  tasks: Database['public']['Tables']['tasks']['Row'] | null;
};

export type UseLiveSessionDeckOptions = {
  supabase: SupabaseClient<Database>;
  sessionId: string;
  /** When false, skips fetch and realtime (e.g. no active session). */
  enabled?: boolean;
};

export type UseLiveSessionDeckResult = {
  rows: LiveSessionDeckRow[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
};

/**
 * Loads ordered `live_session_deck_items` with nested `tasks`, and keeps in sync via Realtime
 * (`postgres_changes` filtered by `session_id`).
 */
export function useLiveSessionDeck(options: UseLiveSessionDeckOptions): UseLiveSessionDeckResult {
  const { supabase, sessionId, enabled = true } = options;
  const [rows, setRows] = useState<LiveSessionDeckRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const fetchGenerationRef = useRef(0);
  /**
   * Supabase reuses the same `RealtimeChannel` instance for identical topic names.
   * Multiple `useLiveSessionDeck` consumers (e.g. queue strip + participant logger) would
   * otherwise call `.on()` after the first instance already `subscribe()`d — Realtime throws.
   */
  const realtimeInstanceIdRef = useRef<string | null>(null);
  if (realtimeInstanceIdRef.current === null) {
    realtimeInstanceIdRef.current =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `deck-${Math.random().toString(36).slice(2, 11)}`;
  }

  const fetchDeck = useCallback(async () => {
    const sid = sessionId.trim();
    if (!sid) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }

    const gen = ++fetchGenerationRef.current;
    setLoading(true);
    setError(null);

    const { data, error: qErr } = await supabase
      .from('live_session_deck_items')
      .select('id, session_id, task_id, sort_order, created_at, updated_at, tasks(*)')
      .eq('session_id', sid)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (gen !== fetchGenerationRef.current) {
      return;
    }

    if (qErr) {
      setError(new Error(qErr.message));
      setRows([]);
    } else {
      const next = (data ?? []) as LiveSessionDeckRow[];
      console.log('[DEBUG] Participant Hook: Fetched rows', next.length);
      setRows(next);
    }
    setLoading(false);
  }, [supabase, sessionId]);

  useEffect(() => {
    if (!enabled) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }
    void fetchDeck();
  }, [enabled, fetchDeck]);

  useEffect(() => {
    if (!enabled) return;
    const sid = sessionId.trim();
    if (!sid) return;

    const channelName = `live-session-deck:${sid}:${realtimeInstanceIdRef.current}`;
    const channel = supabase.channel(channelName);

    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'live_session_deck_items',
        filter: `session_id=eq.${sid}`,
      },
      () => {
        void fetchDeck();
      },
    );

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, sessionId, supabase, fetchDeck]);

  const refresh = useMemo(() => fetchDeck, [fetchDeck]);

  return { rows, loading, error, refresh };
}
