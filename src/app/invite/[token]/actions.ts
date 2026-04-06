'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { BB_INVITE_TOKEN_COOKIE, clearedInviteTokenCookieOptions } from '@/lib/invite-cookies';
import { mapInviteRpcError } from '@/lib/invite-rpc-errors';
import { BB_LAST_WORKSPACE_COOKIE, lastWorkspaceCookieOptions } from '@/lib/workspace-cookies';
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
  const { data, error } = await supabase.rpc('accept_invitation', { p_token: token });

  if (error) {
    await clearInviteCookie();
    return { error: mapInviteRpcError(error.message) };
  }

  const payload = data as Json as AcceptPayload;
  const outcome = payload?.outcome;

  await clearInviteCookie();

  if (outcome === 'joined' || outcome === 'already_member') {
    const ws = payload.workspace_id;
    if (!ws) {
      return { error: 'Could not resolve workspace.' };
    }
    const cookieStore = await cookies();
    cookieStore.set(BB_LAST_WORKSPACE_COOKIE, encodeURIComponent(ws), lastWorkspaceCookieOptions());
    redirect(`/app/${ws}`);
  }

  if (outcome === 'pending') {
    redirect('/onboarding?invite=pending');
  }

  return { error: 'Something went wrong with this invite. Try again.' };
}
