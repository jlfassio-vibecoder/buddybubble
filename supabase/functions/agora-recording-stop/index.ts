/**
 * Agora Cloud Recording — stop active recording for a class instance.
 *
 * Auth: User JWT (verify_jwt=true). Host must match `class_instances.metadata.live_session`.
 *
 * Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 * AGORA_APP_ID, AGORA_CUSTOMER_ID, AGORA_CUSTOMER_SECRET,
 * optional AGORA_RESTAPI_BASE (default https://api.sd-rtn.com).
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { markSessionRecordingFailed } from '../_shared/class-recording-reconcile.ts';
import { parseLiveSessionInviteFromInstanceMetadata } from '../_shared/live-session-invite.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type StopBody = {
  classInstanceId?: string;
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
  const restBase = (Deno.env.get('AGORA_RESTAPI_BASE')?.trim() || 'https://api.sd-rtn.com').replace(
    /\/$/,
    '',
  );

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ ok: false, error: 'server_misconfigured' }, 500);
  }
  if (!appId || !customerId || !customerSecret) {
    return json({ ok: false, error: 'agora_not_configured' }, 500);
  }

  const authHeaderReq = req.headers.get('Authorization');
  if (!authHeaderReq?.startsWith('Bearer ')) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }
  const jwt = authHeaderReq.slice('Bearer '.length);

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

  let body: StopBody;
  try {
    body = (await req.json()) as StopBody;
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const rawClassId = body.classInstanceId;
  if (typeof rawClassId !== 'string') {
    return json({ ok: false, error: 'missing_fields' }, 400);
  }
  const classInstanceId = rawClassId.trim();
  if (!classInstanceId) {
    return json({ ok: false, error: 'missing_fields' }, 400);
  }
  if (!UUID_PATTERN.test(classInstanceId)) {
    return json({ ok: false, error: 'invalid_uuid' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: instance, error: instErr } = await supabase
    .from('class_instances')
    .select('id, workspace_id, metadata')
    .eq('id', classInstanceId)
    .maybeSingle();

  if (instErr || !instance) {
    return json({ ok: false, error: 'class_instance_not_found' }, 404);
  }

  const workspaceId = instance.workspace_id as string;

  const { data: member, error: memErr } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (memErr || !member) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  const invite = parseLiveSessionInviteFromInstanceMetadata(instance.metadata);
  if (!invite || invite.hostUserId !== user.id) {
    return json({ ok: false, error: 'not_live_session_host' }, 403);
  }

  const { data: latest, error: latestErr } = await supabase
    .from('class_recording_sessions')
    .select('id, status, agora_resource_id, agora_sid, channel_name, agora_uid, class_instance_id')
    .eq('class_instance_id', classInstanceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestErr) {
    console.error('[agora-recording-stop] latest query', latestErr.message);
    return json({ ok: false, error: 'control_plane_error' }, 500);
  }

  if (!latest) {
    return json({ ok: true, skipped: 'nothing_to_stop' });
  }

  const st = latest.status as string;
  if (st === 'stopped' || st === 'uploading' || st === 'ready' || st === 'failed') {
    return json({ ok: true, skipped: 'already_terminal', status: st });
  }
  if (st === 'stopping') {
    return json({ ok: true, skipped: 'already_stopping' });
  }

  if (st === 'acquiring' || st === 'starting') {
    const { error: cancelErr } = await supabase
      .from('class_recording_sessions')
      .update({
        status: 'failed',
        error_message: truncateMessage('cancelled_before_recording_started'),
        stopped_at: new Date().toISOString(),
      })
      .eq('id', latest.id);
    if (cancelErr) {
      console.error('[agora-recording-stop] cancel early', cancelErr.message);
      return json({ ok: false, error: 'control_plane_error' }, 500);
    }
    return json({ ok: true, skipped: 'cancelled_early_session' });
  }

  if (st !== 'recording') {
    return json({ ok: true, skipped: 'unexpected_status', status: st });
  }

  const resourceId = latest.agora_resource_id as string | null;
  const sid = latest.agora_sid as string | null;
  const channelName = latest.channel_name as string;
  const botUid = latest.agora_uid as number;

  if (!resourceId || !sid) {
    const stoppedAt = new Date().toISOString();
    const r = await markSessionRecordingFailed(supabase, {
      sessionRowId: latest.id as string,
      classInstanceId,
      reason: 'missing_resource_or_sid_for_stop',
      logPrefix: '[agora-recording-stop]',
      stoppedAt,
    });
    if (!r.ok) {
      console.error('[Recording] Failed to stop Agora recording.');
    }
    return json({ ok: false, error: 'invalid_session_state' }, 500);
  }

  const { error: stErr } = await supabase
    .from('class_recording_sessions')
    .update({ status: 'stopping' })
    .eq('id', latest.id)
    .eq('status', 'recording');

  if (stErr) {
    console.error('[agora-recording-stop] set stopping', stErr.message);
    return json({ ok: false, error: 'control_plane_error' }, 500);
  }

  const authz = agoraBasicAuthHeader(customerId, customerSecret);
  const mode = 'mix';
  const stopUrl = `${restBase}/v1/apps/${appId}/cloud_recording/resourceid/${encodeURIComponent(resourceId)}/sid/${encodeURIComponent(sid)}/mode/${mode}/stop`;

  const stopBody = {
    cname: channelName,
    uid: String(botUid),
    clientRequest: {
      async_stop: false,
    },
  };

  const stopRes = await agoraPostJson(stopUrl, authz, stopBody);
  const stoppedAt = new Date().toISOString();

  if (stopRes.ok) {
    const { error: finErr } = await supabase
      .from('class_recording_sessions')
      .update({
        status: 'stopped',
        stopped_at: stoppedAt,
      })
      .eq('id', latest.id);
    if (finErr) {
      console.error('[agora-recording-stop] set stopped', finErr.message);
      return json({ ok: false, error: 'control_plane_error' }, 500);
    }
    return json({ ok: true, sessionId: latest.id });
  }

  // 404: recording already ended server-side — treat as idempotent success
  if (stopRes.status === 404) {
    const { error: finErr } = await supabase
      .from('class_recording_sessions')
      .update({
        status: 'stopped',
        stopped_at: stoppedAt,
        error_message: truncateMessage('agora_stop_404_already_ended'),
      })
      .eq('id', latest.id);
    if (finErr) {
      console.error('[agora-recording-stop] set stopped after 404', finErr.message);
      return json({ ok: false, error: 'control_plane_error' }, 500);
    }
    return json({ ok: true, skipped: 'stop_idempotent_404', sessionId: latest.id });
  }

  const detail = stopRes.text || `http_${stopRes.status}`;
  const r = await markSessionRecordingFailed(supabase, {
    sessionRowId: latest.id as string,
    classInstanceId,
    reason: truncateMessage(`agora_stop_failed: ${detail}`),
    logPrefix: '[agora-recording-stop]',
    stoppedAt,
  });
  if (!r.ok) {
    console.error('[Recording] Failed to stop Agora recording.');
  }

  return json({ ok: false, error: 'agora_stop_failed' }, 500);
});
