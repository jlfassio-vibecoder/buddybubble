/**
 * GET /api/analytics/admin
 *
 * Founder-only cross-workspace funnel dashboard.
 * Requires `users.is_admin = true` (checked via service role; no JWT claim needed).
 *
 * Returns aggregate funnel counts + top gate hits across ALL workspaces for
 * the last 30 days (default) or the number of days specified via ?days=N (max 90).
 *
 * Response: {
 *   windowDays: number;
 *   funnel: { event_type: string; count: number }[];
 *   topGates: { feature_name: string; count: number }[];
 *   activeWorkspaces: number;
 * }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@utils/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase-service-role';

const MAX_WINDOW_DAYS = 90;
const DEFAULT_WINDOW_DAYS = 30;

const FUNNEL_EVENT_TYPES = [
  'lead_captured',
  'auth_modal_opened',
  'signup_completed',
  'trial_started',
  'trial_converted',
  'trial_canceled',
  'subscription_canceled',
  'subscription_restarted',
];

export async function GET(req: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // ── Admin guard (service role check — not in JWT) ─────────────────────────
  const db = createServiceRoleClient();
  const { data: userRow } = await db
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (!(userRow as { is_admin?: boolean } | null)?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Parse window ──────────────────────────────────────────────────────────
  const url = new URL(req.url);
  const rawDays = parseInt(url.searchParams.get('days') ?? '', 10);
  const windowDays =
    Number.isFinite(rawDays) && rawDays > 0 && rawDays <= MAX_WINDOW_DAYS
      ? rawDays
      : DEFAULT_WINDOW_DAYS;

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  // ── Funnel counts ─────────────────────────────────────────────────────────
  const { data: funnelRows } = await db
    .from('analytics_events')
    .select('event_type')
    .in('event_type', FUNNEL_EVENT_TYPES)
    .gte('created_at', since);

  const funnelCounts: Record<string, number> = {};
  for (const row of funnelRows ?? []) {
    funnelCounts[row.event_type] = (funnelCounts[row.event_type] ?? 0) + 1;
  }
  const funnel = FUNNEL_EVENT_TYPES.map((et) => ({ event_type: et, count: funnelCounts[et] ?? 0 }));

  // ── Feature gate hits ─────────────────────────────────────────────────────
  const { data: gateRows } = await db
    .from('analytics_events')
    .select('metadata')
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
  const topGates = Object.entries(gateCounts)
    .map(([feature_name, count]) => ({ feature_name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // ── Active workspaces (had at least one event in window) ──────────────────
  const { data: workspaceRows } = await db
    .from('analytics_events')
    .select('workspace_id')
    .gte('created_at', since)
    .not('workspace_id', 'is', null);

  const uniqueWorkspaces = new Set((workspaceRows ?? []).map((r) => r.workspace_id));

  return NextResponse.json({
    windowDays,
    funnel,
    topGates,
    activeWorkspaces: uniqueWorkspaces.size,
  });
}
