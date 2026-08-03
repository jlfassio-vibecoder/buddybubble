import { createClient } from '@utils/supabase/client';
import type { EventRsvpRow } from '@/types/database';

export type EventRsvpWithProfile = EventRsvpRow & {
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

/** List going RSVPs for an event task (oldest first), with profile display fields. */
export async function listEventRsvps(taskId: string): Promise<EventRsvpWithProfile[]> {
  const tid = taskId.trim();
  if (!tid) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('event_rsvps')
    .select(
      'id, workspace_id, task_id, user_id, status, created_at, user:users!event_rsvps_user_id_fkey(id, full_name, email, avatar_url)',
    )
    .eq('task_id', tid)
    .eq('status', 'going')
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const u = readNestedUser((row as { user?: unknown }).user);
    const { user: _user, ...rest } = row as EventRsvpRow & { user?: unknown };
    void _user;
    return {
      ...rest,
      displayName: displayNameFromUser(u?.full_name, u?.email),
      avatarUrl:
        typeof u?.avatar_url === 'string' && u.avatar_url.trim() ? u.avatar_url.trim() : null,
    };
  });
}

export async function enrollEventRsvp(args: {
  taskId: string;
  workspaceId: string;
  userId: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const taskId = args.taskId.trim();
  const workspaceId = args.workspaceId.trim();
  const userId = args.userId.trim();
  if (!taskId || !workspaceId || !userId) {
    return { ok: false, error: 'Missing event, workspace, or user.' };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('event_rsvps')
    .insert({
      task_id: taskId,
      workspace_id: workspaceId,
      user_id: userId,
      status: 'going',
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: false, error: 'Could not create RSVP.' };
  return { ok: true, id: data.id };
}

export async function unenrollEventRsvp(
  rsvpId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = rsvpId.trim();
  if (!id) return { ok: false, error: 'No RSVP to remove.' };

  const supabase = createClient();
  const { error } = await supabase.from('event_rsvps').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
