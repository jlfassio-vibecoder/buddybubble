import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export type CopyClassDeckToLiveSessionResult = {
  ok: boolean;
  copiedCount: number;
  reason?: string;
};

/**
 * Copies drafted `live_session_deck_items` from `bb-class-deck:<classInstanceId>` into the
 * active live session via RPC (idempotent on the server).
 */
export async function copyClassDeckToLiveSession(
  supabase: SupabaseClient<Database>,
  classInstanceId: string,
  liveSessionId: string,
): Promise<CopyClassDeckToLiveSessionResult> {
  const cid = classInstanceId.trim();
  const sid = liveSessionId.trim();
  if (!cid || !sid) {
    return { ok: true, copiedCount: 0, reason: 'missing_ids' };
  }

  const { data, error } = await supabase.rpc('copy_class_deck_to_live_session', {
    p_class_instance_id: cid,
    p_live_session_id: sid,
  });

  if (error) {
    return { ok: false, copiedCount: 0, reason: error.message };
  }

  const raw = typeof data === 'number' ? data : Number(data ?? 0);
  if (raw === -1) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Live Merge] Idempotency check: Deck already exists for live session.');
    }
    return { ok: true, copiedCount: 0, reason: 'already_present' };
  }
  const copiedCount = Math.max(0, raw);
  if (copiedCount > 0) {
    if (process.env.NODE_ENV === 'development') {
      console.log(
        '[Live Merge] Successfully copied',
        copiedCount,
        'deck items to live session:',
        sid,
      );
    }
  }

  return { ok: true, copiedCount };
}

export type CopyLiveDeckToClassSessionResult = {
  ok: boolean;
  copiedCount: number;
  reason?: string;
};

/**
 * Copies live `live_session_deck_items` into `bb-class-deck:<classInstanceId>` via RPC
 * (clears then replaces draft rows; owner/admin gated on the server).
 */
export async function copyLiveDeckToClassSession(
  supabase: SupabaseClient<Database>,
  liveSessionId: string,
  classInstanceId: string,
): Promise<CopyLiveDeckToClassSessionResult> {
  const sid = liveSessionId.trim();
  const cid = classInstanceId.trim();
  if (!cid || !sid) {
    return { ok: true, copiedCount: 0, reason: 'missing_ids' };
  }

  const { data, error } = await supabase.rpc('copy_live_deck_to_class_session', {
    p_live_session_id: sid,
    p_class_instance_id: cid,
  });

  if (error) {
    return { ok: false, copiedCount: 0, reason: error.message };
  }

  const raw = typeof data === 'number' ? data : Number(data ?? 0);
  const copiedCount = Math.max(0, Number.isFinite(raw) ? raw : 0);
  if (copiedCount > 0 && process.env.NODE_ENV === 'development') {
    console.log('[Live Merge] Successfully copied', copiedCount, 'deck items to class draft:', cid);
  }

  return { ok: true, copiedCount };
}
