/**
 * System Analytics: `/app/[workspace_id]/analytics/system` (AI generation observability).
 * See docs/analytics/plans/system-analytics-plan.md
 */
export function isSystemAnalyticsRouteEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SYSTEM_ANALYTICS_ROUTE === '1';
}
