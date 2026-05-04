'use server';

import { cookies } from 'next/headers';
import { createClient } from '@utils/supabase/server';
import {
  BB_PASSWORD_SETUP_PENDING_COOKIE,
  clearedPasswordSetupPendingCookieOptions,
} from '@/lib/login-password-setup-cookie';

export type UpdatePasswordActionResult = { ok: true } | { ok: false; error: string };

export async function updatePasswordAction(
  newPassword: string,
): Promise<UpdatePasswordActionResult> {
  const trimmed = newPassword.trim();
  if (trimmed.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: 'Not signed in.' };
    }

    const { error } = await supabase.auth.updateUser({ password: trimmed });
    if (error) {
      console.error('[updatePasswordAction]', error.message);
      return { ok: false, error: error.message };
    }

    const cookieStore = await cookies();
    cookieStore.set(
      BB_PASSWORD_SETUP_PENDING_COOKIE,
      '',
      clearedPasswordSetupPendingCookieOptions(),
    );

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[updatePasswordAction]', msg);
    return { ok: false, error: 'Could not update password. Try again.' };
  }
}
