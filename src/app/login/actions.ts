'use server';

import { headers } from 'next/headers';
import type { User } from '@supabase/supabase-js';
import { authCallbackAbsoluteUrl } from '@/lib/auth-callback-url';
import { getCanonicalOrigin } from '@/lib/app-url';
import { getClientIpFromHeaders } from '@/lib/client-ip';
import { classifyAuthUserForLogin } from '@/lib/login-identity-classify';
import { enforceLoginIdentityRateLimit } from '@/lib/login-identity-rate-limit';
import { createServiceRoleClient } from '@/lib/supabase-service-role';

const EMAIL_MAX_LEN = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CheckUserIdentityResult =
  | { ok: true; flow: 'reveal_password'; email: string }
  | { ok: true; flow: 'check_email' }
  | { ok: true; flow: 'oauth_google' }
  | { ok: false; error: string };

async function findAuthUserByEmail(
  admin: ReturnType<typeof createServiceRoleClient>,
  normalizedEmail: string,
): Promise<User | null> {
  const listParams = {
    page: 1,
    perPage: 200,
    search: normalizedEmail,
  } as unknown as Parameters<typeof admin.auth.admin.listUsers>[0];
  const { data: { users = [] } = {}, error } = await admin.auth.admin.listUsers(listParams);

  if (error) {
    console.error('[checkUserIdentityAction] listUsers', error.message);
  } else {
    const found = users.find(
      (u) => typeof u.email === 'string' && u.email.trim().toLowerCase() === normalizedEmail,
    );
    if (found) return found;
  }

  // Fallback for tenants where admin search does not return expected rows:
  // resolve auth user id from `public.users` (service role) and then fetch auth user by id.
  const { data: profile, error: profileErr } = await admin
    .from('users')
    .select('id, email')
    .ilike('email', normalizedEmail)
    .maybeSingle();

  if (profileErr) {
    console.error('[checkUserIdentityAction] users lookup fallback', profileErr.message);
    return null;
  }
  const authId =
    profile && typeof (profile as { id?: string }).id === 'string'
      ? (profile as { id: string }).id
      : '';
  if (!authId) return null;

  const { data: authData, error: byIdErr } = await admin.auth.admin.getUserById(authId);
  if (byIdErr) {
    console.error('[checkUserIdentityAction] getUserById fallback', byIdErr.message);
    return null;
  }
  const authUser = authData?.user ?? null;
  if (
    authUser &&
    typeof authUser.email === 'string' &&
    authUser.email.trim().toLowerCase() === normalizedEmail
  ) {
    return authUser;
  }
  return null;
}

/**
 * Email-first login router: uses service role to classify account (password vs passwordless vs Google-only).
 * Anti-enumeration: unknown emails return the same `check_email` flow without sending mail.
 *
 * Manual QA checklist:
 * - Password user: Continue → password step → sign in.
 * - Storefront trial (no password): Continue → recovery email → `/auth/callback` → `/update-password` → app.
 * - Unknown email: Continue → same “check email” UI; no outbound mail.
 * - Google-only account: Continue → Google prompt path (no recovery mail).
 */
export async function checkUserIdentityAction(input: {
  email: string;
  inviteToken?: string | null;
}): Promise<CheckUserIdentityResult> {
  const emailRaw = input.email.trim().toLowerCase();

  if (!emailRaw) {
    return { ok: false, error: 'Enter your email address.' };
  }
  if (emailRaw.length > EMAIL_MAX_LEN) {
    return { ok: false, error: 'Email is too long.' };
  }
  if (!EMAIL_PATTERN.test(emailRaw)) {
    return { ok: false, error: 'Enter a valid email address.' };
  }

  const h = await headers();
  const clientIp = getClientIpFromHeaders(h) ?? 'unknown';
  const limit = await enforceLoginIdentityRateLimit(clientIp);
  if (!limit.ok) {
    return { ok: true, flow: 'check_email' };
  }

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[checkUserIdentityAction] service role client:', msg);
    return { ok: false, error: 'Could not verify email. Try again in a moment.' };
  }

  const user = await findAuthUserByEmail(admin, emailRaw);
  if (user) {
    const providers = (user.app_metadata as { providers?: unknown } | null | undefined)?.providers;
    const hasProviderArray = Array.isArray(providers);
    const hasHasPasswordField =
      typeof (user as { has_password?: unknown }).has_password === 'boolean';
    const hasEncryptedPasswordField =
      typeof (user as { encrypted_password?: unknown }).encrypted_password === 'string';
    if (!hasProviderArray && !hasHasPasswordField && !hasEncryptedPasswordField) {
      console.error(
        '[checkUserIdentityAction] Unable to distinguish password vs passwordless account shape (missing provider/has_password/encrypted_password fields)',
      );
      return { ok: false, error: 'Could not determine account sign-in type. Please try again.' };
    }
  }
  const invite = input.inviteToken?.trim() || null;
  const origin = getCanonicalOrigin();
  const redirectTo = authCallbackAbsoluteUrl(origin, '/update-password', invite);

  const classificationResult = classifyAuthUserForLogin(user);

  if (classificationResult === 'reveal_password') {
    return { ok: true, flow: 'reveal_password', email: emailRaw };
  }

  if (classificationResult === 'oauth_google') {
    return { ok: true, flow: 'oauth_google' };
  }

  if (!user) {
    return { ok: true, flow: 'check_email' };
  }

  const { error: resetErr } = await admin.auth.resetPasswordForEmail(emailRaw, {
    redirectTo,
  });

  if (resetErr) {
    console.error('[checkUserIdentityAction] resetPasswordForEmail', resetErr.message);
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: emailRaw,
      options: { redirectTo },
    });
    if (linkErr || !linkData?.properties?.action_link) {
      console.error('[checkUserIdentityAction] generateLink recovery', linkErr?.message);
      return { ok: false, error: 'Could not send sign-in link. Try again shortly.' };
    }
    const actionLink = linkData.properties.action_link;
    try {
      const { sendAccountRecoveryLoginEmail } = await import('@/lib/account-recovery-login-email');
      const dup = await sendAccountRecoveryLoginEmail({
        to: emailRaw,
        recoveryLinkUrl: actionLink,
      });
      if (dup.error) {
        console.error('[checkUserIdentityAction] recovery email fallback', dup.error);
        return { ok: false, error: 'Could not send sign-in link. Try again shortly.' };
      }
    } catch (e) {
      console.error('[checkUserIdentityAction] recovery email send', e);
      return { ok: false, error: 'Could not send sign-in link. Try again shortly.' };
    }
  }

  return { ok: true, flow: 'check_email' };
}
