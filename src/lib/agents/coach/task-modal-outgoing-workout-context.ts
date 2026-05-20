import type { Json } from '@/types/database';
import { parseTaskMetadata } from '@/lib/item-metadata';
import { hasRichWorkoutSetInMetadata } from '@/lib/workout-factory/sync-workout-metadata';

/**
 * Coach rail trigger metadata for Task Modal: generated workouts may exist only in
 * local form state until the user saves. Attach on outgoing @coach messages so
 * Edge dispatch can enter live co-pilot mode and merge append-only block edits.
 */
export function buildTaskModalOutgoingWorkoutContext(
  metadata: Json,
  title: string,
): Record<string, unknown> | null {
  if (!hasRichWorkoutSetInMetadata(metadata)) return null;
  const parsed = parseTaskMetadata(metadata) as Record<string, unknown>;
  const af = parsed.ai_workout_factory;
  if (af == null || typeof af !== 'object' || Array.isArray(af)) return null;

  const out: Record<string, unknown> = {
    ai_workout_factory: af,
    workout_task_title: title.trim() || 'this workout',
  };
  if (typeof parsed.workout_type === 'string' && parsed.workout_type.trim()) {
    out.workout_type = parsed.workout_type.trim();
  }
  if (
    typeof parsed.duration_min === 'number' &&
    Number.isFinite(parsed.duration_min) &&
    parsed.duration_min > 0
  ) {
    out.duration_min = Math.round(parsed.duration_min);
  }
  return out;
}
