/**
 * POST /api/leads/track
 *
 * Records or refreshes an anonymous lead visit. Called client-side when a
 * visitor opens an invite link to a business/fitness workspace.
 *
 * - On first visit: inserts a new `leads` row.
 * - On repeat visit (same fingerprint): updates `last_seen_at`.
 * - If the visitor is authenticated: links `leads.user_id` to their account.
 *
 * No auth required — anonymous visitors are the whole point.
 * Writes use the service role key (no direct anon table access).
 *
 * Body: {
 *   workspaceId: string;
 *   inviteToken?: string;
 *   source?: 'qr' | 'link' | 'email' | 'sms' | 'direct';
 *   email?: string;         // pre-fill if the invite was email-targeted
 *   utmParams?: Record<string, string>;
 *   leadId?: string;        // pass back on repeat visits to avoid duplicates
 * }
 *
 * Response: { leadId: string }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@utils/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase-service-role';

const VALID_SOURCES = new Set(['qr', 'link', 'email', 'sms', 'direct']);

type TrackBody = {
  workspaceId?: string;
  inviteToken?: string;
  source?: string;
  email?: string;
  utmParams?: Record<string, string>;
  leadId?: string;
};

export async function POST(req: Request) {
  try {
    // ── Input ───────────────────────────────────────────────────────────────
    let body: TrackBody;
    try {
      body = (await req.json()) as TrackBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : '';
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    const source =
      typeof body.source === 'string' && VALID_SOURCES.has(body.source)
        ? body.source
        : 'direct';

    const inviteToken =
      typeof body.inviteToken === 'string' ? body.inviteToken.trim() || null : null;
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() || null : null;
    const utmParams =
      body.utmParams && typeof body.utmParams === 'object' ? body.utmParams : {};
    const existingLeadId =
      typeof body.leadId === 'string' ? body.leadId.trim() || null : null;

    // ── Get authenticated user if present (optional) ─────────────────────────
    // We use createClient() which reads the session cookie; it returns null
    // user when the visitor is unauthenticated — that's fine.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id ?? null;

    const db = createServiceRoleClient();

    // ── Verify workspace exists and requires subscription ────────────────────
    // Silently skip tracking for free workspace types (community/kids/class).
    const { data: workspace } = await db
      .from('workspaces')
      .select('category_type')
      .eq('id', workspaceId)
      .maybeSingle();

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    if (!['business', 'fitness'].includes(workspace.category_type)) {
      // Not an error — just nothing to track for free workspace types.
      return NextResponse.json({ leadId: null });
    }

    // ── Upsert lead ──────────────────────────────────────────────────────────
    const now = new Date().toISOString();

    if (existingLeadId) {
      // Repeat visit — refresh last_seen_at and link user if they've signed in
      const update: Record<string, unknown> = { last_seen_at: now };
      if (userId) update.user_id = userId;

      const { data: updated, error } = await db
        .from('leads')
        .update(update)
        .eq('id', existingLeadId)
        .eq('workspace_id', workspaceId) // prevent cross-workspace tampering
        .select('id')
        .maybeSingle();

      if (error || !updated) {
        // Lead ID invalid or belongs to a different workspace — create a new one
        return insertNewLead(db, {
          workspaceId,
          inviteToken,
          source,
          email,
          utmParams,
          userId,
          now,
        });
      }

      return NextResponse.json({ leadId: updated.id });
    }

    // First visit — insert new lead
    return insertNewLead(db, {
      workspaceId,
      inviteToken,
      source,
      email,
      utmParams,
      userId,
      now,
    });
  } catch (e) {
    console.error('[leads/track]', e);
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function insertNewLead(
  db: ReturnType<typeof createServiceRoleClient>,
  opts: {
    workspaceId: string;
    inviteToken: string | null;
    source: string;
    email: string | null;
    utmParams: Record<string, string>;
    userId: string | null;
    now: string;
  },
) {
  const { data: lead, error } = await db
    .from('leads')
    .insert({
      workspace_id: opts.workspaceId,
      invite_token: opts.inviteToken,
      source: opts.source,
      email: opts.email,
      utm_params: opts.utmParams,
      first_seen_at: opts.now,
      last_seen_at: opts.now,
      user_id: opts.userId,
    })
    .select('id')
    .single();

  if (error || !lead) {
    console.error('[leads/track] insert failed:', error);
    return NextResponse.json({ error: 'Failed to record lead' }, { status: 500 });
  }

  return NextResponse.json({ leadId: lead.id });
}
