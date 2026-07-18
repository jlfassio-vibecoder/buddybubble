import { NextResponse } from 'next/server';
// Copilot suggestion ignored: `agora-access-token` is deprecated, but migration to `agora-token` will be done
// in a follow-up PR after validating API parity and token correctness end-to-end.
import { RtcRole, RtcTokenBuilder } from 'agora-access-token';
import { resolveAgoraCredentials } from '@/lib/agora/credentials';
import { agoraUidFromUuid } from '@/lib/live-video/agora-uid';
import { isUuidString } from '@/lib/is-uuid';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
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
  const { appId, appCertificate } = resolveAgoraCredentials();
  if (!appId || !appCertificate) {
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

  // Tier C: session-scoped authorization. Layered ON TOP of the existing workspace
  // check so the previous behaviour for callers without a `sessionId` (e.g. dev
  // scaffold route) is preserved. We disambiguate "session does not exist yet"
  // (404 → client retries) from "session exists but user is not authorized"
  // (403 → client gives up) by reading `live_sessions` with the service role.
  const sessionIdRaw = (body as { sessionId?: unknown }).sessionId;
  if (sessionIdRaw !== undefined) {
    if (typeof sessionIdRaw !== 'string' || sessionIdRaw.trim() === '') {
      return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
    }
    const sessionId = sessionIdRaw.trim();
    if (!isUuidString(sessionId)) {
      return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
    }

    if (typeof workspaceIdRaw !== 'string' || workspaceIdRaw.trim() === '') {
      return NextResponse.json(
        { error: 'workspaceId is required when sessionId is provided' },
        { status: 400 },
      );
    }
    const tierWorkspaceId = workspaceIdRaw.trim();

    let admin;
    try {
      admin = createServiceRoleClient();
    } catch (e) {
      console.error('[live-video/token] Tier C: service-role client unavailable', e);
      return NextResponse.json({ error: 'Tier C authorization unavailable' }, { status: 500 });
    }

    const { data: sessionRow, error: sessionErr } = await admin
      .from('live_sessions')
      .select('id, host_user_id, workspace_id')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionErr) {
      console.error('[live-video/token] Tier C: live_sessions lookup', sessionErr);
      return NextResponse.json({ error: 'Tier C lookup failed' }, { status: 500 });
    }

    if (!sessionRow) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[DEBUG][API] Tier C: Session not found yet, returning 404 for retry.', {
          sessionId,
        });
      }
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const boundWorkspaceId = sessionRow.workspace_id;
    if (
      typeof boundWorkspaceId === 'string' &&
      boundWorkspaceId.trim() !== '' &&
      boundWorkspaceId !== tierWorkspaceId
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: canJoin, error: gateErr } = await supabase.rpc('can_join_live_session', {
      p_session_id: sessionId,
    });
    if (gateErr) {
      console.error('[live-video/token] Tier C: can_join_live_session', gateErr);
      return NextResponse.json({ error: 'Tier C authorization failed' }, { status: 500 });
    }
    if (canJoin !== true) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[DEBUG][API] Tier C: User not authorized for session', {
          sessionId,
          userId: user.id,
        });
      }
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Channel binding: `live_sessions` does not store `channel_id` today. The chat-flow
    // derivation is `bb-live-${workspaceId}-${shortId}` where `shortId` is `sessionId`
    // with dashes stripped, first 8 chars. We reconstruct + log a tripwire for telemetry,
    // but do NOT reject on mismatch yet — card / class / future flows may use other
    // derivations. Strict enforcement waits for a follow-up that adds `channel_id` to
    // `live_sessions` (or a server-derivation table) so all code paths agree.
    if (process.env.NODE_ENV === 'development') {
      const expectedShortId = sessionId.replace(/-/g, '').slice(0, 8);
      const expectedChannelId = `bb-live-${tierWorkspaceId}-${expectedShortId}`;
      console.log('[DEBUG][API] Tier C: Channel binding validation pending', {
        sessionId,
        requestedChannelId: channelId,
        expectedChannelId,
        match: expectedChannelId === channelId,
      });
    }
  }

  // Copilot suggestion ignored: keep the exact tripwire string, but gate it to dev to avoid noisy prod logs.
  if (process.env.NODE_ENV === 'development') {
    console.log('[DEBUG] Token API hit for channel:', channelId);
  }

  const uid = agoraUidFromUuid(user.id);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + TOKEN_TTL_SECONDS;

  let token: string;
  try {
    token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
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
