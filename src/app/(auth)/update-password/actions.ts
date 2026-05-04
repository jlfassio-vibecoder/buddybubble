'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@utils/supabase/server';
import {
  BB_PASSWORD_SETUP_PENDING_COOKIE,
  clearedPasswordSetupPendingCookieOptions,
} from '@/lib/login-password-setup-cookie';

export async function completeUpdatePasswordAction(
  password: string,
): Promise<{ error: string } | void> {
  const trimmed = password.trim();
  if (trimmed.length < 8) {
    return { error: 'Password must be at least 8 characters.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not signed in.' };
  }

  const { error } = await supabase.auth.updateUser({ password: trimmed });
  if (error) {
    return { error: error.message };
  }

  const cookieStore = await cookies();
  cookieStore.set(BB_PASSWORD_SETUP_PENDING_COOKIE, '', clearedPasswordSetupPendingCookieOptions());

  redirect('/app');
}
