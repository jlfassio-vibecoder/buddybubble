import { NextResponse } from 'next/server';
import { RtcRole, RtcTokenBuilder } from 'agora-access-token';
import { agoraUidFromUuid } from '@/lib/live-video/agora-uid';
import { createClient } from '@utils/supabase/server';

const TOKEN_TTL_SECONDS = 3600;

/** Agora channel name: max 64 bytes; conservative ASCII subset (plan + Agora docs). */
const CHANNEL_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

function parseRole(role: unknown): number | null {
  if (role === 'publisher') return RtcRole.PUBLISHER;
  if (role === 'subscriber') return RtcRole.SUBSCRIBER;
  return null;
}

export async function POST(req: Request) {
  const appId = process.env.AGORA_APP_ID?.trim();
  const certificate = process.env.AGORA_APP_CERTIFICATE?.trim();
  if (!appId || !certificate) {
    return NextResponse.json(
      { error: 'Live video is not configured on this server.' },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const rawChannel = (body as { channelId?: unknown }).channelId;
  const roleRaw = (body as { role?: unknown }).role;
  const workspaceIdRaw = (body as { workspaceId?: unknown }).workspaceId;

  if (typeof rawChannel !== 'string') {
    return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
  }

  const channelId = rawChannel.trim();
  if (!CHANNEL_ID_PATTERN.test(channelId)) {
    return NextResponse.json({ error: 'Invalid channelId' }, { status: 400 });
  }

  const rtcRole = parseRole(roleRaw);
  if (rtcRole == null) {
    return NextResponse.json({ error: 'role must be publisher or subscriber' }, { status: 400 });
  }

  if (workspaceIdRaw !== undefined) {
    if (typeof workspaceIdRaw !== 'string' || workspaceIdRaw.trim() === '') {
      return NextResponse.json({ error: 'Invalid workspaceId' }, { status: 400 });
    }
    const workspaceId = workspaceIdRaw.trim();
    const { data: membership, error: memError } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memError) {
      console.error('[live-video/token] workspace membership lookup', memError);
      return NextResponse.json({ error: 'Unable to verify workspace access' }, { status: 500 });
    }
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  console.log('[DEBUG] Token API hit for channel:', channelId);

  const uid = agoraUidFromUuid(user.id);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + TOKEN_TTL_SECONDS;

  let token: string;
  try {
    token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      certificate,
      channelId,
      uid,
      rtcRole,
      expiresAt,
    );
  } catch (e) {
    console.error('[live-video/token] buildTokenWithUid', e);
    return NextResponse.json({ error: 'Token generation failed' }, { status: 503 });
  }

  return NextResponse.json({
    token,
    appId,
    uid,
    channelId,
    expiresAt,
  });
}
