import type { WorkoutCuesPatchV1 } from '@/lib/agents/coach/workout-cues-patch';
import { parseWorkoutCuesPatchFromGemini } from '@/lib/agents/coach/workout-cues-patch';

export type { WorkoutCuesPatchV1 };

export function parseWorkoutCuesPatchFromMetadata(raw: unknown): WorkoutCuesPatchV1 | null {
  return parseWorkoutCuesPatchFromGemini(raw);
}

export { stripWorkoutCuesPatchToCuePatch } from './parse-workout-cues-patch-fields';
