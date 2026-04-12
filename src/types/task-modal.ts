import type { TaskStatus } from '@/types/database';

export type TaskSubtask = {
  id: string;
  title: string;
  done: boolean;
  created_at: string;
};

export type TaskComment = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
};

export type TaskActivityEntry = {
  id: string;
  type: 'field_change' | 'comment' | 'subtask' | 'attachment' | string;
  message: string;
  at: string;
  user_id?: string | null;
  field?: string;
  from?: string | null;
  to?: string | null;
};

export type TaskAttachment = {
  id: string;
  name: string;
  /** Storage path within bucket `task-attachments` */
  path: string;
  size: number;
  uploaded_at: string;
  uploaded_by?: string | null;
};

export function asSubtasks(v: unknown): TaskSubtask[] {
  return Array.isArray(v) ? (v as TaskSubtask[]) : [];
}

export function asComments(v: unknown): TaskComment[] {
  return Array.isArray(v) ? (v as TaskComment[]) : [];
}

export function asActivityLog(v: unknown): TaskActivityEntry[] {
  return Array.isArray(v) ? (v as TaskActivityEntry[]) : [];
}

export function asAttachments(v: unknown): TaskAttachment[] {
  return Array.isArray(v) ? (v as TaskAttachment[]) : [];
}

export function appendActivityForFieldChange(
  prev: TaskActivityEntry[],
  opts: {
    userId: string | null;
    field:
      | 'title'
      | 'description'
      | 'status'
      | 'priority'
      | 'scheduled_on'
      | 'scheduled_time'
      | 'visibility'
      | 'assigned_to';
    from: string;
    to: string;
  },
): TaskActivityEntry[] {
  const entry: TaskActivityEntry = {
    id: crypto.randomUUID(),
    type: 'field_change',
    message:
      opts.field === 'title'
        ? `Changed title`
        : opts.field === 'description'
          ? `Updated description`
          : opts.field === 'status'
            ? `Changed status`
            : opts.field === 'priority'
              ? `Changed priority`
              : opts.field === 'visibility'
                ? `Changed visibility`
                : opts.field === 'assigned_to'
                  ? `Changed assignee`
                  : opts.field === 'scheduled_time'
                    ? `Changed scheduled time`
                    : `Changed scheduled date`,
    at: new Date().toISOString(),
    user_id: opts.userId,
    field: opts.field,
    from: opts.from,
    to: opts.to,
  };
  return [...prev, entry];
}

export const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];
