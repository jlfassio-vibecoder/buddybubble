import type { SupabaseClient } from '@supabase/supabase-js';
import { formatUserFacingError } from '@/lib/format-error';
import { mergeClassRecordingIntoInstanceMetadata } from '@/lib/class-recording-metadata';
import {
  CLASS_RECORDING_MAX_FILE_BYTES,
  CLASS_RECORDINGS_BUCKET,
  buildClassRecordingObjectPath,
} from '@/lib/class-recording-storage';
import { copyLiveDeckToClassSession } from '@/features/live-video/shells/huddle/live-deck-merge';
import type { Database, Json } from '@/types/database';
import {
  parseClassRecordingFromInstanceMetadata,
  type ClassRecordingPayload,
} from '@/types/live-session-invite';

export const SOLO_STUDIO_CAPTURE_FILENAME = 'studio-capture.webm' as const;

export type UploadSoloStudioRecordingArgs = {
  supabase: SupabaseClient<Database>;
  workspaceId: string;
  classInstanceId: string;
  /** Live session UUID whose deck rows are reverse-copied into the class draft. */
  liveSessionId: string;
  blob: Blob;
  /** Override now for tests. */
  nowIso?: string;
};

export type UploadSoloStudioRecordingResult =
  | { ok: true; storagePath: string; deckCopyWarning?: string }
  | { ok: false; error: string };

async function persistInstanceMetadata(
  supabase: SupabaseClient<Database>,
  classInstanceId: string,
  nextMeta: Json,
): Promise<void> {
  const { data, error } = await supabase
    .from('class_instances')
    .update({ metadata: nextMeta })
    .eq('id', classInstanceId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) {
    throw new Error('Class instance not found or not writable.');
  }
}

/**
 * Upload a Solo Studio browser capture Blob and update `class_recording` metadata
 * (`provider: 'browser'`). Mirrors Track 2 manual upload without Agora control plane.
 */
export async function uploadSoloStudioRecording(
  args: UploadSoloStudioRecordingArgs,
): Promise<UploadSoloStudioRecordingResult> {
  const workspaceId = args.workspaceId.trim();
  const classInstanceId = args.classInstanceId.trim();
  const liveSessionId = args.liveSessionId.trim();
  if (!workspaceId || !classInstanceId) {
    return { ok: false, error: 'Missing workspace or class instance for upload.' };
  }

  if (args.blob.size <= 0) {
    return { ok: false, error: 'Recording is empty. Try recording again.' };
  }
  if (args.blob.size > CLASS_RECORDING_MAX_FILE_BYTES) {
    return {
      ok: false,
      error: 'Recording exceeds the 2GB limit. Please record a shorter session.',
    };
  }

  const storagePath = buildClassRecordingObjectPath(
    workspaceId,
    classInstanceId,
    SOLO_STUDIO_CAPTURE_FILENAME,
  );
  const now = args.nowIso ?? new Date().toISOString();
  const supabase = args.supabase;

  const { data: row, error: selErr } = await supabase
    .from('class_instances')
    .select('metadata')
    .eq('id', classInstanceId)
    .maybeSingle();

  if (selErr) {
    return { ok: false, error: formatUserFacingError(selErr) };
  }

  let meta: Json = (row?.metadata ?? {}) as Json;
  const prev = parseClassRecordingFromInstanceMetadata(meta);
  const createdAt = prev?.createdAt ?? now;

  const uploadingPayload: ClassRecordingPayload = {
    type: 'class_recording',
    status: 'uploading',
    provider: 'browser',
    storagePath,
    createdAt,
    updatedAt: now,
  };

  try {
    meta = mergeClassRecordingIntoInstanceMetadata(meta, uploadingPayload);
    await persistInstanceMetadata(supabase, classInstanceId, meta);

    const { error: upErr } = await supabase.storage
      .from(CLASS_RECORDINGS_BUCKET)
      .upload(storagePath, args.blob, {
        upsert: true,
        cacheControl: '3600',
        contentType: args.blob.type || 'video/webm',
      });

    if (upErr) {
      meta = mergeClassRecordingIntoInstanceMetadata(meta, {
        type: 'class_recording',
        status: 'failed',
        provider: 'browser',
        storagePath,
        createdAt,
        updatedAt: new Date().toISOString(),
        errorMessage: formatUserFacingError(upErr),
      });
      await persistInstanceMetadata(supabase, classInstanceId, meta);
      return { ok: false, error: formatUserFacingError(upErr) };
    }

    if (prev?.storagePath && prev.storagePath !== storagePath) {
      const { error: rmErr } = await supabase.storage
        .from(CLASS_RECORDINGS_BUCKET)
        .remove([prev.storagePath]);
      if (rmErr && process.env.NODE_ENV === 'development') {
        console.warn('[solo_studio] remove previous object', rmErr);
      }
    }

    meta = mergeClassRecordingIntoInstanceMetadata(meta, {
      type: 'class_recording',
      status: 'ready',
      provider: 'browser',
      storagePath,
      createdAt,
      updatedAt: new Date().toISOString(),
    });
    await persistInstanceMetadata(supabase, classInstanceId, meta);

    let deckCopyWarning: string | undefined;
    if (liveSessionId) {
      const merge = await copyLiveDeckToClassSession(supabase, liveSessionId, classInstanceId);
      if (!merge.ok) {
        const reason = merge.reason?.trim() || 'Could not copy workout queue to this recording.';
        console.warn('[solo_studio] copy_live_deck_to_class_session failed', reason);
        deckCopyWarning = reason;
      }
    }

    return deckCopyWarning ? { ok: true, storagePath, deckCopyWarning } : { ok: true, storagePath };
  } catch (e) {
    const msg = formatUserFacingError(e);
    try {
      meta = mergeClassRecordingIntoInstanceMetadata(meta, {
        type: 'class_recording',
        status: 'failed',
        provider: 'browser',
        storagePath,
        createdAt,
        updatedAt: new Date().toISOString(),
        errorMessage: msg,
      });
      await persistInstanceMetadata(supabase, classInstanceId, meta);
    } catch {
      /* ignore secondary failure */
    }
    return { ok: false, error: msg };
  }
}

/** Write `status: recording` before MediaRecorder starts (Solo Studio). */
export async function markSoloStudioRecordingStarted(
  supabase: SupabaseClient<Database>,
  classInstanceId: string,
  opts?: { nowIso?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = classInstanceId.trim();
  if (!id) return { ok: false, error: 'Missing class instance.' };

  const now = opts?.nowIso ?? new Date().toISOString();
  const { data: row, error: selErr } = await supabase
    .from('class_instances')
    .select('metadata')
    .eq('id', id)
    .maybeSingle();
  if (selErr) return { ok: false, error: formatUserFacingError(selErr) };

  const meta = (row?.metadata ?? {}) as Json;
  const prev = parseClassRecordingFromInstanceMetadata(meta);
  const next = mergeClassRecordingIntoInstanceMetadata(meta, {
    type: 'class_recording',
    status: 'recording',
    provider: 'browser',
    ...(prev?.storagePath ? { storagePath: prev.storagePath } : {}),
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  });

  try {
    await persistInstanceMetadata(supabase, id, next);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: formatUserFacingError(e) };
  }
}

/** Clear stuck `recording` metadata when capture aborts before a durable upload. */
export async function markSoloStudioRecordingAborted(
  supabase: SupabaseClient<Database>,
  classInstanceId: string,
  opts?: { nowIso?: string; errorMessage?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = classInstanceId.trim();
  if (!id) return { ok: false, error: 'Missing class instance.' };

  const now = opts?.nowIso ?? new Date().toISOString();
  const { data: row, error: selErr } = await supabase
    .from('class_instances')
    .select('metadata')
    .eq('id', id)
    .maybeSingle();
  if (selErr) return { ok: false, error: formatUserFacingError(selErr) };

  const meta = (row?.metadata ?? {}) as Json;
  const prev = parseClassRecordingFromInstanceMetadata(meta);
  if (!prev || prev.status !== 'recording' || prev.provider !== 'browser') {
    return { ok: true };
  }

  const next = mergeClassRecordingIntoInstanceMetadata(meta, {
    type: 'class_recording',
    status: 'failed',
    provider: 'browser',
    ...(prev.storagePath ? { storagePath: prev.storagePath } : {}),
    createdAt: prev.createdAt ?? now,
    updatedAt: now,
    errorMessage: opts?.errorMessage ?? 'Recording cancelled before upload.',
  });

  try {
    await persistInstanceMetadata(supabase, id, next);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: formatUserFacingError(e) };
  }
}
