'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@utils/supabase/server';
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

export type WorkspaceMemberWithProfile = {
  user_id: string;
  role: MemberRole;
  created_at: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

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
    return { error: 'Only admins can view the member list.' };
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
    return { error: 'Only admins can change member roles.' };
  }

  // Only owners can promote someone to owner or demote an existing owner
  if (input.newRole === 'owner' && callerRole !== 'owner') {
    return { error: 'Only an owner can promote another member to owner.' };
  }

  // Prevent demoting the last owner
  if (input.targetUserId === user.id || input.newRole !== 'owner') {
    const { count } = await supabase
      .from('workspace_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('workspace_id', input.workspaceId)
      .eq('role', 'owner');

    const targetCurrentRole = await getCallerRole(supabase, input.workspaceId, input.targetUserId);
    if (targetCurrentRole === 'owner' && (count ?? 0) <= 1 && input.newRole !== 'owner') {
      return { error: 'Cannot demote the last owner. Promote another member to owner first.' };
    }
  }

  const { error } = await supabase
    .from('workspace_members')
    .update({ role: input.newRole })
    .eq('workspace_id', input.workspaceId)
    .eq('user_id', input.targetUserId);

  if (error) return { error: error.message };

  revalidatePath(`/app/${input.workspaceId}/invites`);
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
    return { error: 'Only admins can remove members.' };
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

  revalidatePath(`/app/${input.workspaceId}/invites`);
  return { ok: true };
}
