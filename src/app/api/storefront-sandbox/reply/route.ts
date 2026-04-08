import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import { createClient } from '@utils/supabase/server';

const CHANNELS = new Set(['welcome', 'qa']);

function parseModeratorIds(): string[] {
  const raw = process.env.STOREFRONT_SANDBOX_OWNER_USER_IDS?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function POST(request: Request) {
  const moderators = parseModeratorIds();
  if (moderators.length === 0) {
    return NextResponse.json(
      {
        error: 'Storefront sandbox replies are not configured (STOREFRONT_SANDBOX_OWNER_USER_IDS).',
      },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }
  if (!moderators.includes(user.id)) {
    return NextResponse.json({ error: 'Not allowed to post team replies.' }, { status: 403 });
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
  const channel_key = (body as { channel_key?: string }).channel_key;
  const text = (body as { body?: string }).body;
  if (typeof channel_key !== 'string' || !CHANNELS.has(channel_key)) {
    return NextResponse.json({ error: 'Invalid channel_key.' }, { status: 400 });
  }
  if (typeof text !== 'string') {
    return NextResponse.json({ error: 'Invalid body text.' }, { status: 400 });
  }
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 2000) {
    return NextResponse.json({ error: 'Message length invalid.' }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('users')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  const displayName =
    (profile?.full_name && profile.full_name.trim()) || user.email?.split('@')[0] || 'BuddyBubble';

  let service;
  try {
    service = createServiceRoleClient();
  } catch (e) {
    console.error('[storefront-sandbox/reply] createServiceRoleClient', e);
    return NextResponse.json({ error: 'Failed to save reply.' }, { status: 503 });
  }

  const { data: row, error } = await service
    .from('storefront_sandbox_messages')
    .insert({
      channel_key,
      author_kind: 'team',
      body: trimmed,
      display_name: displayName,
      guest_session_id: null,
    })
    .select('id, created_at, channel_key, author_kind, guest_session_id, display_name, body')
    .single();

  if (error) {
    console.error('[storefront-sandbox/reply]', error);
    return NextResponse.json({ error: 'Failed to save reply.' }, { status: 500 });
  }

  return NextResponse.json({ message: row });
}
