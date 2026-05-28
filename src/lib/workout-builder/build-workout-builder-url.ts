export type WorkoutBuilderLaunchQuery = {
  from?: 'kanban' | 'modal' | string;
  return?: string;
};

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
