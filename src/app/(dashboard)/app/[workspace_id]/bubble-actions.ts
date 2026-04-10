'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@utils/supabase/server';
import type { BubbleMemberRole } from '@/types/database';

export type WorkspaceBubbleSummary = {
  id: string;
  name: string;
  is_private: boolean;
};

export type WorkspaceBubbleMembership = {
  bubble_id: string;
  user_id: string;
  role: BubbleMemberRole;
};

export type ActionResult<T extends Record<string, unknown> = Record<never, never>> =
  | { error: string }
  | ({ ok: true } & T);

async function requireWorkspaceAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  const role = (data as { role?: string } | null)?.role;
  if (role !== 'owner' && role !== 'admin') {
    return { ok: false, error: 'Only workspace admins and owners can manage access.' };
  }
  return { ok: true };
}

async function requireBubbleAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bubbleId: string,
  userId: string,
): Promise<{ ok: true; workspaceId: string } | { ok: false; error: string }> {
  const { data: bubble } = await supabase
    .from('bubbles')
    .select('workspace_id')
    .eq('id', bubbleId)
    .maybeSingle();

  if (!bubble) return { ok: false, error: 'Bubble not found.' };

  const ws = bubble as { workspace_id: string };

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', ws.workspace_id)
    .eq('user_id', userId)
    .maybeSingle();

  const role = (member as { role?: string } | null)?.role;
  if (role !== 'owner' && role !== 'admin') {
    return { ok: false, error: 'Only workspace admins can manage bubble settings.' };
  }

  return { ok: true, workspaceId: ws.workspace_id };
}

export async function updateBubbleAction(input: {
  workspaceId: string;
  bubbleId: string;
  name?: string;
  isPrivate?: boolean;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const check = await requireBubbleAdmin(supabase, input.bubbleId, user.id);
  if (!check.ok) return { error: check.error };

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.isPrivate !== undefined) updates.is_private = input.isPrivate;

  if (Object.keys(updates).length === 0) return { ok: true };

  const { error } = await supabase.from('bubbles').update(updates).eq('id', input.bubbleId);

  if (error) return { error: error.message };

  revalidatePath(`/app/${check.workspaceId}`);
  return { ok: true };
}

export type BubbleMemberWithProfile = {
  id: string;
  user_id: string;
  role: BubbleMemberRole;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

export async function listBubbleMembersAction(
  bubbleId: string,
): Promise<ActionResult<{ members: BubbleMemberWithProfile[] }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const check = await requireBubbleAdmin(supabase, bubbleId, user.id);
  if (!check.ok) return { error: check.error };

  const { data, error } = await supabase
    .from('bubble_members')
    .select('id, user_id, role, users(full_name, email, avatar_url)')
    .eq('bubble_id', bubbleId)
    .order('created_at', { ascending: true });

  if (error) return { error: error.message };

  const members: BubbleMemberWithProfile[] = (
    (data ?? []) as unknown as Array<{
      id: string;
      user_id: string;
      role: BubbleMemberRole;
      users: { full_name: string | null; email: string | null; avatar_url: string | null } | null;
    }>
  ).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    role: row.role,
    full_name: row.users?.full_name ?? null,
    email: row.users?.email ?? null,
    avatar_url: row.users?.avatar_url ?? null,
  }));

  return { ok: true, members };
}

export async function addBubbleMemberAction(input: {
  workspaceId: string;
  bubbleId: string;
  userId: string;
  role: BubbleMemberRole;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const check = await requireBubbleAdmin(supabase, input.bubbleId, user.id);
  if (!check.ok) return { error: check.error };

  // Verify target is a workspace member (use verified workspaceId from bubble lookup)
  const { data: wsMember } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', check.workspaceId)
    .eq('user_id', input.userId)
    .maybeSingle();

  if (!wsMember) return { error: 'User is not a member of this workspace.' };

  const { error } = await supabase.from('bubble_members').upsert(
    {
      bubble_id: input.bubbleId,
      user_id: input.userId,
      role: input.role,
    },
    { onConflict: 'bubble_id,user_id' },
  );

  if (error) return { error: error.message };

  revalidatePath(`/app/${check.workspaceId}`);
  return { ok: true };
}

export async function updateBubbleMemberRoleAction(input: {
  workspaceId: string;
  bubbleId: string;
  bubbleMemberId: string;
  role: BubbleMemberRole;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const check = await requireBubbleAdmin(supabase, input.bubbleId, user.id);
  if (!check.ok) return { error: check.error };

  const { error } = await supabase
    .from('bubble_members')
    .update({ role: input.role })
    .eq('id', input.bubbleMemberId)
    .eq('bubble_id', input.bubbleId);

  if (error) return { error: error.message };

  revalidatePath(`/app/${check.workspaceId}`);
  return { ok: true };
}

export async function removeBubbleMemberAction(input: {
  workspaceId: string;
  bubbleId: string;
  bubbleMemberId: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const check = await requireBubbleAdmin(supabase, input.bubbleId, user.id);
  if (!check.ok) return { error: check.error };

  const { error } = await supabase
    .from('bubble_members')
    .delete()
    .eq('id', input.bubbleMemberId)
    .eq('bubble_id', input.bubbleId);

  if (error) return { error: error.message };

  revalidatePath(`/app/${check.workspaceId}`);
  return { ok: true };
}

export type WorkspaceMemberOption = {
  user_id: string;
  full_name: string | null;
  email: string | null;
};

export async function listWorkspaceMembersForBubbleAction(
  workspaceId: string,
  bubbleId: string,
): Promise<ActionResult<{ members: WorkspaceMemberOption[] }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const check = await requireBubbleAdmin(supabase, bubbleId, user.id);
  if (!check.ok) return { error: check.error };

  // Workspace members not already in bubble_members
  const { data: existing } = await supabase
    .from('bubble_members')
    .select('user_id')
    .eq('bubble_id', bubbleId);

  const existingIds = new Set(
    ((existing ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
  );

  const { data, error } = await supabase
    .from('workspace_members')
    .select('user_id, users(full_name, email)')
    .eq('workspace_id', check.workspaceId);

  if (error) return { error: error.message };

  const members: WorkspaceMemberOption[] = (
    (data ?? []) as unknown as Array<{
      user_id: string;
      users: { full_name: string | null; email: string | null } | null;
    }>
  )
    .filter((r) => !existingIds.has(r.user_id))
    .map((r) => ({
      user_id: r.user_id,
      full_name: r.users?.full_name ?? null,
      email: r.users?.email ?? null,
    }));

  return { ok: true, members };
}

// ---------------------------------------------------------------------------
// Workspace-wide bubble access — for the permissions dashboard
// ---------------------------------------------------------------------------

export async function listWorkspaceBubbleAccessAction(
  workspaceId: string,
): Promise<
  ActionResult<{ bubbles: WorkspaceBubbleSummary[]; memberships: WorkspaceBubbleMembership[] }>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const auth = await requireWorkspaceAdmin(supabase, workspaceId, user.id);
  if (!auth.ok) return { error: auth.error };

  const { data: bubbleRows, error: bubbleError } = await supabase
    .from('bubbles')
    .select('id, name, is_private')
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true });

  if (bubbleError) return { error: bubbleError.message };

  const bubbles = (bubbleRows ?? []) as WorkspaceBubbleSummary[];

  if (bubbles.length === 0) return { ok: true, bubbles: [], memberships: [] };

  const bubbleIds = bubbles.map((b) => b.id);

  const { data: membershipRows, error: membershipError } = await supabase
    .from('bubble_members')
    .select('bubble_id, user_id, role')
    .in('bubble_id', bubbleIds);

  if (membershipError) return { error: membershipError.message };

  const memberships = (membershipRows ?? []) as WorkspaceBubbleMembership[];

  return { ok: true, bubbles, memberships };
}

export async function revokeBubbleAccessAction(input: {
  workspaceId: string;
  bubbleId: string;
  userId: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const check = await requireBubbleAdmin(supabase, input.bubbleId, user.id);
  if (!check.ok) return { error: check.error };

  if (input.workspaceId !== check.workspaceId) {
    return { error: 'Bubble does not belong to this workspace.' };
  }

  const { error } = await supabase
    .from('bubble_members')
    .delete()
    .eq('bubble_id', input.bubbleId)
    .eq('user_id', input.userId);

  if (error) return { error: error.message };

  revalidatePath(`/app/${check.workspaceId}`);
  return { ok: true };
}
