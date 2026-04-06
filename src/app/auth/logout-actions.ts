'use server';

import { cookies } from 'next/headers';
import { BB_INVITE_TOKEN_COOKIE, clearedInviteTokenCookieOptions } from '@/lib/invite-cookies';
import {
  BB_LAST_WORKSPACE_COOKIE,
  clearedLastWorkspaceCookieOptions,
} from '@/lib/workspace-cookies';

/** Clears HttpOnly invite handoff and last-workspace cookies (logout / account switch hygiene). */
export async function clearSessionHandoffCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(BB_INVITE_TOKEN_COOKIE, '', clearedInviteTokenCookieOptions());
  cookieStore.set(BB_LAST_WORKSPACE_COOKIE, '', clearedLastWorkspaceCookieOptions());
}
