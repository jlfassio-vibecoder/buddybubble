'use server';

import { revalidatePath } from 'next/cache';
import { inviteUrlForToken } from '@/lib/app-url';
import { generateInviteToken } from '@/lib/invite-token';
import { sendInviteEmail } from '@/lib/resend-invite';
import { sendInviteSms } from '@/lib/twilio-sms';
import { insertInviteJourneyByToken } from '@/lib/analytics/invite-journey-server';
import { createClient } from '@utils/supabase/server';

export type ActionResult<T extends Record<string, unknown> = Record<never, never>> =
  | { error: string }
  | ({ ok: true } & T);

async function requireWorkspaceAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  const role = (data as { role?: string } | null)?.role;
  return role === 'admin' || role === 'owner';
}

function expiresAtFromHours(hours: number): string {
  const h = Math.max(1, Math.min(hours, 24 * 365));
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
}

export async function createInviteAction(input: {
  workspaceId: string;
  inviteType: 'link' | 'qr';
  maxUses: number;
  expiresInHours: number;
  label: string;
  role?: 'admin' | 'member' | 'guest';
}): Promise<ActionResult<{ inviteUrl: string; token: string; id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  if (!(await requireWorkspaceAdmin(supabase, input.workspaceId, user.id))) {
    return { error: 'Only socialspace admins can create invites.' };
  }

  const maxUses = Math.max(1, Math.floor(Number(input.maxUses)) || 1);
  const token = generateInviteToken();
  const expires_at = expiresAtFromHours(input.expiresInHours);
  const label = input.label?.trim() || null;

  const { data, error } = await supabase
    .from('invitations')
    .insert({
      workspace_id: input.workspaceId,
      created_by: user.id,
      token,
      invite_type: input.inviteType,
      target_identity: null,
      label,
      max_uses: maxUses,
      expires_at,
      role: input.role ?? 'member',
    })
    .select('id')
    .single();

  if (error) {
    return { error: error.message };
  }

  const row = data as { id: string } | null;
  if (!row?.id) {
    return { error: 'Invite was not created.' };
  }

  await insertInviteJourneyByToken(
    token,
    'invite_created',
    { label: label ?? undefined },
    { userId: user.id },
  );

  revalidatePath(`/app/${input.workspaceId}/invites`);
  return { ok: true, inviteUrl: inviteUrlForToken(token), token, id: row.id };
}

export async function revokeInviteAction(input: {
  workspaceId: string;
  invitationId: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  if (!(await requireWorkspaceAdmin(supabase, input.workspaceId, user.id))) {
    return { error: 'Only socialspace admins can revoke invites.' };
  }

  const { error } = await supabase
    .from('invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', input.invitationId)
    .eq('workspace_id', input.workspaceId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/app/${input.workspaceId}/invites`);
  return { ok: true };
}

export async function createEmailInviteAction(input: {
  workspaceId: string;
  email: string;
  maxUses: number;
  expiresInHours: number;
  label: string;
  workspaceName?: string;
  role?: 'admin' | 'member' | 'guest';
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  if (!(await requireWorkspaceAdmin(supabase, input.workspaceId, user.id))) {
    return { error: 'Only socialspace admins can create invites.' };
  }

  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return { error: 'Enter a valid email address.' };
  }

  const maxUses = Math.max(1, Math.floor(Number(input.maxUses)) || 1);
  const token = generateInviteToken();
  const expires_at = expiresAtFromHours(input.expiresInHours);
  const label = input.label?.trim() || null;

  const { error: insErr } = await supabase.from('invitations').insert({
    workspace_id: input.workspaceId,
    created_by: user.id,
    token,
    invite_type: 'email',
    target_identity: email,
    label,
    max_uses: maxUses,
    expires_at,
    role: input.role ?? 'member',
  });

  if (insErr) {
    return { error: insErr.message };
  }

  await insertInviteJourneyByToken(token, 'invite_created', {}, { userId: user.id });

  const inviteUrl = inviteUrlForToken(token);
  const send = await sendInviteEmail({
    to: email,
    inviteUrl,
    workspaceName: input.workspaceName,
  });

  if (send.error) {
    return { error: `Invite created but email failed: ${send.error}` };
  }

  revalidatePath(`/app/${input.workspaceId}/invites`);
  return { ok: true };
}

function normalizeE164ish(phone: string): string {
  return phone.trim().replace(/\s+/g, '');
}

export async function createSmsInviteAction(input: {
  workspaceId: string;
  phone: string;
  maxUses: number;
  expiresInHours: number;
  label: string;
  workspaceName?: string;
  role?: 'admin' | 'member' | 'guest';
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  if (!(await requireWorkspaceAdmin(supabase, input.workspaceId, user.id))) {
    return { error: 'Only socialspace admins can create invites.' };
  }

  const target = normalizeE164ish(input.phone);
  if (!target || target.length < 8) {
    return { error: 'Enter a valid phone number (E.164, e.g. +15551234567).' };
  }

  const maxUses = Math.max(1, Math.floor(Number(input.maxUses)) || 1);
  const token = generateInviteToken();
  const expires_at = expiresAtFromHours(input.expiresInHours);
  const label = input.label?.trim() || null;

  const { error: insErr } = await supabase.from('invitations').insert({
    workspace_id: input.workspaceId,
    created_by: user.id,
    token,
    invite_type: 'sms',
    target_identity: target,
    label,
    max_uses: maxUses,
    expires_at,
    role: input.role ?? 'member',
  });

  if (insErr) {
    return { error: insErr.message };
  }

  await insertInviteJourneyByToken(token, 'invite_created', {}, { userId: user.id });

  const inviteUrl = inviteUrlForToken(token);
  const body = input.workspaceName
    ? `You're invited to ${input.workspaceName} on BuddyBubble. Join: ${inviteUrl}`
    : `You're invited to BuddyBubble. Join: ${inviteUrl}`;

  const send = await sendInviteSms({ to: target, body });

  if (send.error) {
    return { error: `Invite created but SMS failed: ${send.error}` };
  }

  revalidatePath(`/app/${input.workspaceId}/invites`);
  return { ok: true };
}
