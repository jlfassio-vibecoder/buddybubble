/** Cookie read by `/app` to pick default workspace; written when user switches BuddyBubble in the rail. */
export const BB_LAST_WORKSPACE_COOKIE = 'bb_last_workspace';

export const BB_LAST_WORKSPACE_MAX_AGE_SEC = 60 * 60 * 24 * 365; // 1 year

/** Server Actions / middleware: same semantics as client-set last workspace. */
export function lastWorkspaceCookieOptions() {
  return {
    path: '/',
    sameSite: 'lax' as const,
    maxAge: BB_LAST_WORKSPACE_MAX_AGE_SEC,
    secure: process.env.NODE_ENV === 'production',
  };
}

/** Client-only: persist last-opened workspace for `/app` redirect resolution. */
export function setLastWorkspaceCookieClient(workspaceId: string): void {
  if (typeof document === 'undefined') return;
  const value = encodeURIComponent(workspaceId);
  document.cookie = `${BB_LAST_WORKSPACE_COOKIE}=${value}; Path=/; SameSite=Lax; Max-Age=${BB_LAST_WORKSPACE_MAX_AGE_SEC}`;
}
