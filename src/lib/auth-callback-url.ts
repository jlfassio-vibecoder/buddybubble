/**
 * Supabase OAuth / email-confirm redirect target. Optional invite token survives email-link opens
 * where the browser never hit `/invite/...` (no middleware cookie, no sessionStorage).
 */
export function authCallbackAbsoluteUrl(
  origin: string,
  nextPath: string,
  inviteToken?: string | null,
): string {
  const u = new URL('/auth/callback', origin);
  u.searchParams.set('next', nextPath);
  const t = inviteToken?.trim();
  if (t) u.searchParams.set('invite_handoff', t);
  return u.toString();
}
