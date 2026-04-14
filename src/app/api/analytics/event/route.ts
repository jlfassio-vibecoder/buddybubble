/**
 * POST /api/analytics/event
 *
 * Accepts a batch of analytics events from the authenticated browser client and
 * writes them to `analytics_events` using the service role. Inserts use the
 * signed-in user id from the session (client-supplied `user_id` is ignored).
 *
 * Body: { events: AnalyticsEventPayload[] }
 * Response: { ok: true } | { error: string }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@utils/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import type { AnalyticsEventPayload, EventType } from '@/lib/analytics/types';

const MAX_BATCH = 50;

const VALID_EVENT_TYPES = new Set<EventType>([
  // 'lead_captured' is intentionally excluded: it is server-only, emitted by
  // /api/leads/track (invite) and /api/leads/storefront-trial after server-side
  // validation. Client-submitted lead_captured would bypass validation.
  'auth_modal_opened',
  'signup_completed',
  'trial_started',
  'trial_converted',
  'trial_canceled',
  'subscription_canceled',
  'subscription_restarted',
  'feature_gate_hit',
  'premium_feature_used',
  'page_view',
  'session_start',
]);

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let body: { events?: unknown[] };
    try {
      body = (await req.json()) as { events?: unknown[] };
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const rawEvents = Array.isArray(body.events) ? body.events : [];
    if (rawEvents.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const capped = rawEvents.slice(0, MAX_BATCH);
    const rows: Record<string, unknown>[] = [];
    for (const raw of capped) {
      if (!raw || typeof raw !== 'object') continue;
      const e = raw as Partial<AnalyticsEventPayload>;
      if (!e.event_type || !VALID_EVENT_TYPES.has(e.event_type as EventType)) continue;

      rows.push({
        event_type: e.event_type,
        workspace_id: typeof e.workspace_id === 'string' ? e.workspace_id : null,
        user_id: user.id,
        lead_id: typeof e.lead_id === 'string' ? e.lead_id : null,
        session_id: typeof e.session_id === 'string' ? e.session_id : null,
        path: typeof e.path === 'string' ? e.path : null,
        metadata: e.metadata && typeof e.metadata === 'object' ? e.metadata : {},
      });
    }

    if (rows.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const workspaceIds = [
      ...new Set(
        rows
          .map((r) => r.workspace_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];

    let allowedWorkspaces = new Set<string>();
    if (workspaceIds.length > 0) {
      const { data: members } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .in('workspace_id', workspaceIds);

      allowedWorkspaces = new Set(
        (members ?? []).map((m) => m.workspace_id as string).filter(Boolean),
      );
    }

    const sanitized = rows.filter(
      (r) => !r.workspace_id || allowedWorkspaces.has(String(r.workspace_id)),
    );

    if (sanitized.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const db = createServiceRoleClient();
    const { error } = await db.from('analytics_events').insert(sanitized);
    if (error) {
      console.error('[analytics/event] insert failed:', error.message);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[analytics/event] handler error:', message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
