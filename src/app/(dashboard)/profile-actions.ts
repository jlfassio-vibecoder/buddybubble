'use server';

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

/**
 * Validate and persist profile text fields (full_name, bio, children_names, avatar_url).
 * Avatar upload is handled client-side (File object); pass the resulting public URL here.
 */
export async function updateMyProfileAction(input: ProfileUpdateInput): Promise<ActionResult> {
  const fullName = input.fullName.trim();
  if (!fullName) return { error: 'Display name is required.' };
  if (fullName.length > 120) return { error: 'Display name must be 120 characters or fewer.' };

  const bio = input.bio?.trim() ?? null;
  if (bio && bio.length > 500) return { error: 'Bio must be 500 characters or fewer.' };

  const childrenNames = (input.childrenNames ?? []).map((n) => n.trim()).filter(Boolean);
  if (childrenNames.length > 8) return { error: 'Maximum 8 family members allowed.' };
  if (childrenNames.some((n) => n.length > 64)) {
    return { error: 'Each family member name must be 64 characters or fewer.' };
  }

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
