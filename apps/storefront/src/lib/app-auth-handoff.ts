import type { Session } from '@supabase/supabase-js';

/** Same shape as CRM `authCallbackAbsoluteUrl` for email confirmation links from the storefront. */
export function authCallbackAbsoluteUrl(
  appOrigin: string,
  nextPath: string,
  inviteToken?: string | null,
): string {
  const base = appOrigin.replace(/\/$/, '');
  const u = new URL('/auth/callback', base);
  u.searchParams.set('next', nextPath);
  const t = inviteToken?.trim();
  if (t) u.searchParams.set('invite_handoff', t);
  return u.toString();
}

/**
 * Move the Supabase session from the marketing origin into the CRM app: the app's
 * `createBrowserClient` reads the hash and persists cookies/local session on load.
 */
export function redirectAppWithSession(
  appOrigin: string,
  pathname: string,
  session: Session,
): void {
  const base = appOrigin.replace(/\/$/, '');
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const url = new URL(path, base);
  const params = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: String(session.expires_in),
    token_type: session.token_type,
  });
  if (session.expires_at != null) {
    params.set('expires_at', String(session.expires_at));
  }
  url.hash = params.toString();
  window.location.assign(url.toString());
}
