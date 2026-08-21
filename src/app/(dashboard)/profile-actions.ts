'use server';

import { createServiceRoleClient } from '@/lib/supabase-service-role';
import { createClient } from '@utils/supabase/server';

export type ActionResult<T extends Record<string, unknown> = Record<never, never>> =
  | { error: string }
  | ({ ok: true } & T);

export type ProfileUpdateInput = {
  fullName: string;
  bio?: string | null;
  childrenNames?: string[];
  avatarUrl?: string | null;
};

const EMAIL_MAX_LEN = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CompleteProfileGateInput = {
  fullName: string;
  bio?: string | null;
  childrenNames?: string[];
  avatarUrl?: string | null;
  email: string;
  password: string;
};

function validateProfileFields(input: {
  fullName: string;
  bio?: string | null;
  childrenNames?: string[];
}): string | null {
  const fullName = input.fullName.trim();
  if (!fullName) return 'Display name is required.';
  if (fullName.length > 120) return 'Display name must be 120 characters or fewer.';

  const bio = input.bio?.trim() ?? null;
  if (bio && bio.length > 500) return 'Bio must be 500 characters or fewer.';

  const childrenNames = (input.childrenNames ?? []).map((n) => n.trim()).filter(Boolean);
  if (childrenNames.length > 8) return 'Maximum 8 family members allowed.';
  if (childrenNames.some((n) => n.length > 64)) {
    return 'Each family member name must be 64 characters or fewer.';
  }
  return null;
}

/**
 * Validate and persist profile text fields (full_name, bio, children_names, avatar_url).
 * Avatar upload is handled client-side (File object); pass the resulting public URL here.
 */
export async function updateMyProfileAction(input: ProfileUpdateInput): Promise<ActionResult> {
  const profileErr = validateProfileFields({
    fullName: input.fullName,
    bio: input.bio,
    childrenNames: input.childrenNames,
  });
  if (profileErr) return { error: profileErr };

  const fullName = input.fullName.trim();
  const bio = input.bio?.trim() ?? null;
  const childrenNames = (input.childrenNames ?? []).map((n) => n.trim()).filter(Boolean);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const update: Record<string, unknown> = {
    full_name: fullName,
    bio,
    children_names: childrenNames,
  };
  if (input.avatarUrl !== undefined) {
    update.avatar_url = input.avatarUrl;
  }

  const { error } = await supabase.from('users').update(update).eq('id', user.id);
  if (error) return { error: error.message };

  return { ok: true };
}

/**
 * Set or update the password for the current auth user.
 * In a single Supabase project the password applies to this account across
 * all workspaces (not per-workspace).
 *
 * To set **email and password together** (dashboard profile-completion gate), use
 * {@link completeProfileGateAction} so `public.users` stays in sync with `auth.users`.
 */
export async function setPasswordAction(password: string): Promise<ActionResult> {
  if (password.trim().length < 8) {
    return { error: 'Password must be at least 8 characters.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: password.trim() });
  if (error) return { error: error.message };

  return { ok: true };
}

/**
 * Dashboard profile-completion modal: validates profile fields, updates **`public.users` first**
 * (RLS), then updates **`auth.users`**. **Anonymous** users with no session email use the Admin
 * API (`email_confirm: true`) so QR invitees are verified immediately; everyone else uses
 * `auth.updateUser` so normal email-confirmation applies when changing address. If auth fails
 * after the DB write succeeds, we **revert** `public.users` to the prior snapshot.
 */
export async function completeProfileGateAction(
  input: CompleteProfileGateInput,
): Promise<ActionResult> {
  const profileErr = validateProfileFields({
    fullName: input.fullName,
    bio: input.bio,
    childrenNames: input.childrenNames,
  });
  if (profileErr) return { error: profileErr };

  const email = input.email.trim();
  if (!email) return { error: 'A valid email is required to secure your account.' };
  if (email.length > EMAIL_MAX_LEN) return { error: 'Email is too long.' };
  if (!EMAIL_PATTERN.test(email)) {
    return { error: 'Enter a valid email address.' };
  }

  const password = input.password.trim();
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' };

  const fullName = input.fullName.trim();
  const bio = input.bio?.trim() ?? null;
  const childrenNames = (input.childrenNames ?? []).map((n) => n.trim()).filter(Boolean);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const { data: prior, error: priorErr } = await supabase
    .from('users')
    .select('full_name, bio, children_names, avatar_url, email')
    .eq('id', user.id)
    .maybeSingle();
  if (priorErr) return { error: priorErr.message };
  if (!prior) return { error: 'Profile not found.' };

  const hasAuthEmail = typeof user.email === 'string' && user.email.trim().length > 0;
  const isAnonymous = (user as { is_anonymous?: boolean }).is_anonymous === true;
  const canUseAdminOnboardingPath = isAnonymous && !hasAuthEmail;

  /** GoTrue returns a vague "Error updating user" when an email is already taken on another row. */
  const EMAIL_ALREADY_REGISTERED_MSG =
    'That email already has an account. Sign out, then sign in with your email and password (or Google) — do not complete this guest profile with an existing address.';

  let adminForOnboarding: ReturnType<typeof createServiceRoleClient> | undefined;
  if (canUseAdminOnboardingPath) {
    try {
      adminForOnboarding = createServiceRoleClient();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[completeProfileGateAction] service role client:', msg);
      return { error: 'Could not update account. Try again in a moment.' };
    }
    const emailTakenByOther = await authEmailOwnedByOtherUser(adminForOnboarding, email, user.id);
    if (emailTakenByOther) {
      return { error: EMAIL_ALREADY_REGISTERED_MSG };
    }
  }

  const update: Record<string, unknown> = {
    full_name: fullName,
    bio,
    children_names: childrenNames,
    email,
  };
  if (input.avatarUrl !== undefined) {
    update.avatar_url = input.avatarUrl;
  }

  const { error: dbError } = await supabase.from('users').update(update).eq('id', user.id);
  if (dbError) return { error: dbError.message };

  let authError: { message: string } | null = null;

  if (canUseAdminOnboardingPath) {
    const admin = adminForOnboarding;
    if (admin) {
      const { error } = await admin.auth.admin.updateUserById(user.id, {
        email,
        password,
        email_confirm: true,
      });
      authError = error ?? null;
      if (
        authError &&
        /error updating user|already.*(registered|exists|been)/i.test(authError.message)
      ) {
        authError = { message: EMAIL_ALREADY_REGISTERED_MSG };
      }
    }
  } else {
    const authUpdate: { email?: string; password: string } = { password };
    const currentEmail = (user.email ?? '').trim();
    if (email !== currentEmail) {
      authUpdate.email = email;
    }
    const { error } = await supabase.auth.updateUser(authUpdate);
    authError = error ?? null;
  }

  if (authError) {
    const revert: Record<string, unknown> = {
      full_name: prior.full_name,
      bio: prior.bio,
      children_names: prior.children_names,
      email: prior.email,
    };
    if (input.avatarUrl !== undefined) {
      revert.avatar_url = prior.avatar_url;
    }
    const { error: revErr } = await supabase.from('users').update(revert).eq('id', user.id);
    if (revErr) {
      console.error('[completeProfileGateAction] revert after auth failure:', revErr.message);
    }
    return { error: authError.message };
  }

  return { ok: true };
}

/**
 * True when another auth user (not `excludeUserId`) already owns `email`.
 * Used before converting anonymous guests so we can return a clear message instead of
 * GoTrue's opaque "Error updating user".
 */
async function authEmailOwnedByOtherUser(
  admin: ReturnType<typeof createServiceRoleClient>,
  email: string,
  excludeUserId: string,
): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const listParams = {
    page: 1,
    perPage: 200,
    search: normalized,
  } as unknown as Parameters<typeof admin.auth.admin.listUsers>[0];
  const { data: { users = [] } = {}, error } = await admin.auth.admin.listUsers(listParams);
  if (error) {
    console.error('[completeProfileGateAction] listUsers for email collision', error.message);
  } else {
    const hit = users.find(
      (u) =>
        u.id !== excludeUserId &&
        typeof u.email === 'string' &&
        u.email.trim().toLowerCase() === normalized,
    );
    if (hit) return true;
  }

  const { data: profile, error: profileErr } = await admin
    .from('users')
    .select('id')
    .eq('email', normalized)
    .neq('id', excludeUserId)
    .maybeSingle();
  if (profileErr) {
    console.error('[completeProfileGateAction] users email collision lookup', profileErr.message);
    return false;
  }
  return Boolean(profile?.id);
}
