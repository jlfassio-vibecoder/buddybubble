/**
 * POST /api/leads/track
 *
 * Records or refreshes an anonymous lead visit. Called client-side when a
 * visitor opens an invite link to a business/fitness workspace.
 *
 * `metadata.acquisition_context`: `in_person` when the invite was created as a
 * shareable link or QR (host and guest typically together); `online` for email/SMS
 * invites (delivered remotely).
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
 * Response: { leadId: string | null } — null when the workspace does not track leads (non–business/fitness).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@utils/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import { trackServerEvent } from '@/lib/analytics/server';
import { acquisitionContextFromInviteType } from '@/lib/lead-capture-analytics';

const VALID_SOURCES = new Set(['qr', 'link', 'email', 'sms', 'direct']);

function normalizeUtmParams(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
    else if (v != null) out[k] = String(v);
  }
  return out;
}

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
      typeof body.source === 'string' && VALID_SOURCES.has(body.source) ? body.source : 'direct';

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() || null : null;
    const utmParams = normalizeUtmParams(body.utmParams);
    const existingLeadId = typeof body.leadId === 'string' ? body.leadId.trim() || null : null;

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
      return NextResponse.json({ error: 'Socialspace not found' }, { status: 404 });
    }

    if (!['business', 'fitness'].includes(workspace.category_type)) {
      // Not an error — just nothing to track for free workspace types.
      return NextResponse.json({ leadId: null });
    }

    const inviteToken = typeof body.inviteToken === 'string' ? body.inviteToken.trim() : '';
    if (!inviteToken) {
      return NextResponse.json({ error: 'inviteToken is required' }, { status: 400 });
    }

    const { data: invitation } = await db
      .from('invitations')
      .select('workspace_id, revoked_at, expires_at, max_uses, uses_count, invite_type')
      .eq('token', inviteToken)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (!invitation) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }
    if (invitation.revoked_at != null) {
      return NextResponse.json({ error: 'Invite is no longer valid' }, { status: 400 });
    }
    const expired = new Date(invitation.expires_at).getTime() <= Date.now();
    if (expired) {
      return NextResponse.json({ error: 'Invite has expired' }, { status: 400 });
    }
    if (invitation.uses_count >= invitation.max_uses) {
      return NextResponse.json({ error: 'Invite has no remaining uses' }, { status: 400 });
    }

    const acquisitionContext = acquisitionContextFromInviteType(
      (invitation as { invite_type?: string }).invite_type,
    );

    // ── Upsert lead ──────────────────────────────────────────────────────────
    const now = new Date().toISOString();

    if (existingLeadId) {
      // Repeat visit — refresh last_seen_at and link user if they've signed in
      const { data: leadRow } = await db
        .from('leads')
        .select('metadata')
        .eq('id', existingLeadId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();

      const prevMeta =
        leadRow?.metadata &&
        typeof leadRow.metadata === 'object' &&
        !Array.isArray(leadRow.metadata)
          ? (leadRow.metadata as Record<string, unknown>)
          : {};

      const update: Record<string, unknown> = {
        last_seen_at: now,
        metadata: {
          ...prevMeta,
          acquisition_context: acquisitionContext,
        },
      };
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
          acquisitionContext,
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
      acquisitionContext,
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
    acquisitionContext: 'in_person' | 'online';
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
      metadata: { acquisition_context: opts.acquisitionContext },
    })
    .select('id')
    .single();

  if (error || !lead) {
    console.error('[leads/track] insert failed:', error);
    return NextResponse.json({ error: 'Failed to record lead' }, { status: 500 });
  }

  await trackServerEvent('lead_captured', {
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    leadId: lead.id,
    metadata: {
      acquisition_context: opts.acquisitionContext,
      source: opts.source,
    },
  });

  return NextResponse.json({ leadId: lead.id });
}
