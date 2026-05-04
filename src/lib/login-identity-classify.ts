import type { User } from '@supabase/supabase-js';

export type LoginIdentityFlow = 'reveal_password' | 'check_email' | 'oauth_google';

/**
 * Pure classifier for admin `User` rows — unit-testable without GoTrue.
 */
export function classifyAuthUserForLogin(user: User | null): LoginIdentityFlow {
  if (!user) return 'check_email';

  const ep = (user as { encrypted_password?: string | null }).encrypted_password;
  const encryptedPasswordLen = typeof ep === 'string' ? ep.length : 0;
  const hasEncryptedPassword = encryptedPasswordLen > 0;

  const hasPasswordFlag = (user as { has_password?: boolean | null }).has_password === true;

  const appMeta = user.app_metadata as
    | { providers?: unknown; provider?: unknown }
    | null
    | undefined;
  const providersRaw = appMeta?.providers;
  const providers = Array.isArray(providersRaw)
    ? providersRaw.filter((p): p is string => typeof p === 'string')
    : [];
  const providerPrimary =
    typeof appMeta?.provider === 'string' ? appMeta.provider.toLowerCase() : '';
  const hasEmailProviderInMetadata = providers.includes('email') || providerPrimary === 'email';
  const hasGoogleProviderInMetadata = providers.includes('google') || providerPrimary === 'google';

  const ids = user.identities ?? [];
  const identitiesMissing = user.identities == null;
  const hasEmailIdentity = ids.some((i) => i.provider === 'email');
  const hasGoogleIdentity = ids.some((i) => i.provider === 'google');

  /**
   * Fallback for tenants where `encrypted_password` is redacted and `has_password` may be omitted.
   * This intentionally prefers routing to password for known email-provider accounts that are not
   * explicitly marked passwordless (`has_password === false`), so owners are not trapped on check-email.
   */
  const hasProviderPasswordShape =
    hasEmailProviderInMetadata &&
    (hasEmailIdentity || identitiesMissing) &&
    !hasGoogleProviderInMetadata &&
    !hasGoogleIdentity &&
    (user as { has_password?: boolean | null }).has_password !== false;

  if (hasEncryptedPassword || hasPasswordFlag || hasProviderPasswordShape) {
    return 'reveal_password';
  }

  const googleOnly =
    (ids.length > 0 &&
      ids.every((i) => i.provider === 'google') &&
      !hasEmailIdentity &&
      hasGoogleIdentity) ||
    (identitiesMissing && hasGoogleProviderInMetadata && !hasEmailProviderInMetadata);
  if (googleOnly) return 'oauth_google';

  return 'check_email';
}
