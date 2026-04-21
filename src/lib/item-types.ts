/**
 * Kanban / calendar `tasks.item_type` helpers.
 * Kept out of `src/types/database*.ts` so Supabase CLI regen cannot wipe them.
 */

export type ItemType =
  | 'task'
  | 'event'
  | 'experience'
  | 'idea'
  | 'memory'
  | 'workout'
  | 'workout_log'
  | 'program';

const ITEM_TYPE_SET = new Set<string>([
  'task',
  'event',
  'experience',
  'idea',
  'memory',
  'workout',
  'workout_log',
  'program',
]);

/** Safe default when `item_type` is missing (stale client) or invalid. */
export function normalizeItemType(value: unknown): ItemType {
  if (typeof value === 'string' && ITEM_TYPE_SET.has(value)) {
    return value as ItemType;
  }
  return 'task';
}
