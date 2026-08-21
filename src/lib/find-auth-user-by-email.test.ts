import type { User } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { authEmailCollisionAgainst } from './find-auth-user-by-email';
import { GUEST_EMAIL_UNAVAILABLE_MSG, mapGuestEmailAuthUpdateError } from './guest-profile-email';

function partialUser(p: Partial<User> & Record<string, unknown>): User {
  return p as User;
}

describe('authEmailCollisionAgainst', () => {
  it('returns lookup_failed when finder failed', () => {
    expect(authEmailCollisionAgainst({ ok: false, error: 'lookup_failed' }, 'guest-id')).toEqual({
      status: 'lookup_failed',
    });
  });

  it('returns available when no user found', () => {
    expect(authEmailCollisionAgainst({ ok: true, user: null }, 'guest-id')).toEqual({
      status: 'available',
    });
  });

  it('returns available when the only match is the excluded guest id', () => {
    const u = partialUser({ id: 'guest-id', email: 'a@b.com' });
    expect(authEmailCollisionAgainst({ ok: true, user: u }, 'guest-id')).toEqual({
      status: 'available',
    });
  });

  it('returns collision when another user owns the email', () => {
    const u = partialUser({ id: 'other-id', email: 'a@b.com' });
    expect(authEmailCollisionAgainst({ ok: true, user: u }, 'guest-id')).toEqual({
      status: 'collision',
    });
  });
});

describe('mapGuestEmailAuthUpdateError', () => {
  it('maps opaque GoTrue update failures to the neutral guest message', () => {
    expect(mapGuestEmailAuthUpdateError('Error updating user')).toBe(GUEST_EMAIL_UNAVAILABLE_MSG);
    expect(
      mapGuestEmailAuthUpdateError('A user with this email address has already been registered'),
    ).toBe(GUEST_EMAIL_UNAVAILABLE_MSG);
  });

  it('passes through unrelated auth errors', () => {
    expect(mapGuestEmailAuthUpdateError('Password should be at least 8 characters')).toBe(
      'Password should be at least 8 characters',
    );
  });

  it('never confirms account existence in the public message', () => {
    expect(GUEST_EMAIL_UNAVAILABLE_MSG.toLowerCase()).not.toMatch(
      /already (has an account|registered)/,
    );
  });
});
