import { normalizeItemType, type TaskRow } from '@/types/database';
import { parseTaskMetadata } from '@/lib/item-metadata';

/** End YYYY-MM-DD for an experience; falls back to `scheduled_on` when `metadata.end_date` is unset. */
export function experienceEndYmd(task: TaskRow): string {
  if (normalizeItemType(task.item_type) !== 'experience') return '';
  const o = parseTaskMetadata(task.metadata) as Record<string, unknown>;
  const raw = o.end_date;
  if (typeof raw === 'string' && raw.length >= 10) return raw.slice(0, 10);
  const start = task.scheduled_on ? String(task.scheduled_on).slice(0, 10) : '';
  return start;
}

/**
 * Whether an experience's [start, end] span intersects [rangeStart, rangeEnd] (inclusive YYYY-MM-DD).
 */
export function experienceOverlapsYmdRange(
  task: TaskRow,
  rangeStart: string,
  rangeEnd: string,
): boolean {
  if (normalizeItemType(task.item_type) !== 'experience') return false;
  const start = task.scheduled_on ? String(task.scheduled_on).slice(0, 10) : '';
  if (!start) return false;
  const end = experienceEndYmd(task);
  return start <= rangeEnd && end >= rangeStart;
}
