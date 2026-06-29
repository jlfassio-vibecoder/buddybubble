import { describe, it, expect } from 'vitest';
import { parseWorkoutCuesPatchFromMetadata } from '@/components/chat/agent-effects/parse-workout-cues-patch';
import { stripWorkoutCuesPatchToCuePatch } from '@/components/chat/agent-effects/parse-workout-cues-patch-fields';

describe('parse-workout-cues-patch', () => {
  it('parses valid workout_cues_patch metadata', () => {
    const patch = {
      v: 1,
      resolution_key: 'squat::0',
      instructions: 'Brace core.',
      form_cues: 'Knees track toes.',
    };
    expect(parseWorkoutCuesPatchFromMetadata(patch)).toEqual(patch);
  });

  it('rejects patch with no cue fields', () => {
    expect(parseWorkoutCuesPatchFromMetadata({ v: 1, resolution_key: 'squat::0' })).toBeNull();
  });

  it('stripWorkoutCuesPatchToCuePatch drops v wrapper', () => {
    expect(
      stripWorkoutCuesPatchToCuePatch({
        v: 1,
        resolution_key: 'squat::0',
        tips: 'Slow eccentric.',
      }),
    ).toEqual({ tips: 'Slow eccentric.' });
  });
});
