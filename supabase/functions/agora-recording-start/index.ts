/**
 * Agora Cloud Recording — start (acquire + start) for class live video.
 *
 * Auth: User JWT (verify_jwt=true). Validates host via `class_instances.metadata.live_session`.
 *
 * Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 * AGORA_APP_ID, AGORA_CUSTOMER_ID, AGORA_CUSTOMER_SECRET, AGORA_APP_CERTIFICATE,
 * optional AGORA_RESTAPI_BASE (default https://api.sd-rtn.com),
 * optional AGORA_STORAGE_REGION (integer string, default 0),
 * SUPABASE_S3_BUCKET, SUPABASE_S3_ENDPOINT, SUPABASE_S3_ACCESS_KEY_ID, SUPABASE_S3_SECRET_ACCESS_KEY.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { RtcRole, RtcTokenBuilder } from 'npm:agora-access-token@2.0.4';
import { agoraRecordingBotUid, agoraUidFromUuid } from '../_shared/agora-uid.ts';
import {
  mergeClassRecordingIntoInstanceMetadata,
  type ClassRecordingPayload,
} from '../_shared/class-recording-metadata.ts';
import { parseLiveSessionInviteFromInstanceMetadata } from '../_shared/live-session-invite.ts';

const CHANNEL_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RECORDING_TOKEN_TTL_SEC = 86400 + 7200; // 26h — must exceed expected recording + Agora guidance

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type StartBody = {
  classInstanceId?: string;
  channelName?: string;
  workspaceId?: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function truncateMessage(msg: string, max = 4000): string {
  const t = msg.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function agoraBasicAuthHeader(customerId: string, customerSecret: string): string {
  const plain = `${customerId}:${customerSecret}`;
  const b64 = btoa(plain);
  return `Basic ${b64}`;
}

async function agoraPostJson(
  url: string,
  authHeader: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { ok: res.ok, status: res.status, json: parsed, text };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const appId = Deno.env.get('AGORA_APP_ID')?.trim();
  const customerId = Deno.env.get('AGORA_CUSTOMER_ID')?.trim();
  const customerSecret = Deno.env.get('AGORA_CUSTOMER_SECRET')?.trim();
  const appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE')?.trim();
  const restBase = (Deno.env.get('AGORA_RESTAPI_BASE')?.trim() || 'https://api.sd-rtn.com').replace(
    /\/$/,
    '',
  );
  const storageRegionStr = Deno.env.get('AGORA_STORAGE_REGION')?.trim() ?? '0';
  const storageRegion = Number.parseInt(storageRegionStr, 10);
  const s3Bucket = Deno.env.get('SUPABASE_S3_BUCKET')?.trim();
  const s3Endpoint = Deno.env.get('SUPABASE_S3_ENDPOINT')?.trim();
  const s3AccessKey = Deno.env.get('SUPABASE_S3_ACCESS_KEY_ID')?.trim();
  const s3SecretKey = Deno.env.get('SUPABASE_S3_SECRET_ACCESS_KEY')?.trim();

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ ok: false, error: 'server_misconfigured' }, 500);
  }
  if (!appId || !customerId || !customerSecret || !appCertificate) {
    return json({ ok: false, error: 'agora_not_configured' }, 500);
  }
  if (!s3Bucket || !s3Endpoint || !s3AccessKey || !s3SecretKey) {
    return json({ ok: false, error: 's3_not_configured' }, 500);
  }
  if (!Number.isFinite(storageRegion)) {
    return json({ ok: false, error: 'invalid_storage_region' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }
  const jwt = authHeader.slice('Bearer '.length);

  const supabaseAuth = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authErr,
  } = await supabaseAuth.auth.getUser(jwt);
  if (authErr || !user) {
    return json({ ok: false, error: 'invalid_session' }, 401);
  }

  let body: StartBody;
  try {
    body = (await req.json()) as StartBody;
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const classInstanceId = body.classInstanceId?.trim() ?? '';
  const channelName = body.channelName?.trim() ?? '';
  const workspaceId = body.workspaceId?.trim() ?? '';
  if (!classInstanceId || !channelName || !workspaceId) {
    return json({ ok: false, error: 'missing_fields' }, 400);
  }
  if (!UUID_PATTERN.test(classInstanceId) || !UUID_PATTERN.test(workspaceId)) {
    return json({ ok: false, error: 'invalid_uuid' }, 400);
  }
  if (!CHANNEL_ID_PATTERN.test(channelName)) {
    return json({ ok: false, error: 'invalid_channel' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: member, error: memErr } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (memErr || !member) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  const { data: instance, error: instErr } = await supabase
    .from('class_instances')
    .select('id, workspace_id, metadata')
    .eq('id', classInstanceId)
    .maybeSingle();

  if (instErr || !instance) {
    return json({ ok: false, error: 'class_instance_not_found' }, 404);
  }
  if (instance.workspace_id !== workspaceId) {
    return json({ ok: false, error: 'workspace_mismatch' }, 400);
  }

  const invite = parseLiveSessionInviteFromInstanceMetadata(instance.metadata);
  if (!invite || invite.hostUserId !== user.id) {
    return json({ ok: false, error: 'not_live_session_host' }, 403);
  }
  if (invite.workspaceId !== workspaceId || invite.channelId !== channelName) {
    return json({ ok: false, error: 'live_session_mismatch' }, 400);
  }
  if (invite.endedAt) {
    return json({ ok: false, error: 'live_session_ended' }, 400);
  }

  const authz = agoraBasicAuthHeader(customerId, customerSecret);
  const hostAgoraUid = agoraUidFromUuid(user.id);
  const botUid = agoraRecordingBotUid(classInstanceId, hostAgoraUid);
  const botUidStr = String(botUid);

  const { data: activeRows, error: activeErr } = await supabase
    .from('class_recording_sessions')
    .select('id, status, agora_resource_id, agora_sid')
    .eq('class_instance_id', classInstanceId)
    .in('status', ['acquiring', 'starting', 'recording']);

  if (activeErr) {
    console.error('[agora-recording-start] active query', activeErr.message);
    return json({ ok: false, error: 'control_plane_error' }, 500);
  }

  const active = activeRows?.[0];
  if (active) {
    if (active.status === 'recording') {
      return json({
        ok: true,
        skipped: 'already_recording',
        sessionId: active.id,
        agoraSid: active.agora_sid,
      });
    }
    return json(
      { ok: true, skipped: 'already_in_progress', sessionId: active.id, status: active.status },
      202,
    );
  }

  const { data: inserted, error: insErr } = await supabase
    .from('class_recording_sessions')
    .insert({
      class_instance_id: classInstanceId,
      workspace_id: workspaceId,
      status: 'acquiring',
      channel_name: channelName,
      agora_uid: botUid,
    })
    .select('id')
    .single();

  if (insErr) {
    if (insErr.code === '23505') {
      return json({ ok: true, skipped: 'concurrent_start' }, 202);
    }
    console.error('[agora-recording-start] insert', insErr.message);
    return json({ ok: false, error: 'control_plane_error' }, 500);
  }

  const sessionRowId = inserted.id as string;

  const failSession = async (message: string) => {
    await supabase
      .from('class_recording_sessions')
      .update({
        status: 'failed',
        error_message: truncateMessage(message),
        stopped_at: new Date().toISOString(),
      })
      .eq('id', sessionRowId);
  };

  try {
    const acquireUrl = `${restBase}/v1/apps/${appId}/cloud_recording/acquire`;
    const acquireBody = {
      cname: channelName,
      uid: botUidStr,
      clientRequest: {
        scene: 0,
        resourceExpiredHour: 24,
      },
    };

    const acquireRes = await agoraPostJson(acquireUrl, authz, acquireBody);
    if (!acquireRes.ok || !acquireRes.json || typeof acquireRes.json !== 'object') {
      const detail = acquireRes.text || `http_${acquireRes.status}`;
      await failSession(`acquire_failed: ${detail}`);
      return json({ ok: false, error: 'agora_acquire_failed' }, 500);
    }

    const resourceId = (acquireRes.json as { resourceId?: string }).resourceId;
    if (!resourceId) {
      await failSession('acquire_missing_resource_id');
      return json({ ok: false, error: 'agora_acquire_failed' }, 500);
    }

    const { error: upStartingErr } = await supabase
      .from('class_recording_sessions')
      .update({
        status: 'starting',
        agora_resource_id: resourceId,
      })
      .eq('id', sessionRowId);

    if (upStartingErr) {
      await failSession(upStartingErr.message);
      return json({ ok: false, error: 'control_plane_error' }, 500);
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const tokenExpiresAt = nowSec + RECORDING_TOKEN_TTL_SEC;
    let rtcToken: string;
    try {
      rtcToken = RtcTokenBuilder.buildTokenWithUid(
        appId,
        appCertificate,
        channelName,
        botUid,
        RtcRole.PUBLISHER,
        tokenExpiresAt,
      );
    } catch (e) {
      await failSession(`token_build_failed: ${e instanceof Error ? e.message : String(e)}`);
      return json({ ok: false, error: 'token_build_failed' }, 500);
    }

    const mode = 'mix';
    const startUrl = `${restBase}/v1/apps/${appId}/cloud_recording/resourceid/${encodeURIComponent(resourceId)}/mode/${mode}/start`;

    const startBody = {
      cname: channelName,
      uid: botUidStr,
      clientRequest: {
        token: rtcToken,
        recordingConfig: {
          channelType: 0,
          streamTypes: 2,
          streamMode: 'default',
          videoStreamType: 0,
          maxIdleTime: 120,
          subscribeAudioUids: ['#allstream#'],
          subscribeVideoUids: ['#allstream#'],
          subscribeUidGroup: 0,
        },
        recordingFileConfig: {
          avFileType: ['hls', 'mp4'],
        },
        storageConfig: {
          vendor: 11,
          region: storageRegion,
          bucket: s3Bucket,
          accessKey: s3AccessKey,
          secretKey: s3SecretKey,
          fileNamePrefix: [workspaceId, classInstanceId],
          extensionParams: {
            endpoint: s3Endpoint,
          },
        },
      },
    };

    const startRes = await agoraPostJson(startUrl, authz, startBody);
    if (!startRes.ok || !startRes.json || typeof startRes.json !== 'object') {
      const detail = startRes.text || `http_${startRes.status}`;
      await failSession(`start_failed: ${detail}`);
      return json({ ok: false, error: 'agora_start_failed' }, 500);
    }

    const sid = (startRes.json as { sid?: string }).sid;
    if (!sid) {
      await failSession('start_missing_sid');
      return json({ ok: false, error: 'agora_start_failed' }, 500);
    }

    const startedAt = new Date().toISOString();
    const { error: upRecErr } = await supabase
      .from('class_recording_sessions')
      .update({
        status: 'recording',
        agora_sid: sid,
        raw_start_response: startRes.json as Record<string, unknown>,
        started_at: startedAt,
      })
      .eq('id', sessionRowId);

    if (upRecErr) {
      await failSession(upRecErr.message);
      return json({ ok: false, error: 'control_plane_error' }, 500);
    }

    const nowIso = new Date().toISOString();
    const prevRecording = (instance.metadata as Record<string, unknown>)?.class_recording;
    const prevCreated =
      prevRecording &&
      typeof prevRecording === 'object' &&
      !Array.isArray(prevRecording) &&
      typeof (prevRecording as { createdAt?: unknown }).createdAt === 'string'
        ? (prevRecording as { createdAt: string }).createdAt
        : undefined;

    const recordingPayload: ClassRecordingPayload = {
      type: 'class_recording',
      status: 'processing',
      provider: 'agora',
      ...(prevCreated ? { createdAt: prevCreated } : { createdAt: nowIso }),
      updatedAt: nowIso,
    };

    const nextMeta = mergeClassRecordingIntoInstanceMetadata(instance.metadata, recordingPayload);

    const { error: metaErr } = await supabase
      .from('class_instances')
      .update({
        metadata: nextMeta,
        updated_at: nowIso,
      })
      .eq('id', classInstanceId);

    if (metaErr) {
      console.error('[agora-recording-start] metadata update', metaErr.message);
      await failSession(`metadata_update_failed: ${metaErr.message}`);
      return json({ ok: false, error: 'metadata_update_failed' }, 500);
    }

    return json({
      ok: true,
      sessionId: sessionRowId,
      agoraSid: sid,
      resourceId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await failSession(msg);
    return json({ ok: false, error: 'unexpected_error' }, 500);
  }
});
