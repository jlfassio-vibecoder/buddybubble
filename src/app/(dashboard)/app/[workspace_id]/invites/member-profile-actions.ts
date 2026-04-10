'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@utils/supabase/server';
import type { MemberRole } from '@/types/database';
import type { ActionResult } from './member-actions';

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

function isWorkspaceAdmin(role: MemberRole | null): boolean {
  return role === 'owner' || role === 'admin';
}

function normalizeChildrenNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === 'string');
}

export type WorkspaceMemberProfileForAdmin = {
  user_id: string;
  workspace_role: MemberRole;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  bio: string | null;
  children_names: string[];
  timezone: string | null;
  note_body: string | null;
  note_updated_at: string | null;
};

export async function getWorkspaceMemberProfileForAdminAction(input: {
  workspaceId: string;
  subjectUserId: string;
}): Promise<ActionResult<{ profile: WorkspaceMemberProfileForAdmin }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const callerRole = await getCallerRole(supabase, input.workspaceId, user.id);
  if (!isWorkspaceAdmin(callerRole)) {
    return { error: 'Only workspace owners and admins can view member profiles.' };
  }

  const { data: membership, error: memErr } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', input.workspaceId)
    .eq('user_id', input.subjectUserId)
    .maybeSingle();

  if (memErr) return { error: memErr.message };
  if (!membership) {
    return { error: 'That user is not a member of this workspace.' };
  }

  const wsRole = (membership as { role: MemberRole }).role;

  const { data: profileRow, error: userErr } = await supabase
    .from('users')
    .select('id, full_name, email, avatar_url, bio, children_names, timezone')
    .eq('id', input.subjectUserId)
    .maybeSingle();

  if (userErr) return { error: userErr.message };
  if (!profileRow) {
    return { error: 'User profile not found.' };
  }

  const u = profileRow as {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
    bio: string | null;
    children_names: unknown;
    timezone: string | null;
  };

  const { data: noteRow } = await supabase
    .from('workspace_member_notes')
    .select('body, updated_at')
    .eq('workspace_id', input.workspaceId)
    .eq('subject_user_id', input.subjectUserId)
    .maybeSingle();

  const note = noteRow as { body: string | null; updated_at: string } | null;

  return {
    ok: true,
    profile: {
      user_id: u.id,
      workspace_role: wsRole,
      full_name: u.full_name,
      email: u.email,
      avatar_url: u.avatar_url,
      bio: u.bio,
      children_names: normalizeChildrenNames(u.children_names),
      timezone: u.timezone ?? null,
      note_body: note?.body ?? null,
      note_updated_at: note?.updated_at ?? null,
    },
  };
}

const NOTE_MAX_LENGTH = 10_000;

export async function upsertWorkspaceMemberNoteAction(input: {
  workspaceId: string;
  subjectUserId: string;
  body: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const callerRole = await getCallerRole(supabase, input.workspaceId, user.id);
  if (!isWorkspaceAdmin(callerRole)) {
    return { error: 'Only workspace owners and admins can edit member notes.' };
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', input.workspaceId)
    .eq('user_id', input.subjectUserId)
    .maybeSingle();

  if (!membership) {
    return { error: 'That user is not a member of this workspace.' };
  }

  const trimmed = input.body.trim();
  if (trimmed.length > NOTE_MAX_LENGTH) {
    return { error: `Notes must be ${NOTE_MAX_LENGTH.toLocaleString()} characters or fewer.` };
  }

  const { error } = await supabase.from('workspace_member_notes').upsert(
    {
      workspace_id: input.workspaceId,
      subject_user_id: input.subjectUserId,
      body: trimmed.length > 0 ? trimmed : null,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    },
    { onConflict: 'workspace_id,subject_user_id' },
  );

  if (error) return { error: error.message };

  revalidatePath(`/app/${input.workspaceId}/invites`);
  return { ok: true };
}
