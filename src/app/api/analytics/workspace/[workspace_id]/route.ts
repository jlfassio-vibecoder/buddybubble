/**
 * GET /api/analytics/workspace/[workspace_id]
 *
 * Returns aggregated analytics data for the workspace owner's dashboard.
 * Only the workspace owner (role = 'owner') may call this endpoint.
 *
 * Response: { funnel: FunnelRow[], gates: GateRow[], pageViews: number }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@utils/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase-service-role';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ workspace_id: string }> },
) {
  const { workspace_id } = await params;

  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // ── Verify workspace owner ────────────────────────────────────────────────
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspace_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership || membership.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = createServiceRoleClient();

  // ── Funnel events (last 30 days) ──────────────────────────────────────────
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: funnelRows } = await db
    .from('analytics_events')
    .select('event_type, created_at')
    .eq('workspace_id', workspace_id)
    .in('event_type', [
      'lead_captured',
      'auth_modal_opened',
      'signup_completed',
      'trial_started',
      'trial_converted',
      'trial_canceled',
      'subscription_canceled',
      'subscription_restarted',
    ])
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  // Aggregate funnel counts by event_type
  const funnelCounts: Record<string, number> = {};
  for (const row of funnelRows ?? []) {
    funnelCounts[row.event_type] = (funnelCounts[row.event_type] ?? 0) + 1;
  }
  const funnel = Object.entries(funnelCounts).map(([event_type, count]) => ({
    event_type,
    count,
  }));

  // ── Feature gate hits ─────────────────────────────────────────────────────
  const { data: gateRows } = await db
    .from('analytics_events')
    .select('metadata')
    .eq('workspace_id', workspace_id)
    .eq('event_type', 'feature_gate_hit')
    .gte('created_at', since);

  const gateCounts: Record<string, number> = {};
  for (const row of gateRows ?? []) {
    const featureName =
      row.metadata && typeof row.metadata === 'object' && 'feature_name' in row.metadata
        ? String((row.metadata as Record<string, unknown>).feature_name)
        : 'unknown';
    gateCounts[featureName] = (gateCounts[featureName] ?? 0) + 1;
  }
  const gates = Object.entries(gateCounts).map(([feature_name, count]) => ({
    feature_name,
    count,
  }));

  // ── Page views ────────────────────────────────────────────────────────────
  const { count: pageViews } = await db
    .from('analytics_events')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspace_id)
    .eq('event_type', 'page_view')
    .gte('created_at', since);

  return NextResponse.json({
    funnel,
    gates,
    pageViews: pageViews ?? 0,
    windowDays: 30,
  });
}
