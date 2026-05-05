/**
 * Appends `?view=messages&tab=chat` so `DashboardShell` hydrates into Messages on first paint
 * (see docs/fitness/views/README.md). Skips non-default routes and paths that already set `tab` or `view`.
 */
const WORKSPACE_ID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isAppWorkspaceHomePath(pathname: string): boolean {
  const m = /^\/app\/([^/]+)\/?$/.exec(pathname);
  if (!m) return false;
  return WORKSPACE_ID_SEGMENT.test(m[1]);
}

export function withDefaultDashboardChatView(nextPath: string): string {
  const trimmed = nextPath.trim();
  if (!trimmed.startsWith('/')) return nextPath;

  const qIndex = trimmed.indexOf('?');
  const pathname = (qIndex === -1 ? trimmed : trimmed.slice(0, qIndex)).split('#')[0];
  const search = qIndex === -1 ? '' : trimmed.slice(qIndex + 1).split('#')[0];

  if (
    pathname === '/onboarding' ||
    pathname === '/update-password' ||
    pathname.startsWith('/login')
  ) {
    return trimmed;
  }

  if (pathname !== '/app' && !isAppWorkspaceHomePath(pathname)) {
    return trimmed;
  }

  const params = new URLSearchParams(search);
  if (params.has('tab') || params.has('view')) {
    return trimmed;
  }

  params.set('view', 'messages');
  params.set('tab', 'chat');
  return `${pathname}?${params.toString()}`;
}
