import { NextResponse } from 'next/server';
import type { PostgrestError } from '@supabase/supabase-js';
import { getAllowedDemoWorkspaceIds } from '@/lib/demo-workspace-allowlist';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import { createClient } from '@utils/supabase/server';

const DEMO_JOIN_CLIENT_ERROR = 'Failed to join demo workspace.';

function jsonFromSupabaseError(err: PostgrestError, step: 'profile' | 'membership'): Response {
  const isInvalidKey =
    typeof err.message === 'string' &&
    (err.message.includes('Invalid API key') || err.message.includes('JWT'));

  if (isInvalidKey) {
    console.error(
      `[demo/join] ${step}: Supabase rejected the service role key — copy service_role from Supabase → Project Settings → API (same project as NEXT_PUBLIC_SUPABASE_URL).`,
      err,
    );
    return NextResponse.json({ error: DEMO_JOIN_CLIENT_ERROR }, { status: 503 });
  }

  console.error(`[demo/join] ${step}`, err);
  return NextResponse.json({ error: DEMO_JOIN_CLIENT_ERROR }, { status: 500 });
}

export async function POST(request: Request) {
  const allowed = getAllowedDemoWorkspaceIds();
  if (allowed.length === 0) {
    return NextResponse.json(
      {
        error:
          'Demo workspace is not configured (set DEMO_WORKSPACE_IDS or NEXT_PUBLIC_DEMO_WORKSPACE_ID).',
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body.' }, { status: 400 });
  }

  const user_id = (body as { user_id?: unknown }).user_id;
  const workspace_id = (body as { workspace_id?: unknown }).workspace_id;
  if (typeof user_id !== 'string' || typeof workspace_id !== 'string') {
    return NextResponse.json({ error: 'user_id and workspace_id are required.' }, { status: 400 });
  }

  if (!allowed.includes(workspace_id)) {
    return NextResponse.json({ error: 'Invalid demo workspace.' }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== user_id) {
    return NextResponse.json({ error: 'Sign in required or user mismatch.' }, { status: 401 });
  }

  let service;
  try {
    service = createServiceRoleClient();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[demo/join] createServiceRoleClient:', detail, e);
    return NextResponse.json({ error: DEMO_JOIN_CLIENT_ERROR }, { status: 503 });
  }

  // workspace_members.user_id FK → public.users, not auth.users alone. Anonymous (or legacy) auth
  // users may exist without a profile row; upsert a minimal row before membership insert.
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const fullName =
    (typeof meta?.full_name === 'string' && meta.full_name) ||
    (typeof meta?.name === 'string' && meta.name) ||
    '';
  const avatarUrl =
    typeof meta?.avatar_url === 'string' && meta.avatar_url ? meta.avatar_url : null;

  const { error: profileError } = await service.from('users').upsert(
    {
      id: user.id,
      email: user.email ?? null,
      full_name: fullName,
      avatar_url: avatarUrl,
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );

  if (profileError) {
    return jsonFromSupabaseError(profileError, 'profile');
  }

  const { error } = await service
    .from('workspace_members')
    .upsert({ workspace_id, user_id, role: 'member' }, { onConflict: 'workspace_id,user_id' });

  if (error) {
    return jsonFromSupabaseError(error, 'membership');
  }

  return NextResponse.json({ ok: true });
}
