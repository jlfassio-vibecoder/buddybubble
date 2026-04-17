import type { Database, Json } from '@/types/database';
import type { createClient } from '@utils/supabase/client';
import type { TaskActivityEntry } from '@/types/task-modal';

/** Entries present in `next` but not in `prev` (matched by `id`), for persisting append-only activity. */
export function diffNewActivityEntries(
  prev: TaskActivityEntry[],
  next: TaskActivityEntry[],
): TaskActivityEntry[] {
  const prevIds = new Set(prev.map((e) => e.id));
  return next.filter((e) => !prevIds.has(e.id));
}

export function taskActivityEntryToLogInsert(
  taskId: string,
  entry: TaskActivityEntry,
): Database['public']['Tables']['task_activity_log']['Insert'] {
  return {
    task_id: taskId,
    user_id: entry.user_id ?? null,
    action_type: entry.type,
    payload: {
      message: entry.message,
      field: entry.field,
      from: entry.from,
      to: entry.to,
      at: entry.at,
      legacy_entry_id: entry.id,
    } as Json,
  };
}

export function taskActivityLogRowToEntry(row: {
  id: string;
  user_id: string | null;
  action_type: string;
  payload: Json;
  created_at: string;
}): TaskActivityEntry {
  const p =
    typeof row.payload === 'object' && row.payload !== null && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {};
  return {
    id: typeof p.legacy_entry_id === 'string' ? p.legacy_entry_id : row.id,
    type: row.action_type,
    message: typeof p.message === 'string' ? p.message : '',
    at: typeof p.at === 'string' ? p.at : row.created_at,
    user_id: row.user_id,
    field: typeof p.field === 'string' ? p.field : undefined,
    from: p.from != null ? String(p.from) : null,
    to: p.to != null ? String(p.to) : null,
  };
}

export async function insertTaskActivityLogEntries(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  entries: TaskActivityEntry[],
): Promise<{ error: Error | null }> {
  if (entries.length === 0) return { error: null };
  const rows = entries.map((e) => taskActivityEntryToLogInsert(taskId, e));
  const { error } = await supabase
    .from('task_activity_log')
    .insert(rows as Database['public']['Tables']['task_activity_log']['Insert'][]);
  return { error: error ? new Error(error.message) : null };
}
