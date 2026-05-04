/** HttpOnly flag: user arrived from recovery with `next=/update-password` and must set password before app shell. */
export const BB_PASSWORD_SETUP_PENDING_COOKIE = 'bb_password_setup_pending';

const PENDING_MAX_AGE_SEC = 15 * 60; // 15 minutes — enough to open email and submit new password

function secureInProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function passwordSetupPendingCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: PENDING_MAX_AGE_SEC,
    secure: secureInProduction(),
  };
}

export function clearedPasswordSetupPendingCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
    secure: secureInProduction(),
  };
}
