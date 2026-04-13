'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  BB_INVITE_TOKEN_COOKIE,
  clearedInviteTokenCookieOptions,
  inviteTokenCookieOptions,
} from '@/lib/invite-cookies';
import { insertInviteJourneyByToken } from '@/lib/analytics/invite-journey-server';
import { mapInviteRpcError } from '@/lib/invite-rpc-errors';
import { BB_LAST_WORKSPACE_COOKIE, lastWorkspaceCookieOptions } from '@/lib/workspace-cookies';
import { createClient } from '@utils/supabase/server';
import type { Json } from '@/types/database';

type AcceptPayload = {
  outcome: 'joined' | 'already_member' | 'pending';
  workspace_id?: string;
};

async function clearInviteCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(BB_INVITE_TOKEN_COOKIE, '', clearedInviteTokenCookieOptions());
}

/**
 * Re-hydrate the HttpOnly invite cookie from sessionStorage after OAuth (cookie expiry / edge browsers).
 */
export async function persistInviteHandoffToken(
  token: string,
): Promise<{ ok: true } | { error: string }> {
  const t = token.trim();
  if (!t) {
    return { error: 'Invalid invite.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not signed in.' };
  }

  const cookieStore = await cookies();
  cookieStore.set(BB_INVITE_TOKEN_COOKIE, t, inviteTokenCookieOptions());
  await insertInviteJourneyByToken(t, 'invite_handoff_cookie_saved', {}, { userId: user.id });
  return { ok: true };
}

/**
 * Post-login: consume HttpOnly invite cookie via `accept_invitation`.
 * Returns an error message on failure; redirects on success.
 */
export async function consumeInviteOnboarding(): Promise<{ error: string } | void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(BB_INVITE_TOKEN_COOKIE)?.value?.trim();
  if (!token) {
    return { error: 'No invite found. Open your invite link again.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await insertInviteJourneyByToken(
    token,
    'onboarding_consume_started',
    {},
    { userId: user?.id ?? null },
  );

  const { data, error } = await supabase.rpc('accept_invitation', { p_token: token });

  if (error) {
    await clearInviteCookie();
    await insertInviteJourneyByToken(
      token,
      'onboarding_consume_failed',
      { reason: 'rpc_error' },
      { userId: user?.id ?? null },
    );
    return { error: mapInviteRpcError(error.message) };
  }

  const payload = data as Json as AcceptPayload;
  const outcome = payload?.outcome;

  await clearInviteCookie();

  if (outcome === 'joined' || outcome === 'already_member') {
    const ws = payload.workspace_id;
    if (!ws) {
      await insertInviteJourneyByToken(
        token,
        'onboarding_consume_failed',
        { reason: 'missing_workspace_id' },
        { userId: user?.id ?? null },
      );
      return { error: 'Could not resolve workspace.' };
    }
    await insertInviteJourneyByToken(
      token,
      'onboarding_consume_joined_workspace',
      { outcome },
      { userId: user?.id ?? null },
    );
    cookieStore.set(BB_LAST_WORKSPACE_COOKIE, encodeURIComponent(ws), lastWorkspaceCookieOptions());
    redirect(`/app/${ws}`);
  }

  if (outcome === 'pending') {
    await insertInviteJourneyByToken(
      token,
      'onboarding_consume_pending_approval',
      {},
      { userId: user?.id ?? null },
    );
    redirect('/onboarding?invite=pending');
  }

  await insertInviteJourneyByToken(
    token,
    'onboarding_consume_failed',
    { reason: 'unexpected_outcome' },
    { userId: user?.id ?? null },
  );
  return { error: 'Something went wrong with this invite. Try again.' };
}

/**
 * Client-triggered safety net: if cookies/session now show membership but the page was rendered
 * before `accept_invitation` completed, send the user to `/app` (same as app home resolution).
 */
export async function redirectIfHasWorkspaceMembership(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: members, error } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1);

  if (!error && members && members.length > 0) {
    redirect('/app');
  }
}
