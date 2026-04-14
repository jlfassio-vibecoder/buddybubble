'use server';

import { formatUserFacingError } from '@/lib/format-error';
import { guestTaskAssignmentVisibilityOr, isGuestWorkspaceRole } from '@/lib/guest-task-query';
import { createClient } from '@utils/supabase/server';
import type { MemberRole, TaskRow } from '@/types/database';

export type ArchivedTasksResult = { ok: true; tasks: TaskRow[] } | { ok: false; error: string };

export type TaskMutationResult = { ok: true } | { ok: false; error: string };

/** Archived tasks for one bubble (`archived_at` set). RLS applies via workspace membership. */
export async function getArchivedTasksAction(bubbleId: string): Promise<ArchivedTasksResult> {
  const trimmed = bubbleId.trim();
  if (!trimmed) {
    return { ok: false, error: 'Missing bubble.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'You must be signed in.' };
  }

  let taskQuery = supabase
    .from('tasks')
    .select('*')
    .eq('bubble_id', trimmed)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });

  const { data: bubbleRow } = await supabase
    .from('bubbles')
    .select('workspace_id')
    .eq('id', trimmed)
    .maybeSingle();
  const wsId = bubbleRow?.workspace_id as string | undefined;
  if (wsId) {
    const { data: wm } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', wsId)
      .eq('user_id', user.id)
      .maybeSingle();
    const role = (wm as { role?: MemberRole } | null)?.role;
    if (isGuestWorkspaceRole(role)) {
      taskQuery = taskQuery.or(guestTaskAssignmentVisibilityOr(user.id));
    }
  }

  const { data, error } = await taskQuery;

  if (error) {
    return { ok: false, error: formatUserFacingError(error) };
  }

  return { ok: true, tasks: (data ?? []) as TaskRow[] };
}

export async function restoreTaskAction(taskId: string): Promise<TaskMutationResult> {
  const id = taskId.trim();
  if (!id) {
    return { ok: false, error: 'Missing task.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'You must be signed in.' };
  }

  const { error } = await supabase
    .from('tasks')
    .update({ archived_at: null })
    .eq('id', id)
    .not('archived_at', 'is', null);

  if (error) {
    return { ok: false, error: formatUserFacingError(error) };
  }
  return { ok: true };
}

export async function hardDeleteTaskAction(taskId: string): Promise<TaskMutationResult> {
  const id = taskId.trim();
  if (!id) {
    return { ok: false, error: 'Missing task.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'You must be signed in.' };
  }

  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)
    .not('archived_at', 'is', null);

  if (error) {
    return { ok: false, error: formatUserFacingError(error) };
  }
  return { ok: true };
}
