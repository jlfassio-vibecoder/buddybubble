'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@utils/supabase/server';
import type { MemberRole } from '@/types/database';
import type { ActionResult } from './member-actions';

// Copilot suggestion ignored: Exporting getCallerRole from member-actions would require changing its signature and every caller; local helper with explicit query-error handling keeps the blast radius minimal.

async function getCallerWorkspaceRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  callerId: string,
): Promise<{ role: MemberRole | null; queryError: string | null }> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', callerId)
    .maybeSingle();
  if (error) return { role: null, queryError: error.message };
  const role = (data as { role?: MemberRole } | null)?.role ?? null;
  return { role, queryError: null };
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

/** Email is always visible here: owners/admins need it for support regardless of peer privacy. */
export async function getWorkspaceMemberProfileForAdminAction(input: {
  workspaceId: string;
  subjectUserId: string;
}): Promise<ActionResult<{ profile: WorkspaceMemberProfileForAdmin }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const { role: callerRole, queryError: callerRoleErr } = await getCallerWorkspaceRole(
    supabase,
    input.workspaceId,
    user.id,
  );
  if (callerRoleErr) return { error: callerRoleErr };
  if (!isWorkspaceAdmin(callerRole)) {
    return { error: 'Only socialspace owners and admins can view member profiles.' };
  }

  const { data: membership, error: memErr } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', input.workspaceId)
    .eq('user_id', input.subjectUserId)
    .maybeSingle();

  if (memErr) return { error: memErr.message };
  if (!membership) {
    return { error: 'That user is not a member of this socialspace.' };
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

  const { data: noteRow, error: noteErr } = await supabase
    .from('workspace_member_notes')
    .select('body, updated_at')
    .eq('workspace_id', input.workspaceId)
    .eq('subject_user_id', input.subjectUserId)
    .maybeSingle();

  if (noteErr) return { error: noteErr.message };

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

  const { role: callerRole, queryError: callerRoleErr } = await getCallerWorkspaceRole(
    supabase,
    input.workspaceId,
    user.id,
  );
  if (callerRoleErr) return { error: callerRoleErr };
  if (!isWorkspaceAdmin(callerRole)) {
    return { error: 'Only socialspace owners and admins can edit member notes.' };
  }

  const { data: membership, error: membershipErr } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', input.workspaceId)
    .eq('user_id', input.subjectUserId)
    .maybeSingle();

  if (membershipErr) return { error: membershipErr.message };
  if (!membership) {
    return { error: 'That user is not a member of this socialspace.' };
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
    },
    { onConflict: 'workspace_id,subject_user_id' },
  );

  if (error) return { error: error.message };

  revalidatePath(`/app/${input.workspaceId}/invites`);
  return { ok: true };
}
