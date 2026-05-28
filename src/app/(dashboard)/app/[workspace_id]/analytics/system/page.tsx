import { Suspense } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@utils/supabase/server';
import { resolveSystemAnalyticsAccess } from '@/lib/analytics/system-analytics-access';
import { isSystemAnalyticsRouteEnabled } from '@/lib/feature-flags/systemAnalyticsRoute';
import { SystemAnalyticsDashboard } from '@/features/analytics/system/SystemAnalyticsDashboard';
import { SystemAnalyticsUpgradeGate } from '@/features/analytics/system/SystemAnalyticsUpgradeGate';
import {
  computeSystemAnalyticsSummary,
  decodeSystemAnalyticsCursor,
  encodeSystemAnalyticsCursor,
  parseSystemAnalyticsErrorFilter,
  parseSystemAnalyticsWindow,
  type SystemAnalyticsEventRow,
  windowSinceIso,
} from '@/features/analytics/system/system-analytics-types';

type PageProps = {
  params: Promise<{ workspace_id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readSearchParam(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const raw = sp[key];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0];
  return undefined;
}

export default async function SystemAnalyticsPage({ params, searchParams }: PageProps) {
  if (!isSystemAnalyticsRouteEnabled()) {
    notFound();
  }

  const { workspace_id } = await params;
  const sp = await searchParams;
  const window = parseSystemAnalyticsWindow(readSearchParam(sp, 'window'));
  const filter = parseSystemAnalyticsErrorFilter(readSearchParam(sp, 'filter'));
  const cursor = decodeSystemAnalyticsCursor(readSearchParam(sp, 'cursor'));

  const access = await resolveSystemAnalyticsAccess(workspace_id);
  if (access === 'unauthenticated') redirect('/login');
  if (access === 'forbidden') redirect(`/app/${workspace_id}`);

  const { role, tier } = access;
  const supabase = await createClient();

  const { data: ws } = await supabase
    .from('workspaces')
    .select('name')
    .eq('id', workspace_id)
    .maybeSingle();

  const workspaceName = (ws as { name?: string } | null)?.name?.trim() || 'Socialspace';

  if (!tier.hasSystemAnalytics) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col overflow-auto bg-background p-4 md:p-8">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-6">
            <Link
              href={`/app/${workspace_id}`}
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              ← Back to socialspace
            </Link>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
              System Analytics
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{workspaceName}</p>
          </div>
          <SystemAnalyticsUpgradeGate
            workspaceId={workspace_id}
            role={role}
            planKey={tier.planKey}
            status={tier.status}
          />
        </div>
      </div>
    );
  }

  const since = windowSinceIso(window);

  const { data: summaryRows } = await supabase
    .from('workspace_ai_events')
    .select('event_type, prompt_tokens, completion_tokens, thoughts_tokens, latency_ms')
    .eq('workspace_id', workspace_id)
    .gte('created_at', since);

  const summary = computeSystemAnalyticsSummary(summaryRows ?? []);

  let errorQuery = supabase
    .from('workspace_ai_events')
    .select(
      'id, created_at, actor_user_id, surface, event_type, error_kind, task_id, prompt_tokens, completion_tokens, thoughts_tokens, request_id, agent_slug',
    )
    .eq('workspace_id', workspace_id)
    .gte('created_at', since)
    .neq('event_type', 'success')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(51);

  if (filter !== 'all') {
    errorQuery = errorQuery.eq('event_type', filter);
  }

  if (cursor) {
    errorQuery = errorQuery.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data: errorPage } = await errorQuery;
  const hasMore = (errorPage?.length ?? 0) > 50;
  const errorSlice = hasMore ? (errorPage ?? []).slice(0, 50) : (errorPage ?? []);
  const lastRow = errorSlice[errorSlice.length - 1];
  const nextCursor =
    hasMore && lastRow ? encodeSystemAnalyticsCursor(lastRow.created_at, lastRow.id) : null;

  const actorIds = [
    ...new Set(
      errorSlice
        .map((row) => row.actor_user_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];

  const usersById: Record<string, string> = {};
  if (actorIds.length > 0) {
    const { data: userRows } = await supabase
      .from('users')
      .select('id, full_name, email')
      .in('id', actorIds);
    for (const u of userRows ?? []) {
      const row = u as { id: string; full_name: string | null; email: string | null };
      const display = row.full_name?.trim() || row.email?.trim() || null;
      if (display) usersById[row.id] = display;
    }
  }

  const errorRows: SystemAnalyticsEventRow[] = errorSlice.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    actor_user_id: row.actor_user_id,
    actor_display: row.actor_user_id ? (usersById[row.actor_user_id] ?? null) : null,
    surface: row.surface,
    event_type: row.event_type,
    error_kind: row.error_kind,
    task_id: row.task_id,
    prompt_tokens: row.prompt_tokens,
    completion_tokens: row.completion_tokens,
    thoughts_tokens: row.thoughts_tokens,
    request_id: row.request_id,
    agent_slug: row.agent_slug,
  }));

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-auto bg-background p-4 md:p-8">
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-5xl py-12 text-center text-sm text-muted-foreground">
            Loading system analytics…
          </div>
        }
      >
        <SystemAnalyticsDashboard
          workspaceId={workspace_id}
          workspaceName={workspaceName}
          window={window}
          filter={filter}
          summary={summary}
          errorRows={errorRows}
          hasMore={hasMore}
          nextCursor={nextCursor}
        />
      </Suspense>
    </div>
  );
}
