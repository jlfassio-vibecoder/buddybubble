import { createClient } from '@utils/supabase/client';
import type { MessageRow, MessageRowWithEmbeddedTask, TaskRow } from '@/types/database';
import type { ChatUserSnapshot } from '@/types/chat';

/** PostgREST embed for `messages.attached_task_id` → `tasks` (`messages_attached_task_id_fkey`). */
export const MESSAGES_SELECT_WITH_TASK = '*, tasks!messages_attached_task_id_fkey(*)';

export function toChatUserSnapshot(u: {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
  created_at: string;
}): ChatUserSnapshot {
  return {
    id: u.id,
    full_name: u.full_name,
    avatar_url: u.avatar_url,
    email: u.email,
    created_at: u.created_at,
  };
}

export async function fetchEmbeddedTaskForMessage(
  supabase: ReturnType<typeof createClient>,
  row: MessageRow,
): Promise<MessageRowWithEmbeddedTask> {
  if (!row.attached_task_id) {
    return { ...row, tasks: null };
  }
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', row.attached_task_id)
    .maybeSingle();
  return { ...row, tasks: (data as TaskRow | null) ?? null };
}

export function buildReplyCounts(
  rows: readonly Pick<MessageRow, 'parent_id'>[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.parent_id) {
      m.set(r.parent_id, (m.get(r.parent_id) ?? 0) + 1);
    }
  }
  return m;
}

export type MessageThreadFilter =
  | { scope: 'bubble'; bubbleId: string }
  | { scope: 'all_bubbles'; bubbleIds: readonly string[] }
  | { scope: 'task'; taskId: string };

export function messageThreadChannelName(filter: MessageThreadFilter): string {
  if (filter.scope === 'all_bubbles') {
    return `messages-rt-all:${[...filter.bubbleIds].sort().join(',')}`;
  }
  if (filter.scope === 'task') {
    return `messages-rt:task:${filter.taskId}`;
  }
  return `messages-rt:${filter.bubbleId}`;
}

export function messageThreadFilterKey(filter: MessageThreadFilter | null): string {
  if (!filter) return '';
  if (filter.scope === 'bubble') return `bubble:${filter.bubbleId}`;
  if (filter.scope === 'all_bubbles') return `all:${[...filter.bubbleIds].sort().join(',')}`;
  return `task:${filter.taskId}`;
}
