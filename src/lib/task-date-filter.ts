import type { TaskRow } from '@/types/database';
import { compareScheduledTime } from '@/lib/task-scheduled-time';
import { getCalendarDateInTimeZone } from '@/lib/workspace-calendar';

export type DateFilter = 'all' | 'has_date' | 'overdue' | 'due_soon';

export const DATE_FILTER_STORAGE_KEY = 'buddybubble.kanbanDateFilter';

export function parseDateFilter(v: string | null): DateFilter {
  if (v === 'has_date' || v === 'overdue' || v === 'due_soon') return v;
  return 'all';
}

function scheduledSlice(task: TaskRow): string | null {
  const s = task.scheduled_on;
  if (!s) return null;
  return String(s).slice(0, 10);
}

/** Days from `from` to `to` as YYYY-MM-DD strings (inclusive-ish for same day = 0). */
function daysBetweenYmd(from: string, to: string): number {
  const a = new Date(from + 'T12:00:00Z').getTime();
  const b = new Date(to + 'T12:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}

export function taskMatchesDateFilter(
  task: TaskRow,
  filter: DateFilter,
  workspaceTimeZone: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (filter === 'all') return true;
  const s = scheduledSlice(task);
  if (filter === 'has_date') return s !== null;
  if (!s) return false;
  const tz = workspaceTimeZone?.trim() || 'UTC';
  const today = getCalendarDateInTimeZone(tz, now);
  if (filter === 'overdue') return s < today;
  if (filter === 'due_soon') {
    const d = daysBetweenYmd(today, s);
    return d >= 0 && d <= 7;
  }
  return true;
}

export type DateSortMode = 'none' | 'asc' | 'desc';

export const DATE_SORT_STORAGE_KEY = 'buddybubble.kanbanDateSort';

export function parseDateSortMode(v: string | null): DateSortMode {
  if (v === 'asc' || v === 'desc') return v;
  return 'none';
}

export function sortTasksByScheduledOn(tasks: TaskRow[], mode: DateSortMode): TaskRow[] {
  if (mode === 'none') return tasks;
  const mul = mode === 'asc' ? 1 : -1;
  return [...tasks].sort((a, b) => {
    const as = scheduledSlice(a);
    const bs = scheduledSlice(b);
    if (!as && !bs) return 0;
    if (!as) return 1;
    if (!bs) return -1;
    const byDate = as.localeCompare(bs) * mul;
    if (byDate !== 0) return byDate;
    /** Same calendar day: earlier local time first in asc; null time (all-day) sorts last. */
    return compareScheduledTime(a.scheduled_time, b.scheduled_time) * mul;
  });
}
