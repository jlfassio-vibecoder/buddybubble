/**
 * Workout Builder: full-page `/app/[workspace_id]/builder/[task_id]` for outline authoring.
 * Default ON. Set `NEXT_PUBLIC_WORKOUT_BUILDER_ROUTE=0` (or `false` / `off`) to kill-switch.
 * See docs/agents/workout-builder-plan.md
 */
export function isWorkoutBuilderRouteEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_WORKOUT_BUILDER_ROUTE;
  if (raw == null) return true;
  const v = raw.trim().toLowerCase();
  if (v === '') return true;
  if (v === '0' || v === 'false' || v === 'off') return false;
  if (v === '1' || v === 'true') return true;
  // Unknown values: fail open so empty/mis-set Vercel env does not 404 a shipped route.
  return true;
}
