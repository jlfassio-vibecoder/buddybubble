/**
 * Agora Cloud Recording — stale-session reconciler (cron / manual).
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (verify_jwt=false).
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET,
 * AGORA_APP_ID, AGORA_CUSTOMER_ID, AGORA_CUSTOMER_SECRET,
 * optional AGORA_RESTAPI_BASE (default https://api.sd-rtn.com).
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  agoraQueryServerStatus,
  extractFileNamesFromAgoraQueryResponse,
  pickQueryPlaybackFileName,
} from '../_shared/agora-query-response.ts';
import {
  buildStoragePath,
  markSessionRecordingFailed,
  markSessionRecordingReady,
} from '../_shared/class-recording-reconcile.ts';

const STALE_MINUTES = 30;
const MAX_ROWS = 50;
const DEAD_LETTER_HOURS = 24;
const AGORA_FETCH_TIMEOUT_MS = 20_000;

const SWEEP_STATUSES = ['starting', 'recording', 'stopping', 'uploading', 'stopped'] as const;

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

function agoraBasicAuthHeader(customerId: string, customerSecret: string): string {
  const plain = `${customerId}:${customerSecret}`;
  const b64 = btoa(plain);
  return `Basic ${b64}`;
}

async function agoraGetJson(
  url: string,
  authHeader: string,
  signal: AbortSignal,
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: authHeader },
    signal,
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

type SessionRow = {
  id: string;
  class_instance_id: string;
  workspace_id: string;
  status: string;
  agora_resource_id: string | null;
  agora_sid: string | null;
  channel_name: string;
  agora_uid: number;
  created_at: string;
  updated_at: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  const cronSecret = Deno.env.get('CRON_SECRET')?.trim() ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const appId = Deno.env.get('AGORA_APP_ID')?.trim();
  const customerId = Deno.env.get('AGORA_CUSTOMER_ID')?.trim();
  const customerSecret = Deno.env.get('AGORA_CUSTOMER_SECRET')?.trim();
  const restBase = (Deno.env.get('AGORA_RESTAPI_BASE')?.trim() || 'https://api.sd-rtn.com').replace(
    /\/$/,
    '',
  );

  if (!cronSecret) {
    console.error('[agora-recording-reconciler] missing CRON_SECRET');
    return json({ ok: false, error: 'server_misconfigured' }, 500);
  }
  if (!supabaseUrl || !serviceKey) {
    console.error('[agora-recording-reconciler] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json({ ok: false, error: 'server_misconfigured' }, 500);
  }
  if (!appId || !customerId || !customerSecret) {
    console.error('[agora-recording-reconciler] missing Agora credentials');
    return json({ ok: false, error: 'agora_not_configured' }, 500);
  }

  const authz = req.headers.get('Authorization')?.trim() ?? '';
  const expected = `Bearer ${cronSecret}`;
  if (!authz.startsWith('Bearer ') || !timingSafeEqualStr(authz, expected)) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cutoffIso = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();
  const { data: rows, error: qErr } = await supabase
    .from('class_recording_sessions')
    .select(
      'id, class_instance_id, workspace_id, status, agora_resource_id, agora_sid, channel_name, agora_uid, created_at, updated_at',
    )
    .in('status', [...SWEEP_STATUSES])
    .lt('updated_at', cutoffIso)
    .order('updated_at', { ascending: true })
    .limit(MAX_ROWS);

  if (qErr) {
    console.error('[agora-recording-reconciler] sweep_query', qErr.message);
    return json({ ok: false, error: 'db_error' }, 500);
  }

  const list = (rows ?? []) as SessionRow[];
  const summary = {
    scanned: list.length,
    updatedReady: 0,
    updatedFailed: 0,
    ignored: 0,
    errors: 0,
  };

  const now = Date.now();
  const deadLetterCutoff = now - DEAD_LETTER_HOURS * 60 * 60 * 1000;
  const basic = agoraBasicAuthHeader(customerId, customerSecret);
  const mode = 'mix';

  console.log(
    `[agora-recording-reconciler] run start scanned=${summary.scanned} stale_before=${cutoffIso}`,
  );

  for (const row of list) {
    const sid = row.agora_sid ?? '';
    try {
      if (new Date(row.created_at).getTime() < deadLetterCutoff) {
        console.log(
          `[agora-recording-reconciler] dead_letter sid=${sid} session=${row.id} created_at=${row.created_at}`,
        );
        const r = await markSessionRecordingFailed(supabase, {
          sessionRowId: row.id,
          classInstanceId: row.class_instance_id,
          reason: 'reconciler_timeout_24h',
          logPrefix: '[agora-recording-reconciler]',
          agoraSid: sid || undefined,
        });
        if (r.ok) summary.updatedFailed++;
        else summary.errors++;
        continue;
      }

      const resourceId = row.agora_resource_id?.trim() ?? '';
      if (!resourceId || !sid) {
        console.warn(
          `[agora-recording-reconciler] missing_resource_or_sid session=${row.id} sid=${sid}`,
        );
        const r = await markSessionRecordingFailed(supabase, {
          sessionRowId: row.id,
          classInstanceId: row.class_instance_id,
          reason: 'missing_resource_or_sid_for_reconcile',
          logPrefix: '[agora-recording-reconciler]',
          agoraSid: sid || undefined,
        });
        if (r.ok) summary.updatedFailed++;
        else summary.errors++;
        continue;
      }

      const queryUrl = `${restBase}/v1/apps/${encodeURIComponent(appId)}/cloud_recording/resourceid/${encodeURIComponent(resourceId)}/sid/${encodeURIComponent(sid)}/mode/${mode}/query`;

      let agoraRes: { ok: boolean; status: number; json: unknown; text: string };
      try {
        agoraRes = await agoraGetJson(queryUrl, basic, AbortSignal.timeout(AGORA_FETCH_TIMEOUT_MS));
      } catch (e) {
        console.warn(
          `[agora-recording-reconciler] agora_fetch_error sid=${sid}`,
          e instanceof Error ? e.message : e,
        );
        summary.errors++;
        continue;
      }

      if (agoraRes.status === 404) {
        console.log(`[agora-recording-reconciler] agora_404 sid=${sid} session=${row.id}`);
        const r = await markSessionRecordingFailed(supabase, {
          sessionRowId: row.id,
          classInstanceId: row.class_instance_id,
          reason: 'agora_query_404_session_lost',
          logPrefix: '[agora-recording-reconciler]',
          agoraSid: sid,
        });
        if (r.ok) summary.updatedFailed++;
        else summary.errors++;
        continue;
      }

      if (!agoraRes.ok) {
        const transient = agoraRes.status >= 500 || agoraRes.status === 408;
        console.warn(
          `[agora-recording-reconciler] agora_non_ok status=${agoraRes.status} transient=${transient} sid=${sid}`,
        );
        summary.errors++;
        continue;
      }

      const names = extractFileNamesFromAgoraQueryResponse(agoraRes.json);
      const picked = pickQueryPlaybackFileName(names);
      if (picked) {
        const storagePath = buildStoragePath(row.workspace_id, row.class_instance_id, picked);
        if (!storagePath) {
          const r = await markSessionRecordingFailed(supabase, {
            sessionRowId: row.id,
            classInstanceId: row.class_instance_id,
            reason: 'could_not_build_storage_path_from_query',
            logPrefix: '[agora-recording-reconciler]',
            agoraSid: sid,
          });
          if (r.ok) summary.updatedFailed++;
          else summary.errors++;
          continue;
        }
        const r = await markSessionRecordingReady(supabase, {
          sessionRowId: row.id,
          classInstanceId: row.class_instance_id,
          workspaceId: row.workspace_id,
          storagePath,
          logPrefix: '[agora-recording-reconciler]',
          agoraSid: sid,
        });
        if (r.ok) summary.updatedReady++;
        else summary.errors++;
        continue;
      }

      const srvSt = agoraQueryServerStatus(agoraRes.json);
      console.log(
        `[agora-recording-reconciler] active_or_unresolved sid=${sid} session=${row.id} serverStatus=${srvSt}`,
      );
      summary.ignored++;
    } catch (e) {
      console.error(
        `[agora-recording-reconciler] session_loop_error session=${row.id}`,
        e instanceof Error ? e.message : e,
      );
      summary.errors++;
    }
  }

  console.log(`[agora-recording-reconciler] run end`, summary);
  return json({ ok: true, ...summary });
});
