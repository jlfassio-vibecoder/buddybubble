import { describe, expect, it } from 'vitest';
import { WORKOUT_CUE_FIELD_MAX_CHARS } from '@/lib/agents/coach/config';
import { parseWorkoutCuesPatchFromGemini } from '@/lib/agents/coach/workout-cues-patch';

describe('workout-cues-patch', () => {
  it('caps field length at WORKOUT_CUE_FIELD_MAX_CHARS', () => {
    const long = 'a'.repeat(WORKOUT_CUE_FIELD_MAX_CHARS + 50);
    const patch = parseWorkoutCuesPatchFromGemini({
      v: 1,
      resolution_key: 'squat::0',
      form_cues: long,
    });
    expect(patch?.form_cues?.length).toBe(WORKOUT_CUE_FIELD_MAX_CHARS);
  });
});
