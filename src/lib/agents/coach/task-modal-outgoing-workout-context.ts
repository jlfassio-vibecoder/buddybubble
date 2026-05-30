import type { Json } from '@/types/database';
import { parseTaskMetadata } from '@/lib/item-metadata';
import { buildWorkoutCoachRailContext } from '@/lib/workout-factory/build-workout-coach-rail-context';
import { slimAiWorkoutFactoryForCoachContext } from '@/lib/workout-factory/slim-coach-workout-factory';
import { hasRichWorkoutSetInMetadata } from '@/lib/workout-factory/sync-workout-metadata';

export type BuildTaskModalOutgoingWorkoutContextOptions = {
  /** When false (saved to DB), omit outgoing context — Edge uses persisted tasks.metadata. */
  coreDirty?: boolean;
};

/**
 * Coach rail trigger metadata for Task Modal: generated workouts may exist only in
 * local form state until the user saves. Attach on outgoing @coach messages so
 * Edge dispatch can enter live co-pilot mode and merge append-only block edits.
 */
export function buildTaskModalOutgoingWorkoutContext(
  metadata: Json,
  title: string,
  options?: BuildTaskModalOutgoingWorkoutContextOptions,
): Record<string, unknown> | null {
  if (!hasRichWorkoutSetInMetadata(metadata)) return null;

  const coreDirty = options?.coreDirty ?? false;
  if (!coreDirty) return null;

  const parsed = parseTaskMetadata(metadata) as Record<string, unknown>;
  const af = parsed.ai_workout_factory;
  const slimFactory = slimAiWorkoutFactoryForCoachContext(af);
  if (slimFactory == null) return null;

  const railCtx = buildWorkoutCoachRailContext(metadata, title, undefined, {
    includeFactoryBlob: false,
  });

  const out: Record<string, unknown> = {
    ai_workout_factory: slimFactory,
    workout_task_title: title.trim() || 'this workout',
  };

  if (typeof railCtx.exercises !== 'undefined') {
    out.exercises = railCtx.exercises;
  }
  if (typeof railCtx.workout_structure_summary === 'string') {
    out.workout_structure_summary = railCtx.workout_structure_summary;
  }
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
