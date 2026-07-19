import type { Json } from '@/types/database';
import { parseTaskMetadata } from '@/lib/item-metadata';
import { buildWorkoutCoachRailContext } from '@/lib/workout-factory/build-workout-coach-rail-context';
import { slimAiWorkoutFactoryForCoachContext } from '@/lib/workout-factory/slim-coach-workout-factory';
import { hasRichWorkoutSetInMetadata } from '@/lib/workout-factory/sync-workout-metadata';
import { stampStructuralIdsOnWorkoutSet } from '@/lib/agents/coach/structural-address-map';

export type BuildTaskModalOutgoingWorkoutContextOptions = {
  /** @deprecated Ignored; slim context is always attached when a rich workout set exists. */
  coreDirty?: boolean;
};

/**
 * Coach rail trigger metadata for Task Modal when the card carries a rich generated workout.
 * Attaches a **slimmed** context on outgoing @coach messages (structure summary, flat
 * exercises, workout_set-only factory stub, title/type/duration) — not the full
 * ai_workout_factory blob with chain_metadata. Enables live co-pilot without OOM-scale payloads.
 * Stamps block_id / exercise_id and includes `structural_address_map` for surgical patches.
 */
export function buildTaskModalOutgoingWorkoutContext(
  metadata: Json,
  title: string,
  _options?: BuildTaskModalOutgoingWorkoutContextOptions,
): Record<string, unknown> | null {
  if (!hasRichWorkoutSetInMetadata(metadata)) return null;

  const parsed = parseTaskMetadata(metadata) as Record<string, unknown>;
  const af = parsed.ai_workout_factory;
  const slimFactory = slimAiWorkoutFactoryForCoachContext(af);
  if (slimFactory == null) return null;

  const stamped = stampStructuralIdsOnWorkoutSet(slimFactory.workout_set);
  const factoryForContext = stamped != null ? { workout_set: stamped.workoutSet } : slimFactory;

  const railCtx = buildWorkoutCoachRailContext(metadata, title, undefined, {
    includeFactoryBlob: false,
  });

  const out: Record<string, unknown> = {
    ai_workout_factory: factoryForContext,
    workout_task_title: title.trim() || 'this workout',
  };

  if (stamped != null) {
    out.structural_address_map = stamped.structuralAddressMap;
  }

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
