/**
 * Active Session: `1` = opt-in route `/app/[workspace_id]/session/[task_id]` on selected launch paths;
 * otherwise WorkoutPlayer modal (V1 default).
 * See docs/fitness/active-session-engine-plan.md
 */
export function isActiveSessionRouteEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ACTIVE_SESSION_ROUTE === '1';
}
