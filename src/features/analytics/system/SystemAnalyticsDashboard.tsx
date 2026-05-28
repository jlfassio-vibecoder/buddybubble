'use client';

import { useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ClipboardCopy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { track } from '@/lib/analytics/client';
import { isWorkoutBuilderRouteEnabled } from '@/lib/feature-flags/workoutBuilderRoute';
import { buildWorkoutBuilderUrl } from '@/lib/workout-builder/build-workout-builder-url';
import {
  SYSTEM_ANALYTICS_ERROR_FILTERS,
  type SystemAnalyticsErrorFilter,
  type SystemAnalyticsEventRow,
  type SystemAnalyticsSummary,
  type SystemAnalyticsWindow,
} from '@/features/analytics/system/system-analytics-types';
import {
  labelErrorKind,
  labelSurface,
  SYSTEM_ANALYTICS_FILTER_LABELS,
} from '@/features/analytics/system/system-analytics-labels';

type Props = {
  workspaceId: string;
  workspaceName: string;
  window: SystemAnalyticsWindow;
  filter: SystemAnalyticsErrorFilter;
  summary: SystemAnalyticsSummary;
  errorRows: SystemAnalyticsEventRow[];
  hasMore: boolean;
  nextCursor: string | null;
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-card p-4">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <p className="tabular-nums text-3xl font-bold text-foreground">{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

const WINDOW_OPTIONS: { value: SystemAnalyticsWindow; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];

export function SystemAnalyticsDashboard({
  workspaceId,
  workspaceName,
  window,
  filter,
  summary,
  errorRows,
  hasMore,
  nextCursor,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workoutBuilderEnabled = isWorkoutBuilderRouteEnabled();

  const replaceParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === '') params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const windowLabel = useMemo(
    () => WINDOW_OPTIONS.find((o) => o.value === window)?.label ?? window,
    [window],
  );

  const handleReviewWorkout = (row: SystemAnalyticsEventRow) => {
    if (!row.task_id || !workoutBuilderEnabled) return;
    track('system_analytics_recovery_clicked', {
      workspace_id: workspaceId,
      metadata: { task_id: row.task_id, request_id: row.request_id },
    });
    router.push(
      buildWorkoutBuilderUrl(workspaceId, row.task_id, {
        from: 'system_analytics',
        return: pathname,
      }),
    );
  };

  const handleCopyRequestId = async (requestId: string | null) => {
    if (!requestId) return;
    try {
      await navigator.clipboard.writeText(requestId);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  const totalGenerations = summary.successCount + summary.errorCount;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6">
        <Link
          href={`/app/${workspaceId}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Back to socialspace
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
          System Analytics
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workspaceName} — AI workout generation observability (last {windowLabel})
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {WINDOW_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            type="button"
            size="sm"
            variant={window === opt.value ? 'default' : 'outline'}
            onClick={() => replaceParams({ window: opt.value, cursor: null })}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Successful" value={summary.successCount} />
        <StatCard label="Errors" value={summary.errorCount} />
        <StatCard label="Total tokens" value={summary.totalTokens.toLocaleString()} />
        <StatCard
          label="Avg latency"
          value={summary.avgLatencyMs != null ? `${summary.avgLatencyMs} ms` : '—'}
        />
      </div>

      {totalGenerations === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No AI generations in this window.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Generation errors</CardTitle>
            <CardDescription>
              Failed AI generations with recovery actions. Newest first.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {SYSTEM_ANALYTICS_ERROR_FILTERS.map((chip) => (
                <Button
                  key={chip}
                  type="button"
                  size="sm"
                  variant={filter === chip ? 'default' : 'outline'}
                  onClick={() => replaceParams({ filter: chip, cursor: null })}
                >
                  {SYSTEM_ANALYTICS_FILTER_LABELS[chip]}
                </Button>
              ))}
            </div>

            {errorRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No errors in this window — everything&apos;s been generating cleanly.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3">When (UTC)</th>
                      <th className="py-2 pr-3">Actor</th>
                      <th className="py-2 pr-3">Surface</th>
                      <th className="py-2 pr-3">Error</th>
                      <th className="py-2 pr-3">Task</th>
                      <th className="py-2 pr-3">Tokens</th>
                      <th className="py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="align-top">
                    {errorRows.map((row) => {
                      const tokens =
                        (row.prompt_tokens ?? 0) +
                        (row.completion_tokens ?? 0) +
                        (row.thoughts_tokens ?? 0);
                      return (
                        <tr key={row.id} className="border-b border-border/80">
                          <td className="py-2 pr-3 whitespace-nowrap tabular-nums text-muted-foreground">
                            {new Date(row.created_at).toISOString().slice(0, 16).replace('T', ' ')}
                          </td>
                          <td className="py-2 pr-3 text-foreground">
                            {row.actor_display ?? row.actor_user_id?.slice(0, 8) ?? '—'}
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {labelSurface(row.surface)}
                          </td>
                          <td className="py-2 pr-3 text-foreground">
                            {labelErrorKind(row.error_kind)}
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">
                            {row.task_id ? row.task_id.slice(0, 8) : '—'}
                          </td>
                          <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                            {tokens > 0 ? tokens : '—'}
                          </td>
                          <td className="py-2">
                            {row.task_id && workoutBuilderEnabled ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleReviewWorkout(row)}
                              >
                                Review Workout
                              </Button>
                            ) : row.request_id ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="gap-1 font-mono text-xs"
                                onClick={() => void handleCopyRequestId(row.request_id)}
                              >
                                <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />
                                Copy request ID
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {hasMore && nextCursor ? (
              <div className="flex justify-center pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => replaceParams({ cursor: nextCursor })}
                >
                  Load more
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
