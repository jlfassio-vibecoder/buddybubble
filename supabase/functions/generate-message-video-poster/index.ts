/**
 * Supabase Edge Function: extract one JPEG frame from a message video in Storage and upload to thumb_path.
 * Uses @ffmpeg/ffmpeg (WASM) loaded from CDN at runtime. If WASM fails or the file is too large, return ok:false
 * so the client can fall back to captureVideoPoster.
 *
 * Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (auto-injected in hosted projects).
 * Deploy: `supabase functions deploy generate-message-video-poster --no-verify-jwt` only if you disable JWT;
 * default verify_jwt=true so callers must send the user Authorization header (supabase-js does this).
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { FFmpeg } from 'npm:@ffmpeg/ffmpeg@0.12.10';
import { toBlobURL } from 'npm:@ffmpeg/util@0.12.1';

const BUCKET = 'message-attachments';
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Body = {
  workspace_id?: string;
  message_id?: string;
  video_path?: string;
  thumb_path?: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ ok: false, error: 'server_misconfigured' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }
  const jwt = authHeader.slice('Bearer '.length);

  const supabaseAuth = createClient(supabaseUrl, anonKey);
  const {
    data: { user },
    error: authErr,
  } = await supabaseAuth.auth.getUser(jwt);
  if (authErr || !user) {
    return json({ ok: false, error: 'invalid_session' }, 401);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const workspace_id = body.workspace_id?.trim();
  const message_id = body.message_id?.trim();
  const video_path = body.video_path?.trim();
  const thumb_path = body.thumb_path?.trim();
  if (!workspace_id || !message_id || !video_path || !thumb_path) {
    return json({ ok: false, error: 'missing_fields' }, 400);
  }

  const prefix = `${workspace_id}/${message_id}/`;
  if (!video_path.startsWith(prefix) || !thumb_path.startsWith(prefix)) {
    return json({ ok: false, error: 'invalid_path' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: member, error: memErr } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspace_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (memErr || !member || (member.role !== 'admin' && member.role !== 'member')) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  const { data: msgRow, error: msgErr } = await supabase
    .from('messages')
    .select('id, bubble_id')
    .eq('id', message_id)
    .maybeSingle();
  if (msgErr || !msgRow) {
    return json({ ok: false, error: 'message_not_found' }, 404);
  }

  const { data: bubble, error: bErr } = await supabase
    .from('bubbles')
    .select('workspace_id')
    .eq('id', msgRow.bubble_id)
    .maybeSingle();
  if (bErr || !bubble || bubble.workspace_id !== workspace_id) {
    return json({ ok: false, error: 'workspace_mismatch' }, 400);
  }

  const { data: vidBlob, error: dlErr } = await supabase.storage.from(BUCKET).download(video_path);
  if (dlErr || !vidBlob) {
    return json({ ok: false, error: 'download_failed', fallback: true }, 502);
  }

  const buf = await vidBlob.arrayBuffer();
  if (buf.byteLength > MAX_VIDEO_BYTES) {
    return json({ ok: false, error: 'video_too_large', fallback: true }, 413);
  }

  const inputName = 'input_vid';
  const outName = 'poster.jpg';
  let jpegBytes: Uint8Array;

  try {
    const ffmpeg = new FFmpeg();
    // Pin core assets to the same minor as `@ffmpeg/ffmpeg` (0.12.10) to avoid WASM/JS mismatches.
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    const ext = video_path.split('.').pop()?.toLowerCase() || 'mp4';
    const inFile = `${inputName}.${ext}`;
    await ffmpeg.writeFile(inFile, new Uint8Array(buf));

    await ffmpeg.exec(['-ss', '0.25', '-i', inFile, '-frames:v', '1', '-q:v', '3', outName]);

    const data = (await ffmpeg.readFile(outName)) as Uint8Array;
    jpegBytes = new Uint8Array(data);
  } catch (e) {
    console.error('[generate-message-video-poster] ffmpeg', e);
    return json({ ok: false, error: 'ffmpeg_failed', fallback: true }, 500);
  }

  if (!jpegBytes?.length) {
    return json({ ok: false, error: 'empty_output', fallback: true }, 500);
  }

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(thumb_path, jpegBytes, {
    upsert: true,
    contentType: 'image/jpeg',
    cacheControl: '3600',
  });
  if (upErr) {
    console.error('[generate-message-video-poster] upload', upErr);
    return json({ ok: false, error: 'upload_failed', fallback: true }, 502);
  }

  return json({
    ok: true,
    thumb_path,
  });
});
