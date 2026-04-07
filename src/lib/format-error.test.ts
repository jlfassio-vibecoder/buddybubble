import { describe, expect, it } from 'vitest';
import { formatLoginAuthError, formatUserFacingError } from '@/lib/format-error';

describe('formatLoginAuthError', () => {
  const anonymousMsg = 'Anonymous sign-ins are disabled';

  it('rewrites anonymous-disabled for sign-up intent', () => {
    expect(formatLoginAuthError(anonymousMsg, 'sign-up')).toBe(
      'Anonymous sign-ins are disabled. Add your Email and Password to create an account.',
    );
  });

  it('rewrites anonymous-disabled for sign-in intent', () => {
    expect(formatLoginAuthError(anonymousMsg, 'sign-in')).toBe(
      'Anonymous sign-ins are disabled. Add your Email and Password to sign in.',
    );
  });

  it('matches variant Supabase wording (sign-ins / sign-ins hyphen)', () => {
    expect(
      formatLoginAuthError('Error: Anonymous sign-ins are disabled for this project.', 'sign-in'),
    ).toContain('Add your Email and Password to sign in.');
  });

  it('passes through unrelated errors like formatUserFacingError', () => {
    const err = new Error('Invalid login credentials');
    expect(formatLoginAuthError(err, 'sign-in')).toBe(formatUserFacingError(err));
    expect(formatLoginAuthError('Network error', 'sign-up')).toBe('Network error');
  });
});
