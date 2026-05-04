import type { User } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { classifyAuthUserForLogin } from './login-identity-classify';

function partialUser(p: Partial<User> & Record<string, unknown>): User {
  return p as User;
}

describe('classifyAuthUserForLogin', () => {
  it('returns check_email when user is null', () => {
    expect(classifyAuthUserForLogin(null)).toBe('check_email');
  });

  it('returns reveal_password when encrypted_password is non-empty', () => {
    const u = partialUser({
      email: 'a@b.com',
      encrypted_password: 'x',
      identities: [
        {
          identity_id: '1',
          provider: 'email',
          id: '1',
          user_id: 'u',
          identity_data: {},
        },
      ],
    });
    expect(classifyAuthUserForLogin(u)).toBe('reveal_password');
  });

  it('returns reveal_password when has_password is true', () => {
    const u = partialUser({
      email: 'a@b.com',
      has_password: true,
      identities: [
        {
          identity_id: 'e',
          provider: 'email',
          id: 'e',
          user_id: 'u',
          identity_data: {},
        },
      ],
    });
    expect(classifyAuthUserForLogin(u)).toBe('reveal_password');
  });

  it('returns oauth_google when only google identities', () => {
    const u = partialUser({
      email: 'a@b.com',
      encrypted_password: '',
      identities: [
        {
          identity_id: 'g',
          provider: 'google',
          id: 'g',
          user_id: 'u',
          identity_data: {},
        },
      ],
    });
    expect(classifyAuthUserForLogin(u)).toBe('oauth_google');
  });

  it('returns check_email for email identity without password (trial-style)', () => {
    const u = partialUser({
      email: 'a@b.com',
      has_password: false,
      identities: [
        {
          identity_id: 'e',
          provider: 'email',
          id: 'e',
          user_id: 'u',
          identity_data: {},
        },
      ],
    });
    expect(classifyAuthUserForLogin(u)).toBe('check_email');
  });

  it('returns check_email when google and email identities without password', () => {
    const u = partialUser({
      email: 'a@b.com',
      has_password: false,
      identities: [
        {
          identity_id: 'g',
          provider: 'google',
          id: 'g',
          user_id: 'u',
          identity_data: {},
        },
        {
          identity_id: 'e',
          provider: 'email',
          id: 'e',
          user_id: 'u',
          identity_data: {},
        },
      ],
    });
    expect(classifyAuthUserForLogin(u)).toBe('check_email');
  });

  it('returns reveal_password when metadata providers include email and not explicitly passwordless', () => {
    const u = partialUser({
      email: 'a@b.com',
      app_metadata: { providers: ['email'] },
      identities: [
        {
          identity_id: 'e',
          provider: 'email',
          id: 'e',
          user_id: 'u',
          identity_data: {},
        },
      ],
    });
    expect(classifyAuthUserForLogin(u)).toBe('reveal_password');
  });

  it('returns reveal_password when app_metadata.provider=email and identities are null', () => {
    const u = {
      email: 'a@b.com',
      app_metadata: { provider: 'email', providers: ['email'] },
      identities: null,
      has_password: undefined,
      encrypted_password: undefined,
    } as unknown as User;
    expect(classifyAuthUserForLogin(u)).toBe('reveal_password');
  });

  it('returns oauth_google when app_metadata.provider=google and identities are null', () => {
    const u = {
      email: 'a@b.com',
      app_metadata: { provider: 'google', providers: ['google'] },
      identities: null,
      has_password: undefined,
      encrypted_password: undefined,
    } as unknown as User;
    expect(classifyAuthUserForLogin(u)).toBe('oauth_google');
  });
});
