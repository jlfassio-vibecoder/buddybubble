/**
 * Shared transitions for Track 1: keep `class_recording_sessions` and
 * `class_instances.metadata.class_recording` in sync (webhook + reconciler).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { agoraRecordingFolderSegment } from '@/lib/class-recording-storage';
import { mergeClassRecordingIntoInstanceMetadata } from '@/lib/class-recording-metadata';
import type { ClassRecordingPayload } from '@/types/live-session-invite';

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function truncateMessage(msg: string, max = 4000): string {
  const t = msg.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export function buildStoragePath(
  workspaceId: string,
  classInstanceId: string,
  fileName: string,
): string {
  const normalized = fileName.replace(/^\/+/g, '').trim();
  if (!normalized) return '';
  const w = agoraRecordingFolderSegment(workspaceId);
  const c = agoraRecordingFolderSegment(classInstanceId);
  const prefix = `${w}/${c}/`;
  if (normalized.startsWith(prefix)) return normalized;
  const segments = normalized.split('/').filter(Boolean);
  const base = segments[segments.length - 1] ?? normalized;
  const safe = base.replace(/[^\w.\-]+/g, '_');
  return `${w}/${c}/${safe || 'recording.bin'}`;
}

async function loadInstanceMetadata(
  supabase: SupabaseClient,
  classInstanceId: string,
): Promise<Record<string, unknown>> {
  const { data: inst, error } = await supabase
    .from('class_instances')
    .select('metadata')
    .eq('id', classInstanceId)
    .maybeSingle();
  if (error || !inst?.metadata) return {};
  const m = inst.metadata;
  if (m && typeof m === 'object' && !Array.isArray(m)) {
    return { ...(m as Record<string, unknown>) };
  }
  return {};
}

async function prevClassRecordingCreatedAt(
  supabase: SupabaseClient,
  classInstanceId: string,
): Promise<string | undefined> {
  const meta = await loadInstanceMetadata(supabase, classInstanceId);
  const cr = meta.class_recording;
  if (cr && typeof cr === 'object' && !Array.isArray(cr)) {
    const c = (cr as { createdAt?: unknown }).createdAt;
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return undefined;
}

async function persistClassRecordingMetadata(
  supabase: SupabaseClient,
  classInstanceId: string,
  recording: ClassRecordingPayload,
): Promise<boolean> {
  const meta = await loadInstanceMetadata(supabase, classInstanceId);
  const next = mergeClassRecordingIntoInstanceMetadata(meta, recording);
  const { error } = await supabase
    .from('class_instances')
    .update({
      metadata: next,
      updated_at: new Date().toISOString(),
    })
    .eq('id', classInstanceId);
  if (error) {
    console.error('[class-recording-reconcile] metadata_update_failed', error.message);
    return false;
  }
  return true;
}

export type MarkReadyParams = {
  sessionRowId: string;
  classInstanceId: string;
  workspaceId: string;
  storagePath: string;
  logPrefix?: string;
  agoraSid?: string;
};

export async function markSessionRecordingReady(
  supabase: SupabaseClient,
  params: MarkReadyParams,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { sessionRowId, classInstanceId, workspaceId, storagePath, logPrefix, agoraSid } = params;
  const prefix = logPrefix ?? '[class-recording-reconcile]';

  if (!UUID_PATTERN.test(workspaceId) || !UUID_PATTERN.test(classInstanceId)) {
    return { ok: false, error: 'invalid_workspace_or_instance_uuid_for_storage_path' };
  }

  const nowIso = new Date().toISOString();
  const createdAt = (await prevClassRecordingCreatedAt(supabase, classInstanceId)) ?? nowIso;

  const okMeta = await persistClassRecordingMetadata(supabase, classInstanceId, {
    type: 'class_recording',
    status: 'ready',
    provider: 'agora',
    storagePath,
    createdAt,
    updatedAt: nowIso,
  });

  if (!okMeta) return { ok: false, error: 'metadata_update_failed' };

  const { error: se } = await supabase
    .from('class_recording_sessions')
    .update({
      status: 'ready',
      error_message: null,
    })
    .eq('id', sessionRowId);

  if (se) {
    console.error(`${prefix} session_ready_update`, se.message);
    return { ok: false, error: 'session_update_failed' };
  }

  const sidLog = agoraSid ? ` SID: ${agoraSid}` : '';
  console.log(`${prefix} Ready transition${sidLog}, storagePath: ${storagePath}`);
  return { ok: true };
}

export type MarkFailedParams = {
  sessionRowId: string;
  classInstanceId: string;
  reason: string;
  logPrefix?: string;
  agoraSid?: string;
  /** When set, written to `class_recording_sessions.stopped_at` (optional). */
  stoppedAt?: string | null;
};

export async function markSessionRecordingFailed(
  supabase: SupabaseClient,
  params: MarkFailedParams,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { sessionRowId, classInstanceId, reason, logPrefix, agoraSid, stoppedAt } = params;
  const prefix = logPrefix ?? '[class-recording-reconcile]';
  const msg = truncateMessage(reason);

  const nowIso = new Date().toISOString();
  const createdAt = (await prevClassRecordingCreatedAt(supabase, classInstanceId)) ?? nowIso;

  const okMeta = await persistClassRecordingMetadata(supabase, classInstanceId, {
    type: 'class_recording',
    status: 'failed',
    provider: 'agora',
    createdAt,
    updatedAt: nowIso,
    errorMessage: msg,
  });

  if (!okMeta) return { ok: false, error: 'metadata_update_failed' };

  const sessionUpdate: Record<string, unknown> = {
    status: 'failed',
    error_message: msg,
  };
  if (stoppedAt !== undefined) {
    sessionUpdate.stopped_at = stoppedAt;
  }

  const { error: se } = await supabase
    .from('class_recording_sessions')
    .update(sessionUpdate)
    .eq('id', sessionRowId);

  if (se) {
    console.error(`${prefix} session_fail_update`, se.message);
    return { ok: false, error: 'session_update_failed' };
  }

  const sidLog = agoraSid ? ` SID: ${agoraSid}` : '';
  console.log(`${prefix} Failed transition${sidLog}, reason: ${msg}`);
  return { ok: true };
}
