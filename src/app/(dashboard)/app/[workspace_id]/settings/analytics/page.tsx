/**
 * Workspace Analytics — owner-only view.
 * Shows funnel event counts, feature gate hits, and page views for the last 30 days.
 *
 * Two distinct sections keep workspace-growth events visually separated from
 * platform-subscription events. See docs/technical-design-dual-lead-capture-workflows-v1.md.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@utils/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type FunnelRow = { event_type: string; count: number };
type GateRow = { feature_name: string; count: number };

// Workspace growth events — what invitees did inside this workspace.
const WORKSPACE_LEAD_EVENT_TYPES = [
  'lead_captured',
  'auth_modal_opened',
  'signup_completed',
] as const;

const WORKSPACE_LEAD_LABELS: Record<string, string> = {
  lead_captured: 'Invite leads',
  auth_modal_opened: 'Auth modal opens',
  signup_completed: 'Sign-ups',
};

// Platform subscription events — this workspace owner's BuddyBubble account activity.
const PLATFORM_SUBSCRIPTION_EVENT_TYPES = [
  'trial_started',
  'trial_converted',
  'trial_canceled',
  'subscription_canceled',
  'subscription_restarted',
] as const;

const PLATFORM_SUBSCRIPTION_LABELS: Record<string, string> = {
  trial_started: 'Trial started',
  trial_converted: 'Trial converted',
  trial_canceled: 'Trial canceled',
  subscription_canceled: 'Subscription canceled',
  subscription_restarted: 'Subscription restarted',
};

const ALL_FUNNEL_TYPES = [
  ...WORKSPACE_LEAD_EVENT_TYPES,
  ...PLATFORM_SUBSCRIPTION_EVENT_TYPES,
] as const;

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
      .in('event_type', [...ALL_FUNNEL_TYPES] as string[])
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

  const workspaceLeadFunnel: FunnelRow[] = WORKSPACE_LEAD_EVENT_TYPES.map((k) => ({
    event_type: k,
    count: funnelCounts[k] ?? 0,
  })).filter((r) => r.count > 0);

  const platformSubFunnel: FunnelRow[] = PLATFORM_SUBSCRIPTION_EVENT_TYPES.map((k) => ({
    event_type: k,
    count: funnelCounts[k] ?? 0,
  })).filter((r) => r.count > 0);

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
  const hasAnyData =
    workspaceLeadFunnel.length > 0 ||
    platformSubFunnel.length > 0 ||
    gates.length > 0 ||
    totalPageViews > 0;

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
              <p className="mt-1 text-sm text-muted-foreground">Invite leads</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-3xl font-bold tabular-nums">
                {funnelCounts['trial_started'] ?? 0}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Trial started</p>
            </CardContent>
          </Card>
        </div>

        {/* Workspace lead funnel */}
        {workspaceLeadFunnel.length > 0 ? (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Workspace leads</CardTitle>
              <CardDescription>
                People who visited via your invite link, last 30 days.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border text-sm">
                {workspaceLeadFunnel.map((r) => (
                  <li key={r.event_type} className="flex items-center justify-between py-2">
                    <span className="text-muted-foreground">
                      {WORKSPACE_LEAD_LABELS[r.event_type] ?? r.event_type}
                    </span>
                    <span className="font-medium tabular-nums">{r.count}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {/* Platform subscription events */}
        {platformSubFunnel.length > 0 ? (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Your subscription</CardTitle>
              <CardDescription>Your BuddyBubble account activity, last 30 days.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border text-sm">
                {platformSubFunnel.map((r) => (
                  <li key={r.event_type} className="flex items-center justify-between py-2">
                    <span className="text-muted-foreground">
                      {PLATFORM_SUBSCRIPTION_LABELS[r.event_type] ?? r.event_type}
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

        {!hasAnyData ? (
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
