'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { BB_INVITE_TOKEN_COOKIE, clearedInviteTokenCookieOptions } from '@/lib/invite-cookies';
import { mapInviteRpcError } from '@/lib/invite-rpc-errors';
import { BB_LAST_WORKSPACE_COOKIE, lastWorkspaceCookieOptions } from '@/lib/workspace-cookies';
import { insertInviteJourneyByToken } from '@/lib/analytics/invite-journey-server';
import { createClient } from '@utils/supabase/server';
import type { Json } from '@/types/database';

export type InviteJoinState = { error: string | null };

type AcceptPayload = {
  outcome: 'joined' | 'already_member' | 'pending';
  workspace_id?: string;
  invitation_id?: string;
  join_request_id?: string;
};

async function clearInviteCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(BB_INVITE_TOKEN_COOKIE, '', clearedInviteTokenCookieOptions());
}

export async function joinViaInviteAction(
  _prev: InviteJoinState | null,
  formData: FormData,
): Promise<InviteJoinState> {
  const token = String(formData.get('token') ?? '').trim();
  if (!token) {
    return { error: 'Missing invite token.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await insertInviteJourneyByToken(token, 'invite_join_submit', {}, { userId: user?.id ?? null });

  const { data, error } = await supabase.rpc('accept_invitation', { p_token: token });

  if (error) {
    await clearInviteCookie();
    await insertInviteJourneyByToken(
      token,
      'invite_join_failed',
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
        'invite_join_failed',
        { reason: 'missing_workspace_id' },
        { userId: user?.id ?? null },
      );
      return { error: 'Could not resolve workspace.' };
    }
    const isAnonymous = Boolean((user as { is_anonymous?: boolean } | null)?.is_anonymous);
    if (isAnonymous) {
      await insertInviteJourneyByToken(
        token,
        'invite_qr_join_succeeded',
        { outcome },
        { userId: user?.id ?? null },
      );
    }
    await insertInviteJourneyByToken(
      token,
      'invite_join_joined_workspace',
      { outcome },
      { userId: user?.id ?? null },
    );
    const cookieStore = await cookies();
    cookieStore.set(BB_LAST_WORKSPACE_COOKIE, encodeURIComponent(ws), lastWorkspaceCookieOptions());
    redirect(`/app/${ws}`);
  }

  if (outcome === 'pending') {
    await insertInviteJourneyByToken(
      token,
      'invite_join_pending_approval',
      {},
      { userId: user?.id ?? null },
    );
    redirect('/onboarding?invite=pending');
  }

  await insertInviteJourneyByToken(
    token,
    'invite_join_failed',
    { reason: 'unexpected_outcome' },
    { userId: user?.id ?? null },
  );
  return { error: 'Something went wrong with this invite. Try again.' };
}
