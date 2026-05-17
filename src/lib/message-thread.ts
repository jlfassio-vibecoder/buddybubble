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

/**
 * Bubble / aggregate scopes represent **main channel** chat only: rows where
 * `messages.target_task_id` is null. Task-scoped comments share `bubble_id` with
 * their parent task but must never appear in these universes.
 */
export function isMainBubbleChannelScope(filter: MessageThreadFilter): boolean {
  return filter.scope === 'bubble' || filter.scope === 'all_bubbles';
}

/** True when the row is a unified task comment / thread (`target_task_id` set). */
export function isTaskScopedMessageRow(row: { target_task_id?: string | null }): boolean {
  const t = row.target_task_id;
  return t != null && String(t).trim() !== '';
}

/**
 * Realtime `postgres_changes` for `messages` can only filter on `bubble_id`, so task-scoped
 * inserts/updates/deletes still arrive for subscribers on that bubble. Main-channel hooks must
 * drop these payloads before mutating React state.
 */
export function shouldDropRealtimeMessagePayloadForMainBubbleScope(
  filter: MessageThreadFilter,
  row: { target_task_id?: string | null },
): boolean {
  return isMainBubbleChannelScope(filter) && isTaskScopedMessageRow(row);
}

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
