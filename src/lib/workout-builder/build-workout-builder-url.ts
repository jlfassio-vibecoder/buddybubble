import { safeNextPath } from '@/lib/safe-next-path';

export type WorkoutBuilderLaunchQuery = {
  from?: 'kanban' | 'modal' | string;
  return?: string;
};

/** Dashboard query: open TaskModal for this task after builder save handoff. */
export const WORKOUT_BUILDER_TASK_HANDOFF_QUERY = 'open_task';
/** Dashboard query: open the workout viewer split pane when handoff modal loads. */
export const WORKOUT_BUILDER_OPEN_WORKOUT_VIEWER_QUERY = 'open_workout_viewer';

export function buildWorkoutBuilderUrl(
  workspaceId: string,
  taskId: string,
  opts?: WorkoutBuilderLaunchQuery,
): string {
  const params = new URLSearchParams();
  if (opts?.from) params.set('from', opts.from);
  if (opts?.return) params.set('return', opts.return);
  const qs = params.toString();
  return `/app/${workspaceId}/builder/${taskId}${qs ? `?${qs}` : ''}`;
}

export function isWorkoutBuilderPathname(pathname: string | null): boolean {
  if (!pathname) return false;
  return /\/app\/[^/]+\/builder\/[^/]+(\/)?$/.test(pathname);
}

export function buildWorkoutBuilderGeneratedHandoffUrl(
  workspaceId: string,
  taskId: string,
  opts?: { returnPath?: string | null },
): string {
  const base = safeNextPath(opts?.returnPath ?? null) ?? `/app/${encodeURIComponent(workspaceId)}`;
  const hashIndex = base.indexOf('#');
  const pathAndQuery = hashIndex === -1 ? base : base.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : base.slice(hashIndex);
  const params = new URLSearchParams();
  params.set(WORKOUT_BUILDER_TASK_HANDOFF_QUERY, taskId);
  params.set(WORKOUT_BUILDER_OPEN_WORKOUT_VIEWER_QUERY, '1');
  const sep = pathAndQuery.includes('?') ? '&' : '?';
  return `${pathAndQuery}${sep}${params.toString()}${hash}`;
}
