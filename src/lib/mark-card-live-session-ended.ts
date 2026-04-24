import type { SupabaseClient } from '@supabase/supabase-js';

import type { Json } from '@/types/database';
import {
  parseLiveSessionInviteFromMessageMetadata,
  type LiveSessionInvitePayload,
} from '@/types/live-session-invite';

/**
 * Sets `metadata.live_session.endedAt` on a task row (card-based live video).
 * Caller must ensure only the session host invokes this (e.g. match `activeSession.hostUserId`).
 */
export async function markTaskLiveSessionEnded(
  supabase: SupabaseClient,
  taskId: string,
): Promise<{ ok: boolean }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id ?? null;
  if (!uid) return { ok: false };

  const { data: row, error: selErr } = await supabase
    .from('tasks')
    .select('metadata')
    .eq('id', taskId)
    .maybeSingle();

  if (selErr || !row) {
    if (selErr) console.error('[markTaskLiveSessionEnded] select', selErr.message);
    return { ok: false };
  }

  const parsed = parseLiveSessionInviteFromMessageMetadata(row.metadata);
  if (!parsed || parsed.hostUserId !== uid) return { ok: false };

  const endedAt = new Date().toISOString();
  const nextInvite: LiveSessionInvitePayload = { ...parsed, endedAt };

  const prevMeta =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const nextMeta: Record<string, unknown> = { ...prevMeta, live_session: nextInvite };

  const { error: updErr } = await supabase
    .from('tasks')
    .update({ metadata: nextMeta as Json })
    .eq('id', taskId);

  if (updErr) {
    console.error('[markTaskLiveSessionEnded] update', updErr.message);
    return { ok: false };
  }
  return { ok: true };
}

/**
 * Sets `metadata.live_session.endedAt` on a class instance (card-based live video).
 * RLS: workspace owner/admin can update instances.
 */
export async function markClassInstanceLiveSessionEnded(
  supabase: SupabaseClient,
  instanceId: string,
): Promise<{ ok: boolean }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id ?? null;
  if (!uid) return { ok: false };

  const { data: row, error: selErr } = await supabase
    .from('class_instances')
    .select('metadata')
    .eq('id', instanceId)
    .maybeSingle();

  if (selErr || !row) {
    if (selErr) console.error('[markClassInstanceLiveSessionEnded] select', selErr.message);
    return { ok: false };
  }

  const parsed = parseLiveSessionInviteFromMessageMetadata(row.metadata);
  if (!parsed || parsed.hostUserId !== uid) return { ok: false };

  const endedAt = new Date().toISOString();
  const nextInvite: LiveSessionInvitePayload = { ...parsed, endedAt };

  const prevMeta =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const nextMeta: Record<string, unknown> = { ...prevMeta, live_session: nextInvite };

  const { error: updErr } = await supabase
    .from('class_instances')
    .update({ metadata: nextMeta as Json, updated_at: new Date().toISOString() })
    .eq('id', instanceId);

  if (updErr) {
    console.error('[markClassInstanceLiveSessionEnded] update', updErr.message);
    return { ok: false };
  }
  return { ok: true };
}
