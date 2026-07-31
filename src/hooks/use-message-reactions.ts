'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import {
  aggregateMessageReactions,
  isMessageReactionEmoji,
  type MessageReactionAgg,
  type MessageReactionEmoji,
} from '@/lib/message-reactions';

type ReactionRow = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
};

export type UseMessageReactionsArgs = {
  messageIds: readonly string[];
  userId: string | null | undefined;
  enabled?: boolean;
};

export type UseMessageReactionsResult = {
  reactionsByMessageId: Record<string, MessageReactionAgg[]>;
  toggleReaction: (messageId: string, emoji: MessageReactionEmoji) => Promise<void>;
  busyKey: string | null;
};

/**
 * Batch-load + realtime sync for message reaction pills.
 * Toggle inserts or deletes the current user's row for (message, emoji).
 */
export function useMessageReactions({
  messageIds,
  userId,
  enabled = true,
}: UseMessageReactionsArgs): UseMessageReactionsResult {
  const [rows, setRows] = useState<ReactionRow[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const idsKey = useMemo(
    () => [...new Set(messageIds.filter(Boolean))].sort().join(','),
    [messageIds],
  );
  const idSetRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    idSetRef.current = new Set(idsKey ? idsKey.split(',') : []);
  }, [idsKey]);

  const refetch = useCallback(async () => {
    const ids = idsKey ? idsKey.split(',') : [];
    if (!enabled || ids.length === 0) {
      setRows([]);
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from('message_reactions')
      .select('id, message_id, user_id, emoji')
      .in('message_id', ids);
    if (error) {
      console.error('[useMessageReactions]', error.message);
      setRows([]);
      return;
    }
    setRows((data ?? []) as ReactionRow[]);
  }, [enabled, idsKey]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (!enabled || !idsKey) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`message-reactions:${idsKey.slice(0, 64)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        (payload) => {
          const next = (payload.new ?? payload.old) as Partial<ReactionRow> | null;
          const mid = next?.message_id;
          if (!mid || !idSetRef.current.has(mid)) return;
          void refetch();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, idsKey, refetch]);

  const reactionsByMessageId = useMemo(
    () => aggregateMessageReactions(rows, userId),
    [rows, userId],
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: MessageReactionEmoji) => {
      const uid = userId?.trim();
      const mid = messageId.trim();
      if (!uid || !mid || !isMessageReactionEmoji(emoji)) return;

      const key = `${mid}:${emoji}`;
      setBusyKey(key);
      const supabase = createClient();
      const mine = rows.find((r) => r.message_id === mid && r.user_id === uid && r.emoji === emoji);
      try {
        if (mine) {
          const { error } = await supabase.from('message_reactions').delete().eq('id', mine.id);
          if (error) throw error;
          setRows((prev) => prev.filter((r) => r.id !== mine.id));
        } else {
          const { data, error } = await supabase
            .from('message_reactions')
            .insert({ message_id: mid, user_id: uid, emoji })
            .select('id, message_id, user_id, emoji')
            .single();
          if (error) throw error;
          if (data) setRows((prev) => [...prev, data as ReactionRow]);
        }
      } catch (e) {
        console.error(
          '[useMessageReactions.toggle]',
          e instanceof Error ? e.message : 'Unknown error',
        );
        await refetch();
      } finally {
        setBusyKey(null);
      }
    },
    [userId, rows, refetch],
  );

  return { reactionsByMessageId, toggleReaction, busyKey };
}
