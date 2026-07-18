/**
 * POST /api/webhooks/agora-recording
 *
 * Agora Cloud Recording NCS (Notification Center Service) webhook — same behavior as
 * `supabase/functions/agora-recording-webhook`, hosted on Next.js to avoid Supabase Edge
 * platform auth rewriting unsigned health probes.
 *
 * Configure in Agora Console (Cloud Recording → Notifications):
 *   https://<your-production-domain>/api/webhooks/agora-recording
 *
 * Env: webhook secret (HMAC-SHA1 hex of raw body) via `resolveAgoraWebhookSecret()`
 * (`AGORA_ACTIVE_ENV=SECONDARY` → `AGORA_WEBHOOK_SECRET_SECONDARY` only; otherwise
 * `AGORA_WEBHOOK_SECRET` / `AGORA_WEBHOOK_SECRET_PRIMARY`). Uses `createServiceRoleClient()`:
 * `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { resolveAgoraWebhookSecret } from '@/lib/agora/credentials';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import {
  AGORA_CLOUD_RECORDING_PRODUCT_ID,
  extractFileNamesFromDetails,
  parseAgoraNcsEnvelope,
  pickPlaybackFileName,
} from '@/lib/agora/webhook-types';
import {
  buildStoragePath,
  markSessionRecordingFailed,
  markSessionRecordingReady,
  patchInstanceClassRecordingPipelineStatus,
  UUID_PATTERN,
} from '@/lib/agora/recording-reconcile';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'agora-signature, agora-signature-v2, content-type',
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: corsHeaders });
}

function verifyAgoraSignatureHex(
  secret: string,
  rawBody: string,
  signatureHeader: string,
): boolean {
  const expectedHex = createHmac('sha1', secret).update(rawBody, 'utf8').digest('hex');
  const sig = signatureHeader.trim().toLowerCase().replace(/\s+/g, '');
  if (!/^[0-9a-f]+$/.test(sig) || sig.length % 2 !== 0) return false;
  try {
    const a = Buffer.from(expectedHex, 'hex');
    const b = Buffer.from(sig, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function detailsStatus(details: Record<string, unknown>): number | null {
  const s = details.status;
  if (typeof s === 'number' && Number.isFinite(s)) return s;
  if (typeof s === 'string' && /^\d+$/.test(s)) return parseInt(s, 10);
  return null;
}

export async function OPTIONS() {
  return new Response('ok', { headers: corsHeaders });
}

export async function POST(req: Request) {
  const webhookSecret = resolveAgoraWebhookSecret();
  if (!webhookSecret) {
    console.error('[Agora Webhook] server_misconfigured');
    return json({ ok: false, error: 'server_misconfigured' }, 500);
  }

  const rawBody = await req.text();
  const signatureHeader = req.headers.get('Agora-Signature')?.trim() ?? '';

  if (!signatureHeader) {
    // Health probes / unsigned hits — silently accept.
    return new NextResponse(JSON.stringify({ ok: true, skipped: 'unsigned_probe' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!verifyAgoraSignatureHex(webhookSecret, rawBody, signatureHeader)) {
    // Mismatch logged without cryptographic material — never log expected hex or the signature header.
    console.warn('[Agora Webhook] signature_mismatch');
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  let supabase: ReturnType<typeof createServiceRoleClient>;
  try {
    supabase = createServiceRoleClient();
  } catch {
    // Scrubbed: do not surface the underlying error (may contain env hints).
    console.error('[Agora Webhook] service_role_client_init_failed');
    return json({ ok: false, error: 'server_misconfigured' }, 500);
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
    return json({ ok: true, skipped: 'wrong_product' }, 200);
  }

  const { sid, details } = envelope.payload;
  const eventType = envelope.eventType;

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
    return json({ ok: true, skipped: 'unknown_sid' }, 200);
  }

  const sessionStatus = sessionRow.status as string;
  if (sessionStatus === 'ready' || sessionStatus === 'failed') {
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

  if (eventType === 4) {
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
    return json({ ok: true, skipped: 'upload_progress' }, 200);
  }

  if (eventType === 1) {
    const errorLevel = typeof details.errorLevel === 'number' ? details.errorLevel : null;
    const errorMsg =
      typeof details.errorMsg === 'string' ? details.errorMsg : 'cloud_recording_error';
    if (errorLevel != null && errorLevel >= 4) {
      return failPipeline(`agora_error_level_${errorLevel}: ${errorMsg}`);
    }
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
      return json({ ok: true, skipped: 'no_file_list' }, 200);
    }

    const storagePath = buildStoragePath(workspaceId, classInstanceId, picked);
    if (!storagePath) {
      return failPipeline('could_not_build_storage_path');
    }
    return succeedPipeline(storagePath);
  }

  return json({ ok: true, skipped: 'ignored_event' }, 200);
}
