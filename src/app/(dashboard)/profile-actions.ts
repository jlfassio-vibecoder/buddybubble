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
 * Dashboard profile-completion modal: validates profile fields, then updates the session
 * user’s auth record with the **Admin API** (`email_confirm: true`) so anonymous QR invitees
 * get a verified email immediately without leaving the app — even when global confirmations
 * are on for other flows. Then updates `public.users` with the user-scoped client (RLS).
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

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[completeProfileGateAction] service role client:', msg);
    return { error: 'Could not update account. Try again in a moment.' };
  }

  const { error: authError } = await admin.auth.admin.updateUserById(user.id, {
    email,
    password,
    email_confirm: true,
  });
  if (authError) return { error: authError.message };

  const update: Record<string, unknown> = {
    full_name: fullName,
    bio,
    children_names: childrenNames,
    email,
  };
  if (input.avatarUrl !== undefined) {
    update.avatar_url = input.avatarUrl;
  }

  const { error } = await supabase.from('users').update(update).eq('id', user.id);
  if (error) return { error: error.message };

  return { ok: true };
}
