/**
 * Agora Cloud Recording — start (acquire + start) for class live video.
 *
 * Auth: User JWT (verify_jwt=true). Validates host via `class_instances.metadata.live_session`.
 * Cloud recording only runs when `metadata.async_session` is present and not ended (`async_workout_not_enabled` otherwise).
 *
 * Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 * AGORA_APP_ID, AGORA_CUSTOMER_ID, AGORA_CUSTOMER_SECRET, AGORA_APP_CERTIFICATE,
 * optional AGORA_RESTAPI_BASE (default https://api.sd-rtn.com),
 * S3_BUCKET, S3_ENDPOINT (trimmed; optional `http(s)://` prefix removed for Agora — no other mutation),
 * S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
 * S3_REGION (optional; accepts Agora vendor numeric code as a string, e.g. "0". Non-numeric values
 * like AWS region names ("us-east-1") fall back to 0, which is the safe default for vendor 11 since
 * the endpoint URL is authoritative).
 *
 * Endpoint: Agora vendor 11 `extensionParams.endpoint` is the raw `S3_ENDPOINT` value with only
 * an optional `http(s)://` prefix removed — no host rewriting and no path appending.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
// `agora-access-token` is a CJS package that depends on Node `crypto` + `Buffer`. The `npm:` specifier
// can EarlyDrop on Supabase Edge boot if Node compat shims are not resolved before the package
// evaluates. `esm.sh` pre-bundles those polyfills, so importing from there avoids the module-load crash.
import { RtcRole, RtcTokenBuilder } from 'https://esm.sh/agora-access-token@2.0.4';
import { agoraRecordingBotUid, agoraUidFromUuid } from '../_shared/agora-uid.ts';
import { aspectRatioToCanvas, parseAspectRatio } from '../_shared/aspect-ratio.ts';
import { patchInstanceClassRecordingPipelineStatus } from '../_shared/class-recording-reconcile.ts';
import {
  parseAsyncSessionFromInstanceMetadata,
  parseLiveSessionInviteFromInstanceMetadata,
} from '../_shared/live-session-invite.ts';

const CHANNEL_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RECORDING_TOKEN_TTL_SEC = 86400 + 7200; // 26h — must exceed expected recording + Agora guidance
const AGORA_HTTP_TIMEOUT_MS = 120_000;

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type StartBody = {
  classInstanceId?: string;
  channelName?: string;
  workspaceId?: string;
  aspectRatio?: unknown;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function missingEnvKeys(pairs: ReadonlyArray<[string, string | undefined | null]>): string[] {
  const out: string[] = [];
  for (const [name, val] of pairs) {
    if (val == null || !String(val).trim()) out.push(name);
  }
  return out;
}

function truncateMessage(msg: string, max = 4000): string {
  const t = msg.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/** Agora `fileNamePrefix` segments must be alphanumeric only (no hyphens). */
function agoraSafePrefixSegment(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

// Authenticated workspace host endpoint: surface step + DB detail so the caller does not have to
// round-trip through Edge Function logs to diagnose recording failures.
function controlPlaneError(step: string, detail?: string | null, status = 500) {
  const body: Record<string, unknown> = { ok: false, error: 'control_plane_error', step };
  if (detail) body.detail = truncateMessage(detail);
  return json(body, status);
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
  signal?: AbortSignal,
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
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

async function agoraStopMixBestEffort(
  restBase: string,
  appId: string,
  authz: string,
  resourceId: string,
  sid: string,
  channelName: string,
  botUidStr: string,
): Promise<void> {
  const stopUrl = `${restBase}/v1/apps/${appId}/cloud_recording/resourceid/${encodeURIComponent(resourceId)}/sid/${encodeURIComponent(sid)}/mode/mix/stop`;
  try {
    await fetch(stopUrl, {
      method: 'POST',
      headers: {
        Authorization: authz,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cname: channelName,
        uid: botUidStr,
        clientRequest: { async_stop: false },
      }),
      signal: AbortSignal.timeout(AGORA_HTTP_TIMEOUT_MS),
    });
  } catch {
    /* best-effort — row cleanup must still proceed */
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const appId = Deno.env.get('AGORA_APP_ID')?.trim();
    const customerId = Deno.env.get('AGORA_CUSTOMER_ID')?.trim();
    const customerSecret = Deno.env.get('AGORA_CUSTOMER_SECRET')?.trim();
    const appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE')?.trim();
    const restBase = (
      Deno.env.get('AGORA_RESTAPI_BASE')?.trim() || 'https://api.sd-rtn.com'
    ).replace(/\/$/, '');
    // Dual-read region: prefer S3_REGION, fall back to legacy SUPABASE_S3_REGION.
    const rawStorageRegion =
      Deno.env.get('S3_REGION')?.trim() || Deno.env.get('SUPABASE_S3_REGION')?.trim() || '';
    // Agora `storageConfig.region` is a numeric vendor code. Supabase convention sets the region
    // env to an AWS name like `us-east-1`. With `vendor: 11` (S3-compatible) + a custom `endpoint`,
    // Agora effectively ignores `region`; using 0 is the documented safe default. Accept a
    // numeric string when ops want explicit control, otherwise fall back to 0 with a warning.
    const parsedRegion = Number.parseInt(rawStorageRegion, 10);
    const storageRegion = Number.isFinite(parsedRegion) ? parsedRegion : 0;
    if (rawStorageRegion && !Number.isFinite(parsedRegion)) {
      console.warn(
        `[agora-recording-start] storage region "${rawStorageRegion}" is not numeric; defaulting to 0 (vendor 11 uses endpoint URL).`,
      );
    }
    // Dual-read S3 env: prefer new S3_* names, fall back to legacy SUPABASE_S3_* so prod cutover
    // is non-breaking. Remove the fallbacks once all environments have been renamed.
    const s3Bucket =
      Deno.env.get('S3_BUCKET')?.trim() || Deno.env.get('SUPABASE_S3_BUCKET')?.trim();
    const s3Endpoint =
      Deno.env.get('S3_ENDPOINT')?.trim() || Deno.env.get('SUPABASE_S3_ENDPOINT')?.trim();
    // Vendor 11: pass through `S3_ENDPOINT` exactly (trimmed); strip scheme only — no path mutation.
    const s3EndpointForAgora = (s3Endpoint ?? '').replace(/^https?:\/\//i, '');
    const s3AccessKey =
      Deno.env.get('S3_ACCESS_KEY_ID')?.trim() || Deno.env.get('SUPABASE_S3_ACCESS_KEY_ID')?.trim();
    const s3SecretKey =
      Deno.env.get('S3_SECRET_ACCESS_KEY')?.trim() ||
      Deno.env.get('SUPABASE_S3_SECRET_ACCESS_KEY')?.trim();

    // Opaque error responses: log specifics server-side, surface only `server_misconfigured` to
    // callers — matches other edge functions and avoids leaking deployment fingerprints.
    const missingServer = missingEnvKeys([
      ['SUPABASE_URL', supabaseUrl],
      ['SUPABASE_ANON_KEY', anonKey],
      ['SUPABASE_SERVICE_ROLE_KEY', serviceKey],
    ]);
    if (missingServer.length) {
      console.error(
        `[agora-recording-start] server_misconfigured missing=${missingServer.join(',')}`,
      );
      return json({ ok: false, error: 'server_misconfigured' }, 500);
    }

    const missingAgora = missingEnvKeys([
      ['AGORA_APP_ID', appId],
      ['AGORA_CUSTOMER_ID', customerId],
      ['AGORA_CUSTOMER_SECRET', customerSecret],
      ['AGORA_APP_CERTIFICATE', appCertificate],
    ]);
    if (missingAgora.length) {
      console.error(
        `[agora-recording-start] agora_not_configured missing=${missingAgora.join(',')}`,
      );
      return json({ ok: false, error: 'agora_not_configured' }, 500);
    }

    const missingS3 = missingEnvKeys([
      ['S3_BUCKET', s3Bucket],
      ['S3_ENDPOINT', s3Endpoint],
      ['S3_ACCESS_KEY_ID', s3AccessKey],
      ['S3_SECRET_ACCESS_KEY', s3SecretKey],
    ]);
    if (missingS3.length) {
      console.error(`[agora-recording-start] s3_not_configured missing=${missingS3.join(',')}`);
      return json({ ok: false, error: 's3_not_configured' }, 500);
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

    const rawClass = body.classInstanceId;
    const rawChannel = body.channelName;
    const rawWs = body.workspaceId;
    if (
      typeof rawClass !== 'string' ||
      typeof rawChannel !== 'string' ||
      typeof rawWs !== 'string'
    ) {
      return json({ ok: false, error: 'missing_fields' }, 400);
    }
    const classInstanceId = rawClass.trim();
    const channelName = rawChannel.trim();
    const workspaceId = rawWs.trim();
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

    const asyncSession = parseAsyncSessionFromInstanceMetadata(instance.metadata);
    if (!asyncSession || asyncSession.endedAt) {
      return json({ ok: false, error: 'async_workout_not_enabled' }, 400);
    }

    const aspectRatio = parseAspectRatio(body.aspectRatio);
    const { width: mixWidth, height: mixHeight } = aspectRatioToCanvas(aspectRatio);
    console.info(
      JSON.stringify({
        evt: 'agora_recording_start_aspect_ratio',
        aspectRatio,
        mixWidth,
        mixHeight,
      }),
    );

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
      return controlPlaneError('active_query', activeErr.message);
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
      return controlPlaneError('insert_session', insErr.message);
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

      const acquireRes = await agoraPostJson(
        acquireUrl,
        authz,
        acquireBody,
        AbortSignal.timeout(AGORA_HTTP_TIMEOUT_MS),
      );
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
        return controlPlaneError('update_starting', upStartingErr.message);
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
          transcodingConfig: {
            width: mixWidth,
            height: mixHeight,
            fps: 15,
            bitrate: 1500,
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
            // Each segment must be [a-zA-Z0-9] only per Agora docs; UUIDs need hyphen stripping.
            fileNamePrefix: [
              agoraSafePrefixSegment(workspaceId),
              agoraSafePrefixSegment(classInstanceId),
            ],
            extensionParams: {
              endpoint: s3EndpointForAgora,
            },
          },
        },
      };

      const startRes = await agoraPostJson(
        startUrl,
        authz,
        startBody,
        AbortSignal.timeout(AGORA_HTTP_TIMEOUT_MS),
      );
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
        await agoraStopMixBestEffort(
          restBase,
          appId,
          authz,
          resourceId,
          sid,
          channelName,
          botUidStr,
        );
        await failSession(upRecErr.message);
        return controlPlaneError('update_recording', upRecErr.message);
      }

      const patch = await patchInstanceClassRecordingPipelineStatus(supabase, {
        classInstanceId,
        status: 'recording',
        logPrefix: '[agora-recording-start]',
      });

      if (!patch.ok) {
        console.error('[agora-recording-start] metadata update', patch.error);
        await agoraStopMixBestEffort(
          restBase,
          appId,
          authz,
          resourceId,
          sid,
          channelName,
          botUidStr,
        );
        await failSession(`metadata_update_failed: ${patch.error}`);
        return json({ ok: false, error: 'metadata_update_failed' }, 500);
      }

      if (patch.applied === false) {
        if (patch.reason === 'forward_only_guard' || patch.reason === 'manual_provider') {
          await agoraStopMixBestEffort(
            restBase,
            appId,
            authz,
            resourceId,
            sid,
            channelName,
            botUidStr,
          );
          await failSession(
            patch.reason === 'manual_provider'
              ? 'manual_class_recording_metadata_present'
              : 'class_recording_terminal_state_blocks_restart',
          );
          return controlPlaneError(
            'metadata_conflict',
            patch.reason === 'manual_provider' ? 'manual_provider' : 'terminal_state',
          );
        }
        // `no_change`: metadata already `recording` — idempotent retry after successful Agora start.
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
      return json({ ok: false, error: 'unexpected_error', message: msg }, 500);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[agora-recording-start] unhandled', msg);
    return json({ ok: false, error: 'unexpected_error', message: msg }, 500);
  }
});
