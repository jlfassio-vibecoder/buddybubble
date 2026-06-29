import type { WorkoutCuePatch } from '@/lib/workout-factory/apply-cue-patches-to-metadata';
import type { CueFieldKey } from '@/lib/agents/coach/exercise-cue-request';
import type { WorkoutCuesPatchV1 } from '@/lib/agents/coach/workout-cues-patch';

const PATCH_FIELD_KEYS: readonly CueFieldKey[] = [
  'instructions',
  'form_cues',
  'tips',
  'injury_prevention_tips',
];

export function stripWorkoutCuesPatchToCuePatch(patch: WorkoutCuesPatchV1): WorkoutCuePatch {
  const out: WorkoutCuePatch = {};
  for (const key of PATCH_FIELD_KEYS) {
    const val = patch[key];
    if (typeof val === 'string' && val.trim()) out[key] = val;
  }
  return out;
}
