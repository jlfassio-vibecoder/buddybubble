'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ItemType, TaskRow, TaskVisibility } from '@/types/database';
import type { TaskPriority } from '@/lib/task-priority';
import { isMissingColumnSchemaCacheError } from '@/lib/supabase-schema-errors';
import { computeStatusWhenCreateScheduledDateUnsupported } from '@/components/modals/task-modal/task-modal-save-utils';

/** Columns written on `tasks.insert` (create + optimistic draft). */
export type TasksInsertRow = {
  bubble_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: TaskPriority;
  position: number;
  scheduled_on: string | null;
  item_type: ItemType;
  metadata: TaskRow['metadata'];
  visibility: TaskVisibility;
  created_by: string;
  scheduled_time?: string | null;
};

export async function resolveInsertPosition(
  supabase: SupabaseClient,
  bubbleId: string,
): Promise<number> {
  const { data: existing } = await supabase
    .from('tasks')
    .select('position')
    .eq('bubble_id', bubbleId)
    .order('position', { ascending: false })
    .limit(1);
  return existing && existing.length > 0
    ? Number((existing[0] as { position: number }).position) + 1
    : 0;
}

/**
 * Inserts a task row with the same schema-cache retry fallbacks as `useTaskSaveAndCreate.createTask`.
 */
export async function insertTasksRowWithRetries(
  supabase: SupabaseClient,
  insertRow: TasksInsertRow,
  retryCtx: {
    status: string;
    calendarTimezone: string | null;
    hasTodayBoardColumn: boolean;
  },
): Promise<{ data: { id: string } | null; error: Error | null }> {
  let { data, error: cErr } = await supabase
    .from('tasks')
    .insert(insertRow)
    .select('id')
    .maybeSingle();

  if (cErr && isMissingColumnSchemaCacheError(cErr, 'scheduled_on')) {
    const { scheduled_on: _s, scheduled_time: _t, ...insertNoSched } = insertRow;
    const statusWithoutPersistedSchedule = computeStatusWhenCreateScheduledDateUnsupported({
      currentStatus: retryCtx.status,
      calendarTimezone: retryCtx.calendarTimezone,
      hasTodayBoardColumn: retryCtx.hasTodayBoardColumn,
    });
    const retry = await supabase
      .from('tasks')
      .insert({ ...insertNoSched, status: statusWithoutPersistedSchedule })
      .select('id')
      .maybeSingle();
    data = retry.data;
    cErr = retry.error;
  }

  if (cErr && isMissingColumnSchemaCacheError(cErr, 'scheduled_time')) {
    const { scheduled_time: _st, ...insertNoTime } = insertRow as TasksInsertRow & {
      scheduled_time?: string | null;
    };
    const retry = await supabase.from('tasks').insert(insertNoTime).select('id').maybeSingle();
    data = retry.data;
    cErr = retry.error;
  }

  if (cErr && isMissingColumnSchemaCacheError(cErr, 'priority')) {
    const { priority: _p, ...insertWithoutPriority } = insertRow;
    const second = await supabase
      .from('tasks')
      .insert(insertWithoutPriority)
      .select('id')
      .maybeSingle();
    data = second.data;
    cErr = second.error;
  }

  if (cErr && isMissingColumnSchemaCacheError(cErr, 'visibility')) {
    const { visibility: _v, ...insertWithoutVisibility } = insertRow;
    const second = await supabase
      .from('tasks')
      .insert(insertWithoutVisibility)
      .select()
      .maybeSingle();
    data = second.data;
    cErr = second.error;
  }

  if (cErr && isMissingColumnSchemaCacheError(cErr, 'created_by')) {
    const { created_by: _cb, ...insertWithoutCreatedBy } = insertRow;
    const second = await supabase
      .from('tasks')
      .insert(insertWithoutCreatedBy)
      .select('id')
      .maybeSingle();
    data = second.data;
    cErr = second.error;
  }

  return { data: data as { id: string } | null, error: cErr };
}
