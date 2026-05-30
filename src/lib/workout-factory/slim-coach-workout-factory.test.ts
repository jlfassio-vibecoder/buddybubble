import { describe, expect, it } from 'vitest';
import { slimAiWorkoutFactoryForCoachContext } from './slim-coach-workout-factory';

describe('slimAiWorkoutFactoryForCoachContext', () => {
  it('returns only workout_set and drops chain_metadata', () => {
    const workoutSet = {
      workouts: [{ name: 'Main', exerciseBlocks: [{ name: 'Main', exercises: [] }] }],
    };
    const slim = slimAiWorkoutFactoryForCoachContext({
      workout_set: workoutSet,
      chain_metadata: {
        pipeline: 'parametric_outline_fill',
        fill_parametric_outline: { huge: true },
      },
      model: 'vertex-ai',
      generated_at: '2026-01-01T00:00:00.000Z',
    });
    expect(slim).toEqual({ workout_set: workoutSet });
    expect(slim).not.toHaveProperty('chain_metadata');
  });

  it('returns null when workout_set has no workouts', () => {
    expect(slimAiWorkoutFactoryForCoachContext({ workout_set: { workouts: [] } })).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(slimAiWorkoutFactoryForCoachContext(null)).toBeNull();
    expect(slimAiWorkoutFactoryForCoachContext('x')).toBeNull();
  });
});
