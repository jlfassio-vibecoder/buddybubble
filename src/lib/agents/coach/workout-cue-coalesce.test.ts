import { describe, expect, it } from 'vitest';
import {
  applyWorkoutCuePatchToTaskMetadata,
  buildTaskMetadataDeltaForWorkoutCuePatch,
  flatExerciseResolutionKey,
} from '@/lib/agents/coach/workout-cue-metadata-merge';
import { coalesceWorkoutCuesPatchFromPersonalFallback } from '@/lib/agents/coach/workout-cues-patch';

describe('coalesceWorkoutCuesPatchFromPersonalFallback', () => {
  it('reroutes unanchored personal_cues_patch to workout_cues_patch', () => {
    const patch = coalesceWorkoutCuesPatchFromPersonalFallback({
      workoutCuesPatch: null,
      unanchoredDrops: [
        {
          exerciseIndex: 0,
          form_cues: 'Pulse with control.',
          tips: 'Keep shoulders relaxed.',
        },
      ],
      workoutContextJson: JSON.stringify({
        exercises: [{ name: 'Pilates Hundred (Pulse)' }],
      }),
      exerciseCueRequestResolutionKey: 'pilates hundred (pulse)::0',
      exerciseCueRequestExerciseIndex: 0,
    });
    expect(patch).toEqual({
      v: 1,
      resolution_key: 'pilates hundred (pulse)::0',
      form_cues: 'Pulse with control.',
      tips: 'Keep shoulders relaxed.',
    });
  });
});

describe('applyWorkoutCuePatchToTaskMetadata', () => {
  it('writes cues to flat exercises for custom/unanchored exercise', () => {
    const key = flatExerciseResolutionKey({ name: 'Pilates Hundred (Pulse)' }, 0);
    const base = {
      exercises: [{ name: 'Pilates Hundred (Pulse)', sets: 3, reps: '10' }],
    };
    const merged = applyWorkoutCuePatchToTaskMetadata(base, {
      v: 1,
      resolution_key: key,
      form_cues: 'Pulse with control.',
    });
    const flat = merged.exercises as Array<Record<string, unknown>>;
    expect(flat[0]?.form_cues).toBe('Pulse with control.');

    const delta = buildTaskMetadataDeltaForWorkoutCuePatch(base, {
      v: 1,
      resolution_key: key,
      form_cues: 'Pulse with control.',
    });
    expect(delta?.exercises).toEqual(flat);
  });
});
