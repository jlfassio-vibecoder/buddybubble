/**
 * /admin/growth — Founder growth dashboard.
 *
 * Displays cross-workspace funnel metrics and feature gate hit counts for the
 * last 30 days. Access is restricted to users with `is_admin = true`
 * (enforced by the (admin) layout).
 */

import { createServiceRoleClient } from '@/lib/supabase-service-role';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const WINDOW_DAYS = 30;

const FUNNEL_EVENT_TYPES = [
  'lead_captured',
  'auth_modal_opened',
  'signup_completed',
  'trial_started',
  'trial_converted',
  'trial_canceled',
  'subscription_canceled',
  'subscription_restarted',
] as const;

const FUNNEL_LABELS: Record<string, string> = {
  lead_captured: 'Leads captured',
  auth_modal_opened: 'Auth modal opens',
  signup_completed: 'Sign-ups',
  trial_started: 'Trials started',
  trial_converted: 'Trials converted',
  trial_canceled: 'Trials canceled',
  subscription_canceled: 'Subscriptions canceled',
  subscription_restarted: 'Subscriptions restarted',
};

const GATE_FEATURE_LABELS: Record<string, string> = {
  ai: 'AI generation',
  analytics: 'Analytics',
  export: 'Data export',
  record_data: 'Recording data',
  custom_branding: 'Custom branding',
  create_workspace: 'Create workspace',
};

export default async function AdminGrowthPage() {
  const db = createServiceRoleClient();
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: funnelRows }, { data: gateRows }, { count: pageViews }, { data: workspaceRows }] =
    await Promise.all([
      db
        .from('analytics_events')
        .select('event_type')
        .in('event_type', [...FUNNEL_EVENT_TYPES])
        .gte('created_at', since),
      db
        .from('analytics_events')
        .select('metadata')
        .eq('event_type', 'feature_gate_hit')
        .gte('created_at', since),
      db
        .from('analytics_events')
        .select('*', { count: 'exact', head: true })
        .eq('event_type', 'page_view')
        .gte('created_at', since),
      db
        .from('analytics_events')
        .select('workspace_id')
        .gte('created_at', since)
        .not('workspace_id', 'is', null),
    ]);

  // Funnel
  const funnelCounts: Record<string, number> = {};
  for (const row of funnelRows ?? []) {
    funnelCounts[row.event_type] = (funnelCounts[row.event_type] ?? 0) + 1;
  }

  // Gates
  const gateCounts: Record<string, number> = {};
  for (const row of gateRows ?? []) {
    const featureName =
      row.metadata && typeof row.metadata === 'object' && 'feature_name' in row.metadata
        ? String((row.metadata as Record<string, unknown>).feature_name)
        : 'unknown';
    gateCounts[featureName] = (gateCounts[featureName] ?? 0) + 1;
  }
  const sortedGates = Object.entries(gateCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  // Active workspaces
  const uniqueWorkspaces = new Set((workspaceRows ?? []).map((r) => r.workspace_id));

  // Conversion rate (trial_started / signup_completed)
  const signups = funnelCounts['signup_completed'] ?? 0;
  const trialsStarted = funnelCounts['trial_started'] ?? 0;
  const trialsConverted = funnelCounts['trial_converted'] ?? 0;
  const conversionRate = signups > 0 ? `${Math.round((trialsStarted / signups) * 100)}%` : '—';
  const trialConvertRate =
    trialsStarted > 0 ? `${Math.round((trialsConverted / trialsStarted) * 100)}%` : '—';

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Growth Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All workspaces — last {WINDOW_DAYS} days
          </p>
        </div>

        {/* KPI strip */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-3xl font-bold tabular-nums">{pageViews ?? 0}</p>
              <p className="mt-1 text-sm text-muted-foreground">Page views</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-3xl font-bold tabular-nums">{uniqueWorkspaces.size}</p>
              <p className="mt-1 text-sm text-muted-foreground">Active workspaces</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-3xl font-bold tabular-nums">{conversionRate}</p>
              <p className="mt-1 text-sm text-muted-foreground">Sign-up → trial</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-3xl font-bold tabular-nums">{trialConvertRate}</p>
              <p className="mt-1 text-sm text-muted-foreground">Trial → paid</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Funnel */}
          <Card>
            <CardHeader>
              <CardTitle>Funnel</CardTitle>
              <CardDescription>Lifecycle event totals across all workspaces.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border text-sm">
                {FUNNEL_EVENT_TYPES.map((et) => (
                  <li key={et} className="flex items-center justify-between py-2">
                    <span className="text-muted-foreground">{FUNNEL_LABELS[et] ?? et}</span>
                    <span className="font-medium tabular-nums">{funnelCounts[et] ?? 0}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Gate hits */}
          <Card>
            <CardHeader>
              <CardTitle>Feature gate hits</CardTitle>
              <CardDescription>
                Top locked features clicked — signals upgrade intent.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sortedGates.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No gate hits recorded yet.
                </p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {sortedGates.map(([featureName, count]) => (
                    <li key={featureName} className="flex items-center justify-between py-2">
                      <span className="text-muted-foreground">
                        {GATE_FEATURE_LABELS[featureName] ?? featureName}
                      </span>
                      <span className="font-medium tabular-nums">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
