import { randomBytes } from 'crypto';

/** High-entropy opaque token for invitations (TDD §5). */
export function generateInviteToken(): string {
  const suffix = randomBytes(24).toString('base64url');
  return `bb_inv_${suffix}`;
}
