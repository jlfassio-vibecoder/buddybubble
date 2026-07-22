import type { TaskRow } from '@/types/database';
import { sortTasksByScheduledOn, type DateSortMode } from '@/lib/task-date-filter';

export function taskIsPinned(task: TaskRow): boolean {
  return Boolean((task as TaskRow & { is_pinned?: boolean }).is_pinned);
}

export function sortPinnedByPinOrder(tasks: TaskRow[]): TaskRow[] {
  return [...tasks].sort((a, b) => {
    const ao = (a as TaskRow & { pin_order?: number | null }).pin_order;
    const bo = (b as TaskRow & { pin_order?: number | null }).pin_order;
    const aNull = ao == null || Number.isNaN(Number(ao));
    const bNull = bo == null || Number.isNaN(Number(bo));
    if (aNull && bNull) return a.id.localeCompare(b.id);
    if (aNull) return 1;
    if (bNull) return -1;
    const byOrder = Number(ao) - Number(bo);
    if (byOrder !== 0) return byOrder;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Split a filtered column list into pinned (manual pin_order) then unpinned
 * (dateSortMode / position).
 */
export function orderColumnTasksWithPins(
  tasks: TaskRow[],
  dateSortMode: DateSortMode,
): { pinned: TaskRow[]; unpinned: TaskRow[] } {
  const pinned = sortPinnedByPinOrder(tasks.filter(taskIsPinned));
  let unpinned = tasks.filter((t) => !taskIsPinned(t));
  if (dateSortMode !== 'none') {
    unpinned = sortTasksByScheduledOn(unpinned, dateSortMode);
  } else {
    unpinned = [...unpinned].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }
  return { pinned, unpinned };
}

export function concatPinnedUnpinned(pinned: TaskRow[], unpinned: TaskRow[]): TaskRow[] {
  return [...pinned, ...unpinned];
}

/** Next pin_order for appending to the end of a pinned tier. */
export function nextPinOrder(pinnedInColumn: TaskRow[]): number {
  let max = 0;
  for (const t of pinnedInColumn) {
    const o = (t as TaskRow & { pin_order?: number | null }).pin_order;
    if (typeof o === 'number' && Number.isFinite(o) && o > max) max = o;
  }
  return max + 1;
}

/** Reindex pin_order to 1..n after a pinned-tier reorder. */
export function reindexPinOrders(pinnedOrdered: TaskRow[]): TaskRow[] {
  return pinnedOrdered.map((t, i) => ({
    ...t,
    is_pinned: true,
    pin_order: i + 1,
  }));
}

/** Midpoint between neighbors for fractional insert; falls back to reindex seed. */
export function pinOrderBetween(prev: number | null, next: number | null): number {
  if (prev != null && next != null && next > prev) return (prev + next) / 2;
  if (prev != null) return prev + 1;
  if (next != null) return next / 2;
  return 1;
}
