/**
 * Agora Cloud Recording — Notifications (NCS) webhook.
 *
 * Auth: `Agora-Signature` HMAC-SHA1 of raw body vs `AGORA_WEBHOOK_SECRET` (verify_jwt=false).
 * Requests with no signature (including Agora console health checks with a JSON body) return 200 and are not processed; real NCS events must be signed.
 *
 * If Agora health checks get HTTP 401 with a tiny JSON body (~55 bytes) and you see **no**
 * `[agora-webhook] handler_reached` log in Edge Function logs, the failure is **Supabase’s
 * platform JWT gate** (verify_jwt still true in the cloud project), not this file. Fix:
 * Dashboard → Edge Functions → `agora-recording-webhook` → turn **off** “Verify JWT” / legacy JWT;
 * or deploy from repo root: `supabase functions deploy agora-recording-webhook --no-verify-jwt`;
 * ensure `supabase/config.toml` `[functions.agora-recording-webhook] verify_jwt = false` is present
 * and upgrade CLI if deploy “succeeds” but the toggle stays on (see supabase/cli#4059).
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AGORA_WEBHOOK_SECRET.
 *
 * Event mapping (Cloud Recording productId=3):
 * - 31 / 32 (upload complete / backup): success → `ready` + `metadata.class_recording.storagePath`
 * - 1 (error): failure when errorLevel >= 4 (Major/Fatal)
 * - 11 (session_exit): failure when exitStatus === 1
 * - 31 / 32 with details.status !== 0: upload failure
 * - 4 (first M3U8): session → `uploading` (non-terminal; does not fail — see docs)
 * - 33 (upload progress): ignored (heartbeat; must not fail)
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  AGORA_CLOUD_RECORDING_PRODUCT_ID,
  extractFileNamesFromDetails,
  parseAgoraNcsEnvelope,
  pickPlaybackFileName,
} from '../_shared/agora-webhook-types.ts';
import {
  buildStoragePath,
  markSessionRecordingFailed,
  markSessionRecordingReady,
  patchInstanceClassRecordingPipelineStatus,
  UUID_PATTERN,
} from '../_shared/class-recording-reconcile.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'agora-signature, agora-signature-v2, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const aa = a.toLowerCase();
  const bb = b.toLowerCase();
  if (aa.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < aa.length; i++) {
    out |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  }
  return out === 0;
}

async function hmacSha1Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const bytes = new Uint8Array(sig);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function detailsStatus(details: Record<string, unknown>): number | null {
  const s = details.status;
  if (typeof s === 'number' && Number.isFinite(s)) return s;
  if (typeof s === 'string' && /^\d+$/.test(s)) return parseInt(s, 10);
  return null;
}

Deno.serve(async (req) => {
  // If this never appears for a failing request, the 401 is from the platform (JWT verify), not our code.
  if (req.method !== 'OPTIONS') {
    console.log('[agora-webhook] handler_reached', {
      method: req.method,
      ua: req.headers.get('user-agent')?.slice(0, 120) ?? null,
    });
  }
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 200);
  }

  const webhookSecret = Deno.env.get('AGORA_WEBHOOK_SECRET')?.trim();
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!webhookSecret) {
    console.error('[Agora Webhook] missing AGORA_WEBHOOK_SECRET');
    return json({ ok: false, error: 'server_misconfigured' }, 500);
  }
  if (!supabaseUrl || !serviceKey) {
    console.error('[Agora Webhook] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json({ ok: false, error: 'server_misconfigured' }, 500);
  }

  const rawBody = await req.text();
  const signatureHeader = req.headers.get('Agora-Signature')?.trim() ?? '';

  // Agora console health checks POST JSON (~295 bytes) without `Agora-Signature`. Real NCS events
  // from Agora include the header; we verify below. Do not process unsigned bodies as events.
  if (!signatureHeader) {
    console.log('[agora-webhook] Unsigned request received (likely Health Check).');
    return new Response(JSON.stringify({ ok: true, skipped: 'unsigned_probe' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let expectedHex: string;
  try {
    expectedHex = await hmacSha1Hex(webhookSecret, rawBody);
  } catch (e) {
    console.error('[Agora Webhook] hmac_failed', e);
    return json({ ok: false, error: 'signature_compute_failed' }, 500);
  }

  if (!timingSafeEqualHex(expectedHex, signatureHeader)) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  let parsedJson: unknown;
  try {
    parsedJson = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    console.warn('[Agora Webhook] invalid_json');
    return json({ ok: false, error: 'invalid_json' }, 200);
  }

  const envelope = parseAgoraNcsEnvelope(parsedJson);
  if (!envelope) {
    console.warn('[Agora Webhook] invalid_envelope');
    return json({ ok: false, error: 'invalid_envelope' }, 200);
  }

  if (envelope.productId !== AGORA_CLOUD_RECORDING_PRODUCT_ID) {
    console.log(
      `[Agora Webhook] Ignored productId=${envelope.productId} notice=${envelope.noticeId}`,
    );
    return json({ ok: true, skipped: 'wrong_product' }, 200);
  }

  const { sid, details } = envelope.payload;
  const eventType = envelope.eventType;

  console.log(
    `[Agora Webhook] Received SID: ${sid}, Event: ${eventType}, Notice: ${envelope.noticeId}`,
  );

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: sessionRow, error: sessionErr } = await supabase
    .from('class_recording_sessions')
    .select('id, class_instance_id, workspace_id, status')
    .eq('agora_sid', sid)
    .maybeSingle();

  if (sessionErr) {
    console.error('[Agora Webhook] session_query', sessionErr.message);
    return json({ ok: false, error: 'db_error' }, 200);
  }

  if (!sessionRow) {
    console.log(`[Agora Webhook] No session row for sid=${sid}, ignored`);
    return json({ ok: true, skipped: 'unknown_sid' }, 200);
  }

  const sessionStatus = sessionRow.status as string;
  if (sessionStatus === 'ready' || sessionStatus === 'failed') {
    console.log(`[Agora Webhook] Dedupe terminal status for SID: ${sid}, Status: ${sessionStatus}`);
    return json({ ok: true, skipped: 'already_terminal', status: sessionStatus }, 200);
  }

  const workspaceId = sessionRow.workspace_id as string;
  const classInstanceId = sessionRow.class_instance_id as string;

  const failPipeline = async (reason: string) => {
    const r = await markSessionRecordingFailed(supabase, {
      sessionRowId: sessionRow.id as string,
      classInstanceId,
      reason,
      logPrefix: '[Agora Webhook]',
      agoraSid: sid,
    });
    if (!r.ok) {
      const err = r.error === 'session_update_failed' ? 'db_error' : r.error;
      return json({ ok: false, error: err }, 200);
    }
    return json({ ok: true, status: 'failed' }, 200);
  };

  const succeedPipeline = async (storagePath: string) => {
    if (!UUID_PATTERN.test(workspaceId) || !UUID_PATTERN.test(classInstanceId)) {
      return failPipeline('invalid_workspace_or_instance_uuid_for_storage_path');
    }
    const r = await markSessionRecordingReady(supabase, {
      sessionRowId: sessionRow.id as string,
      classInstanceId,
      workspaceId,
      storagePath,
      logPrefix: '[Agora Webhook]',
      agoraSid: sid,
    });
    if (!r.ok) {
      const err = r.error === 'session_update_failed' ? 'db_error' : r.error;
      return json({ ok: false, error: err }, 200);
    }
    return json({ ok: true, status: 'ready', storagePath }, 200);
  };

  // --- Event routing ---

  if (eventType === 4) {
    const names = extractFileNamesFromDetails(details);
    const fileHint = names[0] ?? (typeof details.fileList === 'string' ? details.fileList : null);
    console.log(
      `[Agora Webhook] Event 4 (m3u8 first upload) SID=${sid} fileHint=${fileHint ?? 'none'}`,
    );
    // Conditional update — refuse to downgrade ready/failed/uploading by gating on prior status.
    const { error: upErr } = await supabase
      .from('class_recording_sessions')
      .update({ status: 'uploading' })
      .eq('id', sessionRow.id)
      .in('status', ['stopped', 'stopping', 'recording']);
    if (upErr) console.error('[Agora Webhook] uploading_state_failed', upErr.message);
    const upMeta = await patchInstanceClassRecordingPipelineStatus(supabase, {
      classInstanceId,
      status: 'uploading',
      logPrefix: '[Agora Webhook]',
    });
    if (!upMeta.ok) {
      console.error('[Agora Webhook] instance_uploading_metadata_failed', upMeta.error);
    }
    return json({ ok: true, skipped: 'event_4_uploading_hint' }, 200);
  }

  if (eventType === 33) {
    const progress = details.progress;
    console.log(
      `[Agora Webhook] Ignored event 33 progress SID=${sid} progress=${JSON.stringify(progress)}`,
    );
    return json({ ok: true, skipped: 'upload_progress' }, 200);
  }

  if (eventType === 1) {
    const errorLevel = typeof details.errorLevel === 'number' ? details.errorLevel : null;
    const errorMsg =
      typeof details.errorMsg === 'string' ? details.errorMsg : 'cloud_recording_error';
    if (errorLevel != null && errorLevel >= 4) {
      return failPipeline(`agora_error_level_${errorLevel}: ${errorMsg}`);
    }
    console.log(`[Agora Webhook] Ignored non-fatal error level=${errorLevel} SID=${sid}`);
    return json({ ok: true, skipped: 'non_fatal_error' }, 200);
  }

  if (eventType === 11) {
    const exitStatus = typeof details.exitStatus === 'number' ? details.exitStatus : null;
    if (exitStatus === 1) {
      return failPipeline('session_exit_abnormal');
    }
    const upMeta = await patchInstanceClassRecordingPipelineStatus(supabase, {
      classInstanceId,
      status: 'uploading',
      logPrefix: '[Agora Webhook]',
    });
    if (!upMeta.ok) {
      console.error('[Agora Webhook] instance_uploading_metadata_failed', upMeta.error);
    }
    return json({ ok: true, skipped: 'session_exit_normal' }, 200);
  }

  if (eventType === 31 || eventType === 32) {
    const st = detailsStatus(details);
    if (st != null && st !== 0) {
      return failPipeline(`upload_status_${st}_event_${eventType}`);
    }

    const names = extractFileNamesFromDetails(details);
    const picked = pickPlaybackFileName(names);
    if (!picked) {
      console.warn(`[Agora Webhook] No fileList entries SID=${sid} event=${eventType}`);
      return json({ ok: true, skipped: 'no_file_list' }, 200);
    }

    const storagePath = buildStoragePath(workspaceId, classInstanceId, picked);
    if (!storagePath) {
      return failPipeline('could_not_build_storage_path');
    }
    return succeedPipeline(storagePath);
  }

  console.log(`[Agora Webhook] Ignored event type=${eventType} SID=${sid}`);
  return json({ ok: true, skipped: 'ignored_event' }, 200);
});
