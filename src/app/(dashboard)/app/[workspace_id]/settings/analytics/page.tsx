/**
 * Workspace Analytics — owner-only view.
 * Shows funnel event counts, feature gate hits, and page views for the last 30 days.
 */
// Copilot suggestion ignored: PR descriptions are edited on GitHub, not in application source.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@utils/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LeadCaptureSegmentCards } from '@/components/analytics/lead-capture-segment-cards';
import { INVITE_JOURNEY_STEP_LABELS, type InviteJourneyStep } from '@/lib/analytics/invite-journey';
import {
  formatUtmParams,
  inviteTokenSuffix,
  resolveLeadSegment,
  type LeadCaptureDisplayRow,
} from '@/lib/lead-capture-analytics';
import type { Json } from '@/types/database';

type FunnelRow = { event_type: string; count: number };
type GateRow = { feature_name: string; count: number };

type InviteJourneyRow = {
  created_at: string;
  step: string;
  step_label: string;
  invite_channel: string | null;
  detail_summary: string;
};

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
    .select('name, category_type')
    .eq('id', workspace_id)
    .maybeSingle();

  const workspaceName = (ws as { name?: string } | null)?.name?.trim() || 'Workspace';
  const categoryType = (ws as { category_type?: string } | null)?.category_type;
  const isGrowthLeadWorkspace = categoryType === 'business' || categoryType === 'fitness';

  // ── Pull analytics data directly (same query as the API route) ───────────
  const db = createServiceRoleClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  /** For business/fitness, `leads` row count is source of truth for `lead_captured` — exclude duplicate event rows. */
  const funnelEventTypesForQuery: string[] = isGrowthLeadWorkspace
    ? Object.keys(FUNNEL_LABELS).filter((k) => k !== 'lead_captured')
    : Object.keys(FUNNEL_LABELS);

  const [
    { data: funnelRows },
    { data: gateRows },
    { count: pageViews },
    { data: inviteJourneyRows },
  ] = await Promise.all([
    db
      .from('analytics_events')
      .select('event_type')
      .eq('workspace_id', workspace_id)
      .in('event_type', funnelEventTypesForQuery)
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
    db
      .from('analytics_events')
      .select('created_at, metadata')
      .eq('workspace_id', workspace_id)
      .eq('event_type', 'invite_journey_step')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(150),
  ]);

  // Aggregate funnel
  const funnelCounts: Record<string, number> = {};
  for (const row of funnelRows ?? []) {
    funnelCounts[row.event_type] = (funnelCounts[row.event_type] ?? 0) + 1;
  }
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

  let inPersonLeadRows: LeadCaptureDisplayRow[] = [];
  let onlineLeadRows: LeadCaptureDisplayRow[] = [];
  if (isGrowthLeadWorkspace) {
    // Copilot suggestion ignored: LIMIT without matching SQL aggregates would undercount segment cards relative to the summary total; add a capped query when totals move server-side.
    const { data: rawLeads } = await db
      .from('leads')
      .select(
        'id, invite_token, source, email, utm_params, first_seen_at, last_seen_at, user_id, metadata',
      )
      .eq('workspace_id', workspace_id)
      .gte('first_seen_at', since)
      .order('first_seen_at', { ascending: false });

    const userIds = [
      ...new Set(
        (rawLeads ?? [])
          .map((r) => (r as { user_id?: string | null }).user_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];

    const usersById: Record<string, { full_name: string | null; email: string | null }> = {};
    if (userIds.length > 0) {
      const { data: userRows } = await db
        .from('users')
        .select('id, full_name, email')
        .in('id', userIds);
      for (const u of userRows ?? []) {
        const row = u as { id: string; full_name: string | null; email: string | null };
        usersById[row.id] = { full_name: row.full_name, email: row.email };
      }
    }

    const inviteTokens = [
      ...new Set(
        (rawLeads ?? [])
          .map((r) => (r as { invite_token?: string | null }).invite_token)
          .filter((t): t is string => typeof t === 'string' && t.length > 0),
      ),
    ];
    const inviteTypeByToken = new Map<string, string>();
    if (inviteTokens.length > 0) {
      const { data: invitationRows } = await db
        .from('invitations')
        .select('token, invite_type')
        .eq('workspace_id', workspace_id)
        .in('token', inviteTokens);
      for (const inv of invitationRows ?? []) {
        const row = inv as { token: string; invite_type: string };
        inviteTypeByToken.set(row.token, row.invite_type);
      }
    }

    const mapped: LeadCaptureDisplayRow[] = (rawLeads ?? []).map((raw) => {
      const l = raw as {
        id: string;
        invite_token: string | null;
        source: string | null;
        email: string | null;
        utm_params: unknown;
        first_seen_at: string;
        last_seen_at: string;
        user_id: string | null;
        metadata: unknown;
      };
      const inviteType =
        l.invite_token && inviteTypeByToken.has(l.invite_token)
          ? inviteTypeByToken.get(l.invite_token)
          : undefined;
      const segment = resolveLeadSegment(l.metadata as Json, inviteType);
      const prof = l.user_id ? usersById[l.user_id] : undefined;
      const displayName = prof?.full_name?.trim() || null;
      const email = prof?.email?.trim() || l.email?.trim() || null;
      return {
        id: l.id,
        displayName,
        email,
        firstSeenAt: l.first_seen_at,
        lastSeenAt: l.last_seen_at,
        source: l.source ?? '—',
        utmSummary: formatUtmParams(l.utm_params as Json),
        segment,
        inviteSuffix: inviteTokenSuffix(l.invite_token),
        hasLinkedUser: Boolean(l.user_id),
      };
    });

    inPersonLeadRows = mapped.filter((r) => r.segment === 'in_person');
    onlineLeadRows = mapped.filter((r) => r.segment === 'online');
  }

  if (isGrowthLeadWorkspace) {
    funnelCounts['lead_captured'] = inPersonLeadRows.length + onlineLeadRows.length;
  }

  const funnel: FunnelRow[] = Object.keys(FUNNEL_LABELS)
    .map((k) => ({ event_type: k, count: funnelCounts[k] ?? 0 }))
    .filter((r) => r.count > 0);

  const inviteJourney: InviteJourneyRow[] = (inviteJourneyRows ?? []).map((row) => {
    const meta =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const step = typeof meta.step === 'string' ? meta.step : 'unknown';
    const stepLabel =
      step in INVITE_JOURNEY_STEP_LABELS
        ? INVITE_JOURNEY_STEP_LABELS[step as InviteJourneyStep]
        : step;
    const inviteChannel = typeof meta.invite_channel === 'string' ? meta.invite_channel : null;
    const detailParts: string[] = [];
    for (const [k, v] of Object.entries(meta)) {
      if (k === 'step' || k === 'invitation_id' || k === 'invite_channel') continue;
      if (v === undefined || v === null) continue;
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      if (s.length > 120) detailParts.push(`${k}: ${s.slice(0, 117)}…`);
      else detailParts.push(`${k}: ${s}`);
    }
    return {
      created_at: row.created_at,
      step,
      step_label: stepLabel,
      invite_channel: inviteChannel,
      detail_summary: detailParts.length ? detailParts.join(' · ') : '—',
    };
  });

  /** Growth workspaces: count rows in `leads` (same window as segment cards). Else: funnel `lead_captured` events. */
  const leadsCapturedDisplay = isGrowthLeadWorkspace
    ? inPersonLeadRows.length + onlineLeadRows.length
    : (funnelCounts['lead_captured'] ?? 0);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-auto bg-background p-4 md:p-8">
      <div className="mx-auto w-full max-w-4xl">
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
              <p className="text-3xl font-bold tabular-nums">{leadsCapturedDisplay}</p>
              <p className="mt-1 text-sm text-muted-foreground">Leads captured</p>
              {isGrowthLeadWorkspace ? (
                <p className="mt-2 text-xs leading-snug text-muted-foreground">
                  Invite visits count as leads. Link and QR invites are recorded as in-person
                  touchpoints; email and SMS as online delivery.
                </p>
              ) : null}
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

        {isGrowthLeadWorkspace ? (
          <LeadCaptureSegmentCards
            inPersonCount={inPersonLeadRows.length}
            onlineCount={onlineLeadRows.length}
            inPersonRows={inPersonLeadRows}
            onlineRows={onlineLeadRows}
          />
        ) : null}

        {/* Invite / QR journey (newest first) — high-signal for support */}
        {inviteJourney.length > 0 ? (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Invite &amp; QR link activity</CardTitle>
              <CardDescription>
                Step-by-step path for invite links (newest first). Use this to see whether someone
                opened the invite, went through login, or hit errors—so you can guide them without
                creating duplicate accounts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3">When (UTC)</th>
                      <th className="py-2 pr-3">Step</th>
                      <th className="py-2 pr-3">Channel</th>
                      <th className="py-2">Details</th>
                    </tr>
                  </thead>
                  <tbody className="align-top">
                    {inviteJourney.map((r, idx) => (
                      <tr
                        key={`${idx}-${r.created_at}-${r.step}`}
                        className="border-b border-border/80"
                      >
                        <td className="py-2 pr-3 whitespace-nowrap tabular-nums text-muted-foreground">
                          {new Date(r.created_at).toISOString().slice(0, 16).replace('T', ' ')}
                        </td>
                        <td className="py-2 pr-3 text-foreground">{r.step_label}</td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {r.invite_channel ?? '—'}
                        </td>
                        <td className="py-2 font-mono text-xs text-muted-foreground">
                          {r.detail_summary}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : null}

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

        {funnel.length === 0 &&
        gates.length === 0 &&
        totalPageViews === 0 &&
        inviteJourney.length === 0 &&
        (!isGrowthLeadWorkspace ||
          (inPersonLeadRows.length === 0 && onlineLeadRows.length === 0)) ? (
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
