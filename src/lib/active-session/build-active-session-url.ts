export type ActiveSessionLaunchQuery = {
  from?: 'kanban' | 'class' | 'modal' | string;
  sessionId?: string | null;
  class_instance_id?: string | null;
  return?: string;
};

export function buildActiveSessionUrl(
  workspaceId: string,
  taskId: string,
  opts?: ActiveSessionLaunchQuery,
): string {
  const params = new URLSearchParams();
  if (opts?.from) params.set('from', opts.from);
  if (opts?.sessionId) params.set('sessionId', opts.sessionId);
  if (opts?.class_instance_id) params.set('class_instance_id', opts.class_instance_id);
  if (opts?.return) params.set('return', opts.return);
  const qs = params.toString();
  return `/app/${workspaceId}/session/${taskId}${qs ? `?${qs}` : ''}`;
}

export function isActiveSessionPathname(pathname: string | null): boolean {
  if (!pathname) return false;
  return /\/app\/[^/]+\/session\/[^/]+(\/)?$/.test(pathname);
}
