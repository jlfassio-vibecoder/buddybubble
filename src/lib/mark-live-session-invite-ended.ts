import type { SupabaseClient } from '@supabase/supabase-js';

import type { Json } from '@/types/database';
import {
  parseLiveSessionInviteFromMessageMetadata,
  type LiveSessionInvitePayload,
} from '@/types/live-session-invite';

/**
 * Sets `metadata.live_session.endedAt` on the invite message (host-only RLS).
 * Preserves other top-level metadata keys.
 */
export async function markLiveSessionInviteMessageEnded(
  supabase: SupabaseClient,
  messageId: string,
): Promise<{ ok: boolean }> {
  const { data: row, error: selErr } = await supabase
    .from('messages')
    .select('metadata')
    .eq('id', messageId)
    .maybeSingle();

  if (selErr || !row) {
    if (selErr) console.error('[markLiveSessionInviteMessageEnded] select', selErr.message);
    return { ok: false };
  }

  const parsed = parseLiveSessionInviteFromMessageMetadata(row.metadata);
  if (!parsed) return { ok: false };

  const endedAt = new Date().toISOString();
  const nextInvite: LiveSessionInvitePayload = { ...parsed, endedAt };

  const prevMeta =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const nextMeta: Record<string, unknown> = { ...prevMeta, live_session: nextInvite };

  const { error: updErr } = await supabase
    .from('messages')
    .update({ metadata: nextMeta as Json })
    .eq('id', messageId);

  if (updErr) {
    console.error('[markLiveSessionInviteMessageEnded] update', updErr.message);
    return { ok: false };
  }
  return { ok: true };
}
