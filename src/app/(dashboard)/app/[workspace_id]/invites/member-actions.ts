'use server';

import { revalidateTag } from 'next/cache';
import { createClient } from '@utils/supabase/server';
import { bubblesCacheTag } from '../load-bubbles-data';
import {
  memberBubbleDisplayName,
  parseTrialBubbleIdFromLeadMetadata,
} from '@/lib/trial-member-bubble-name';
import { invitesCacheTag } from './load-invites-data';
import type { MemberRole } from '@/types/database';

export type ActionResult<T extends Record<string, unknown> = Record<never, never>> =
  | { error: string }
  | ({ ok: true } & T);

async function getCallerRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  callerId: string,
): Promise<MemberRole | null> {
  const { data } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', callerId)
    .maybeSingle();
  return (data as { role?: MemberRole } | null)?.role ?? null;
}

/**
 * Best-effort: rename trial 1:1 bubbles and set bubble_type=dm after leaving `trialing`.
 * Failures are logged; they must not roll back the role change.
 */
async function convertTrialBubblesAfterLeavingTrialing(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  targetUserId: string,
  newRole: MemberRole,
): Promise<boolean> {
  const candidateIds = new Set<string>();

  const { data: leadRows, error: leadErr } = await supabase
    .from('leads')
    .select('metadata')
    .eq('workspace_id', workspaceId)
    .eq('user_id', targetUserId)
    .order('last_seen_at', { ascending: false })
    .limit(5);

  if (leadErr) {
    console.error('[updateMemberRoleAction] leads lookup for trial bubble', leadErr);
  } else {
    for (const row of leadRows ?? []) {
      const id = parseTrialBubbleIdFromLeadMetadata((row as { metadata?: unknown }).metadata);
      if (id) candidateIds.add(id);
    }
  }

  const { data: trialMemberships, error: memErr } = await supabase
    .from('bubble_members')
    .select('bubble_id, bubbles!inner(workspace_id, bubble_type)')
    .eq('user_id', targetUserId)
    .eq('bubbles.workspace_id', workspaceId)
    .eq('bubbles.bubble_type', 'trial');

  if (memErr) {
    console.error('[updateMemberRoleAction] bubble_members lookup', memErr);
  } else {
    for (const row of trialMemberships ?? []) {
      const id = (row as { bubble_id?: string }).bubble_id;
      if (typeof id === 'string' && id.length > 0) candidateIds.add(id);
    }
  }

  if (candidateIds.size === 0) return false;

  const { data: bubbles, error: fetchErr } = await supabase
    .from('bubbles')
    .select('id, name, bubble_type')
    .eq('workspace_id', workspaceId)
    .in('id', [...candidateIds]);

  if (fetchErr) {
    console.error('[updateMemberRoleAction] bubbles fetch for convert', fetchErr);
    return false;
  }

  let converted = false;
  for (const row of bubbles ?? []) {
    const bubble = row as { id: string; name: string; bubble_type: string | null };
    if (bubble.bubble_type !== 'trial') continue;
    const nextName = memberBubbleDisplayName({
      previousName: bubble.name,
      newRole,
    });
    const { error: updateErr } = await supabase
      .from('bubbles')
      .update({ name: nextName, bubble_type: 'dm' })
      .eq('id', bubble.id)
      .eq('workspace_id', workspaceId);
    if (updateErr) {
      console.error('[updateMemberRoleAction] trial bubble convert failed', bubble.id, updateErr);
      continue;
    }
    converted = true;
  }

  return converted;
}

export type WorkspaceMemberWithProfile = {
  user_id: string;
  role: MemberRole;
  created_at: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

/**
 * Admin/owner roster: always returns real emails for moderation and support.
 * Peer-facing UIs (e.g. chat) apply `show_email_to_workspace_members` separately.
 */
export async function listWorkspaceMembersAction(
  workspaceId: string,
): Promise<ActionResult<{ members: WorkspaceMemberWithProfile[] }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const callerRole = await getCallerRole(supabase, workspaceId, user.id);
  if (!callerRole || (callerRole !== 'admin' && callerRole !== 'owner')) {
    return { error: 'Only admins and owners can view the member list.' };
  }

  const { data, error } = await supabase
    .from('workspace_members')
    .select('user_id, role, created_at, users(full_name, email, avatar_url)')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });

  if (error) return { error: error.message };

  const members: WorkspaceMemberWithProfile[] = (
    (data ?? []) as unknown as Array<{
      user_id: string;
      role: MemberRole;
      created_at: string;
      users: { full_name: string | null; email: string | null; avatar_url: string | null } | null;
    }>
  ).map((row) => ({
    user_id: row.user_id,
    role: row.role,
    created_at: row.created_at,
    full_name: row.users?.full_name ?? null,
    email: row.users?.email ?? null,
    avatar_url: row.users?.avatar_url ?? null,
  }));

  return { ok: true, members };
}

export async function updateMemberRoleAction(input: {
  workspaceId: string;
  targetUserId: string;
  newRole: MemberRole;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const callerRole = await getCallerRole(supabase, input.workspaceId, user.id);
  if (!callerRole || (callerRole !== 'admin' && callerRole !== 'owner')) {
    return { error: 'Only admins and owners can change member roles.' };
  }

  // Only owners can promote someone to owner or demote an existing owner
  if (input.newRole === 'owner' && callerRole !== 'owner') {
    return { error: 'Only an owner can promote another member to owner.' };
  }

  const targetCurrentRole = await getCallerRole(supabase, input.workspaceId, input.targetUserId);

  // Prevent demoting the last owner
  if (input.targetUserId === user.id || input.newRole !== 'owner') {
    const { count } = await supabase
      .from('workspace_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('workspace_id', input.workspaceId)
      .eq('role', 'owner');

    if (targetCurrentRole === 'owner' && (count ?? 0) <= 1 && input.newRole !== 'owner') {
      return { error: 'Cannot demote the last owner. Promote another member to owner first.' };
    }
  }

  const leavingTrialing = targetCurrentRole === 'trialing' && input.newRole !== 'trialing';

  const memberUpdates: { role: MemberRole; onboarding_status?: string } = {
    role: input.newRole,
  };
  if (leavingTrialing) {
    memberUpdates.onboarding_status = 'completed';
  }

  const { error } = await supabase
    .from('workspace_members')
    .update(memberUpdates)
    .eq('workspace_id', input.workspaceId)
    .eq('user_id', input.targetUserId);

  if (error) return { error: error.message };

  if (leavingTrialing) {
    const converted = await convertTrialBubblesAfterLeavingTrialing(
      supabase,
      input.workspaceId,
      input.targetUserId,
      input.newRole,
    );
    if (converted) {
      revalidateTag(bubblesCacheTag(input.workspaceId), 'max');
    }
  }

  revalidateTag(invitesCacheTag(input.workspaceId), 'max');
  return { ok: true };
}

export async function removeMemberAction(input: {
  workspaceId: string;
  targetUserId: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const callerRole = await getCallerRole(supabase, input.workspaceId, user.id);
  if (!callerRole || (callerRole !== 'admin' && callerRole !== 'owner')) {
    return { error: 'Only admins and owners can remove members.' };
  }

  // Prevent removing the last owner
  const targetRole = await getCallerRole(supabase, input.workspaceId, input.targetUserId);
  if (targetRole === 'owner') {
    const { count } = await supabase
      .from('workspace_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('workspace_id', input.workspaceId)
      .eq('role', 'owner');

    if ((count ?? 0) <= 1) {
      return { error: 'Cannot remove the last owner.' };
    }
  }

  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', input.workspaceId)
    .eq('user_id', input.targetUserId);

  if (error) return { error: error.message };

  revalidateTag(invitesCacheTag(input.workspaceId), 'max');
  return { ok: true };
}
