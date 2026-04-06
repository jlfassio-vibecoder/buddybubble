/** Pre-auth invite handoff; read server-side on `/onboarding` and invite consume paths (TDD §4.2). */
export const BB_INVITE_TOKEN_COOKIE = 'bb_invite_token';

/** Long enough for OAuth / email sign-in; invitation validity is still enforced server-side. */
const INVITE_MAX_AGE_SEC = 60 * 60 * 24; // 24 hours

function secureInProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** HttpOnly cookie options for middleware / Route Handlers / Server Actions (OAuth-safe: SameSite=Lax). */
export function inviteTokenCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: INVITE_MAX_AGE_SEC,
    secure: secureInProduction(),
  };
}

/** Clear the invite token cookie (must run in Server Action or Route Handler). */
export function clearedInviteTokenCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
    secure: secureInProduction(),
  };
}
