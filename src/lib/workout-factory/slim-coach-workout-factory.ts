import { hasRichWorkoutSetInMetadata } from '@/lib/workout-factory/sync-workout-metadata';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Strip chain_metadata / model noise; keep workout_set for rich-workout gates. */
export function slimAiWorkoutFactoryForCoachContext(af: unknown): { workout_set: unknown } | null {
  if (!isPlainObject(af)) return null;
  const wrapped = { ai_workout_factory: af };
  if (!hasRichWorkoutSetInMetadata(wrapped)) return null;
  const ws = af.workout_set;
  if (ws == null) return null;
  return { workout_set: ws };
}
