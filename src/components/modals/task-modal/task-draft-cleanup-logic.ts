'use client';

import { createClient } from '@utils/supabase/client';
import type { ItemType, TaskRow, TaskVisibility } from '@/types/database';
import { normalizeItemType } from '@/lib/item-types';
import {
  buildTaskMetadataPayload,
  metadataFieldsFromParsed,
  parseTaskMetadata,
} from '@/lib/item-metadata';
import { asAttachments, type TaskSubtask } from '@/types/task-modal';
import { scheduledTimeToInputValue } from '@/lib/task-scheduled-time';
import {
  buildCurrentDraftSnapshot,
  isDraftUntouched,
  type TaskDraftBaseline,
} from '@/components/modals/task-modal/task-draft-types';

type TaskRowWithSubs = TaskRow & {
  task_subtasks?: Array<{
    id: string;
    title: string;
    completed: boolean;
    created_at: string;
    position: number;
  }>;
};

function normalizeTaskVisibility(value: unknown): TaskVisibility {
  return value === 'public' ? 'public' : 'private';
}

export function serverRowToDraftBaseline(row: TaskRowWithSubs): TaskDraftBaseline {
  let nextItemType = normalizeItemType(row.item_type) as ItemType;
  if (nextItemType === 'class') {
    nextItemType = 'task';
  }
  const nextMeta = parseTaskMetadata(row.metadata);
  const mf = metadataFieldsFromParsed(nextMeta);
  const metadataForSave = buildTaskMetadataPayload(nextItemType, mf, nextMeta);
  const schedOn = row.scheduled_on ? String(row.scheduled_on).slice(0, 10) : '';
  const schedT = scheduledTimeToInputValue(row.scheduled_time);
  const subs: TaskSubtask[] = row.task_subtasks?.length
    ? [...row.task_subtasks]
        .sort((a, b) => a.position - b.position)
        .map((s) => ({
          id: s.id,
          title: s.title,
          done: s.completed,
          created_at: s.created_at,
        }))
    : [];
  return buildCurrentDraftSnapshot({
    title: row.title,
    description: row.description ?? '',
    metadataForSave,
    priority: String(row.priority ?? 'medium'),
    visibility: normalizeTaskVisibility(row.visibility),
    status: row.status || '',
    position: typeof row.position === 'number' ? row.position : Number(row.position) || 0,
    scheduledOn: schedOn,
    scheduledTime: schedT,
    attachments: asAttachments(row.attachments),
    subtasks: subs,
  });
}

export type TryDeleteUntouchedOptimisticDraftResult = 'deleted' | 'kept' | 'skipped_no_row';

/**
 * Server-authoritative check: deletes the task if it still matches the insert baseline
 * and has `comment_count === 0`.
 */
export async function tryDeleteUntouchedOptimisticDraft(args: {
  taskId: string;
  baseline: TaskDraftBaseline;
  hardDeleteTask: (id: string) => Promise<void>;
}): Promise<TryDeleteUntouchedOptimisticDraftResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('tasks')
    .select('*, task_subtasks(id, title, completed, created_at, position)')
    .eq('id', args.taskId)
    .maybeSingle();

  if (error || !data) {
    return 'skipped_no_row';
  }
  const row = data as TaskRowWithSubs;
  if ((row.comment_count ?? 0) > 0) {
    return 'kept';
  }
  const serverSnap = serverRowToDraftBaseline(row);
  if (!isDraftUntouched(args.baseline, serverSnap)) {
    return 'kept';
  }
  await args.hardDeleteTask(args.taskId);
  return 'deleted';
}
