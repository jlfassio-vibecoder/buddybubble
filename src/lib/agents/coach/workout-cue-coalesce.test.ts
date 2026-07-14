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

  it('dual-writes factory camelCase cues on rich metadata (Ask Coach delta includes factory)', () => {
    const key = flatExerciseResolutionKey({ name: 'Goblet Squat' }, 0);
    const base = {
      exercises: [{ name: 'Goblet Squat', sets: 3, reps: '10' }],
      ai_workout_factory: {
        generated_at: '2026-01-01T00:00:00Z',
        model: 'test',
        workout_set: {
          title: 'Set',
          description: 'Desc',
          difficulty: 'intermediate',
          workouts: [
            {
              title: 'Session',
              description: 'Session',
              exerciseBlocks: [
                {
                  order: 1,
                  name: 'Main',
                  blockFormat: 'straight_sets',
                  exercises: [{ order: 1, exerciseName: 'Goblet Squat', sets: 3, reps: '10' }],
                },
              ],
            },
          ],
        },
      },
    };

    const merged = applyWorkoutCuePatchToTaskMetadata(base, {
      v: 1,
      resolution_key: key,
      instructions: 'Brace',
      form_cues: 'Knees out',
      tips: 'Slow ecc',
      injury_prevention_tips: 'Heels down',
    });

    const factoryEx = (
      merged.ai_workout_factory as {
        workout_set: { workouts: { exerciseBlocks: { exercises: Record<string, unknown>[] }[] }[] };
      }
    ).workout_set.workouts[0]!.exerciseBlocks[0]!.exercises[0]!;
    expect(factoryEx.instructions).toBe('Brace');
    expect(factoryEx.formCues).toBe('Knees out');
    expect(factoryEx.tips).toBe('Slow ecc');
    expect(factoryEx.injuryPreventionTips).toBe('Heels down');

    const flat = merged.exercises as Array<Record<string, unknown>>;
    expect(flat[0]?.instructions).toBe('Brace');
    expect(flat[0]?.form_cues).toBe('Knees out');

    const delta = buildTaskMetadataDeltaForWorkoutCuePatch(base, {
      v: 1,
      resolution_key: key,
      instructions: 'Brace',
      form_cues: 'Knees out',
    });
    expect(delta).not.toBeNull();
    expect(delta?.ai_workout_factory).toBeDefined();
  });
});
