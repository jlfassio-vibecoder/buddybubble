/**
 * Workspace Analytics — owner-only view.
 * Shows funnel event counts, feature gate hits, and page views for the last 30 days.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@utils/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type FunnelRow = { event_type: string; count: number };
type GateRow = { feature_name: string; count: number };

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

export default async function WorkspaceAnalyticsPage({
  params,
}: {
  params: Promise<{ workspace_id: string }>;
}) {
  const { workspace_id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Owner-only gate
  const { data: mem } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspace_id)
    .eq('user_id', user.id)
    .maybeSingle();

  const role = (mem as { role?: string } | null)?.role;
  if (!role) redirect('/app');
  if (role !== 'owner') {
    redirect(`/app/${workspace_id}`);
  }

  const { data: ws } = await supabase
    .from('workspaces')
    .select('name')
    .eq('id', workspace_id)
    .maybeSingle();

  const workspaceName = (ws as { name?: string } | null)?.name?.trim() || 'Workspace';

  // ── Pull analytics data directly (same query as the API route) ───────────
  const db = createServiceRoleClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: funnelRows }, { data: gateRows }, { count: pageViews }] = await Promise.all([
    db
      .from('analytics_events')
      .select('event_type')
      .eq('workspace_id', workspace_id)
      .in('event_type', Object.keys(FUNNEL_LABELS))
      .gte('created_at', since),
    db
      .from('analytics_events')
      .select('metadata')
      .eq('workspace_id', workspace_id)
      .eq('event_type', 'feature_gate_hit')
      .gte('created_at', since),
    db
      .from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspace_id)
      .eq('event_type', 'page_view')
      .gte('created_at', since),
  ]);

  // Aggregate funnel
  const funnelCounts: Record<string, number> = {};
  for (const row of funnelRows ?? []) {
    funnelCounts[row.event_type] = (funnelCounts[row.event_type] ?? 0) + 1;
  }
  const funnel: FunnelRow[] = Object.keys(FUNNEL_LABELS)
    .map((k) => ({ event_type: k, count: funnelCounts[k] ?? 0 }))
    .filter((r) => r.count > 0);

  // Aggregate gate hits
  const gateCounts: Record<string, number> = {};
  for (const row of gateRows ?? []) {
    const featureName =
      row.metadata && typeof row.metadata === 'object' && 'feature_name' in row.metadata
        ? String((row.metadata as Record<string, unknown>).feature_name)
        : 'unknown';
    gateCounts[featureName] = (gateCounts[featureName] ?? 0) + 1;
  }
  const gates: GateRow[] = Object.entries(gateCounts)
    .map(([feature_name, count]) => ({ feature_name, count }))
    .sort((a, b) => b.count - a.count);

  const totalPageViews = pageViews ?? 0;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-auto bg-background p-4 md:p-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6">
          <Link
            href={`/app/${workspace_id}`}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            ← Back to workspace
          </Link>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">{workspaceName} — last 30 days</p>
        </div>

        {/* Summary strip */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-3xl font-bold tabular-nums">{totalPageViews}</p>
              <p className="mt-1 text-sm text-muted-foreground">Page views</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-3xl font-bold tabular-nums">
                {funnelCounts['lead_captured'] ?? 0}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Leads captured</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-3xl font-bold tabular-nums">
                {funnelCounts['trial_started'] ?? 0}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Trials started</p>
            </CardContent>
          </Card>
        </div>

        {/* Funnel breakdown */}
        {funnel.length > 0 ? (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Funnel events</CardTitle>
              <CardDescription>Lifecycle events triggered in this workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border text-sm">
                {funnel.map((r) => (
                  <li key={r.event_type} className="flex items-center justify-between py-2">
                    <span className="text-muted-foreground">
                      {FUNNEL_LABELS[r.event_type] ?? r.event_type}
                    </span>
                    <span className="font-medium tabular-nums">{r.count}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {/* Gate hits */}
        {gates.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Feature gate hits</CardTitle>
              <CardDescription>
                How often users clicked a locked feature (showing upgrade intent).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border text-sm">
                {gates.map((r) => (
                  <li key={r.feature_name} className="flex items-center justify-between py-2">
                    <span className="text-muted-foreground">
                      {GATE_FEATURE_LABELS[r.feature_name] ?? r.feature_name}
                    </span>
                    <span className="font-medium tabular-nums">{r.count}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {funnel.length === 0 && gates.length === 0 && totalPageViews === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No analytics events recorded yet. Events will appear here as members use your
              workspace.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
