import { formatUserFacingError } from '@/lib/format-error';

/** Map PostgREST / Postgres messages from `accept_invitation` to safe UI copy. */
export function mapInviteRpcError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invite not found') || m.includes('invalid invite')) {
    return 'This invite link is not valid.';
  }
  if (m.includes('revoked')) return 'This invite was revoked.';
  if (m.includes('expired')) return 'This invite has expired.';
  if (m.includes('different email')) {
    return 'This invite was sent to a different email address. Sign in with that address.';
  }
  if (m.includes('different phone number')) {
    return 'This invite was sent to a different phone number. Sign in with the matching number.';
  }
  if (m.includes('verify your phone number')) {
    return 'Verify your phone number on your account before using this invite.';
  }
  if (m.includes('fully consumed') || m.includes('already used')) {
    return 'This invite has already been used.';
  }
  if (m.includes('not authenticated')) return 'Please sign in to continue.';
  return formatUserFacingError(message);
}
