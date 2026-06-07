/** Supabase PostgREST may return a to-one embed as object or single-element array. */
export function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export type ClassOfferingEmbed = {
  name: string;
  description: string | null;
  duration_min: number;
  location: string | null;
};

export type ClassTasksEmbed = {
  bubble_id: string;
};

export type NormalizedClassInstanceRow = {
  id: string;
  task_id: string;
  scheduled_at: string;
  status: string;
  offering: ClassOfferingEmbed | null;
  tasks: ClassTasksEmbed | null;
};

export function normalizeClassInstanceRow(raw: unknown): NormalizedClassInstanceRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.task_id !== 'string') return null;
  if (typeof row.scheduled_at !== 'string' || typeof row.status !== 'string') return null;

  return {
    id: row.id,
    task_id: row.task_id,
    scheduled_at: row.scheduled_at,
    status: row.status,
    offering: unwrapOne(row.offering as ClassOfferingEmbed | ClassOfferingEmbed[] | null),
    tasks: unwrapOne(row.tasks as ClassTasksEmbed | ClassTasksEmbed[] | null),
  };
}

export type MessageAuthorEmbed = {
  full_name: string | null;
  avatar_url: string | null;
};

export type NormalizedCommentRow = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  parent_id: string | null;
  users: MessageAuthorEmbed | null;
};

export function normalizeCommentRow(raw: unknown): NormalizedCommentRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (
    typeof row.id !== 'string' ||
    typeof row.content !== 'string' ||
    typeof row.created_at !== 'string' ||
    typeof row.user_id !== 'string'
  ) {
    return null;
  }

  return {
    id: row.id,
    content: row.content,
    created_at: row.created_at,
    user_id: row.user_id,
    parent_id: typeof row.parent_id === 'string' ? row.parent_id : null,
    users: unwrapOne(row.users as MessageAuthorEmbed | MessageAuthorEmbed[] | null),
  };
}
