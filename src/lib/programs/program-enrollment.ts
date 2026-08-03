import { createClient } from '@utils/supabase/client';
import type { ProgramEnrollmentRow } from '@/types/database';

export type ProgramEnrollmentWithProfile = ProgramEnrollmentRow & {
  displayName: string;
  avatarUrl: string | null;
};

type UserRow = {
  id?: string;
  full_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
};

function displayNameFromUser(
  fullName: string | null | undefined,
  email: string | null | undefined,
): string {
  const trimmed = fullName?.trim();
  if (trimmed) return trimmed;
  const e = email?.trim();
  if (e && e.includes('@')) return e.split('@')[0] ?? e;
  return e ?? 'Unknown';
}

function readNestedUser(raw: unknown): UserRow | null {
  if (!raw || typeof raw !== 'object') return null;
  if (Array.isArray(raw)) {
    const first = raw[0];
    return first && typeof first === 'object' ? (first as UserRow) : null;
  }
  return raw as UserRow;
}

/** List enrollments for a program task (oldest first), with profile display fields. */
export async function listProgramEnrollments(
  taskId: string,
): Promise<ProgramEnrollmentWithProfile[]> {
  const tid = taskId.trim();
  if (!tid) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('program_enrollments')
    .select(
      'id, workspace_id, task_id, user_id, status, created_at, user:users!program_enrollments_user_id_fkey(id, full_name, email, avatar_url)',
    )
    .eq('task_id', tid)
    .eq('status', 'enrolled')
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const u = readNestedUser((row as { user?: unknown }).user);
    const { user: _user, ...rest } = row as ProgramEnrollmentRow & { user?: unknown };
    void _user;
    return {
      ...rest,
      displayName: displayNameFromUser(u?.full_name, u?.email),
      avatarUrl:
        typeof u?.avatar_url === 'string' && u.avatar_url.trim() ? u.avatar_url.trim() : null,
    };
  });
}

export async function enrollProgram(args: {
  taskId: string;
  workspaceId: string;
  userId: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const taskId = args.taskId.trim();
  const workspaceId = args.workspaceId.trim();
  const userId = args.userId.trim();
  if (!taskId || !workspaceId || !userId) {
    return { ok: false, error: 'Missing program, workspace, or user.' };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('program_enrollments')
    .insert({
      task_id: taskId,
      workspace_id: workspaceId,
      user_id: userId,
      status: 'enrolled',
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: false, error: 'Could not create enrollment.' };
  return { ok: true, id: data.id };
}

export async function unenrollProgram(
  enrollmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = enrollmentId.trim();
  if (!id) return { ok: false, error: 'No enrollment to remove.' };

  const supabase = createClient();
  const { error } = await supabase.from('program_enrollments').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Linked workout tasks for a program card (for session deep links). */
export async function listProgramLinkedWorkouts(
  programTaskId: string,
): Promise<{ id: string; title: string; program_session_key: string | null }[]> {
  const pid = programTaskId.trim();
  if (!pid) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, program_session_key')
    .eq('program_id', pid)
    .eq('item_type', 'workout');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    title: typeof r.title === 'string' ? r.title : '',
    program_session_key: r.program_session_key ?? null,
  }));
}
