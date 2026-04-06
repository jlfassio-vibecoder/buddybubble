import { randomBytes } from 'crypto';

const INVITE_TOKEN_PREFIX = 'bb_inv_';
/** Upper bound for path/cookie segments (avoids oversized Set-Cookie from crafted URLs). */
const MAX_INVITE_TOKEN_LEN = 128;

/** High-entropy opaque token for invitations (TDD §5). */
export function generateInviteToken(): string {
  const suffix = randomBytes(24).toString('base64url');
  return `${INVITE_TOKEN_PREFIX}${suffix}`;
}

/** True if value matches generated invite tokens (prefix + base64url); rejects absurd lengths. */
export function isPlausibleInviteTokenForCookie(value: string): boolean {
  const t = value.trim();
  if (t.length === 0 || t.length > MAX_INVITE_TOKEN_LEN) return false;
  if (!t.startsWith(INVITE_TOKEN_PREFIX)) return false;
  const rest = t.slice(INVITE_TOKEN_PREFIX.length);
  return /^[A-Za-z0-9_-]+$/.test(rest);
}
