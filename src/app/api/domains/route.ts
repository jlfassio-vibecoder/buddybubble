import { NextResponse } from 'next/server';
import { createClient } from '@utils/supabase/server';

export const dynamic = 'force-dynamic';

function normalizeDomain(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  const slash = s.indexOf('/');
  if (slash >= 0) s = s.slice(0, slash);
  return s;
}

function buildVercelDomainsCollectionUrl(): string {
  const projectId = process.env.VERCEL_STOREFRONT_PROJECT_ID;
  if (!projectId) {
    throw new Error('VERCEL_STOREFRONT_PROJECT_ID not configured');
  }
  const url = new URL(`https://api.vercel.com/v10/projects/${projectId}/domains`);
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  if (teamId) url.searchParams.set('teamId', teamId);
  return url.toString();
}

function buildVercelDomainDeleteUrl(domain: string): string {
  const projectId = process.env.VERCEL_STOREFRONT_PROJECT_ID;
  if (!projectId) {
    throw new Error('VERCEL_STOREFRONT_PROJECT_ID not configured');
  }
  const url = new URL(
    `https://api.vercel.com/v10/projects/${projectId}/domains/${encodeURIComponent(domain)}`,
  );
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  if (teamId) url.searchParams.set('teamId', teamId);
  return url.toString();
}

async function assertWorkspaceAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[api/domains] assertWorkspaceAdmin workspace_members query', error);
    return { ok: false, status: 500, message: 'Internal server error' };
  }
  if (!data || (data.role !== 'admin' && data.role !== 'owner')) {
    return { ok: false, status: 403, message: 'Forbidden' };
  }
  return { ok: true };
}

export async function POST(request: Request) {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Vercel API not configured' }, { status: 503 });
  }

  let body: { workspace_id?: string; domain?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const workspaceId = body.workspace_id?.trim();
  const rawDomain = body.domain ?? '';
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: 'workspace_id required' }, { status: 400 });
  }

  const domain = normalizeDomain(rawDomain);
  if (!domain) {
    return NextResponse.json({ ok: false, error: 'domain required' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const adminCheck = await assertWorkspaceAdmin(supabase, workspaceId, user.id);
  if (!adminCheck.ok) {
    return NextResponse.json(
      { ok: false, error: adminCheck.message },
      { status: adminCheck.status },
    );
  }

  let url: string;
  try {
    url = buildVercelDomainsCollectionUrl();
  } catch (e) {
    console.error('[api/domains] POST buildVercelDomainsCollectionUrl', e);
    return NextResponse.json(
      { ok: false, error: 'Failed to update domain configuration on Vercel.' },
      { status: 503 },
    );
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: domain }),
  });

  const text = await res.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!res.ok) {
    console.error('[api/domains] Vercel POST domains failed', res.status, payload);
    return NextResponse.json(
      { ok: false, error: 'Failed to update domain configuration on Vercel.' },
      { status: res.status >= 400 && res.status < 600 ? res.status : 502 },
    );
  }

  return NextResponse.json({ ok: true, data: payload });
}

export async function DELETE(request: Request) {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Vercel API not configured' }, { status: 503 });
  }

  let body: { workspace_id?: string; domain?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const workspaceId = body.workspace_id?.trim();
  const rawDomain = body.domain ?? '';
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: 'workspace_id required' }, { status: 400 });
  }

  const domain = normalizeDomain(rawDomain);
  if (!domain) {
    return NextResponse.json({ ok: false, error: 'domain required' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const adminCheck = await assertWorkspaceAdmin(supabase, workspaceId, user.id);
  if (!adminCheck.ok) {
    return NextResponse.json(
      { ok: false, error: adminCheck.message },
      { status: adminCheck.status },
    );
  }

  let url: string;
  try {
    url = buildVercelDomainDeleteUrl(domain);
  } catch (e) {
    console.error('[api/domains] DELETE buildVercelDomainDeleteUrl', e);
    return NextResponse.json(
      { ok: false, error: 'Failed to update domain configuration on Vercel.' },
      { status: 503 },
    );
  }

  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await res.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!res.ok) {
    console.error('[api/domains] Vercel DELETE domain failed', res.status, payload);
    return NextResponse.json(
      { ok: false, error: 'Failed to update domain configuration on Vercel.' },
      { status: res.status >= 400 && res.status < 600 ? res.status : 502 },
    );
  }

  return NextResponse.json({ ok: true, data: payload });
}
