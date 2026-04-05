import type { TaskRow } from '@/types/database';

export type TaskPriority = 'low' | 'medium' | 'high';

export type PriorityFilter = 'all' | TaskPriority;

export const TASK_PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

export const PRIORITY_FILTER_STORAGE_KEY = 'buddybubble.kanbanPriorityFilter';

export function normalizeTaskPriority(v: unknown): TaskPriority {
  if (v === 'low' || v === 'medium' || v === 'high') return v;
  return 'medium';
}

export function parsePriorityFilter(raw: string | null): PriorityFilter {
  if (raw === 'all' || raw === 'low' || raw === 'medium' || raw === 'high') return raw;
  return 'all';
}

export function taskMatchesPriorityFilter(task: TaskRow, filter: PriorityFilter): boolean {
  if (filter === 'all') return true;
  return normalizeTaskPriority(task.priority) === filter;
}

/** Lower rank = higher priority (high → 0, medium → 1, low → 2). */
export function priorityRank(p: unknown): number {
  const x = normalizeTaskPriority(p);
  if (x === 'high') return 0;
  if (x === 'medium') return 1;
  return 2;
}

export function compareTasksByPriorityThenTitle(a: TaskRow, b: TaskRow): number {
  const pr = priorityRank(a.priority) - priorityRank(b.priority);
  if (pr !== 0) return pr;
  return (a.title ?? '').localeCompare(b.title ?? '', undefined, { sensitivity: 'base' });
}

export function compareTasksByTitle(a: TaskRow, b: TaskRow): number {
  return (a.title ?? '').localeCompare(b.title ?? '', undefined, { sensitivity: 'base' });
}
