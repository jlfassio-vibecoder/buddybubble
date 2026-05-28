/**
 * Workout Builder: full-page `/app/[workspace_id]/builder/[task_id]` for outline authoring.
 * See docs/agents/workout-builder-plan.md
 */
export function isWorkoutBuilderRouteEnabled(): boolean {
  return process.env.NEXT_PUBLIC_WORKOUT_BUILDER_ROUTE === '1';
}
