import { describe, expect, it } from 'vitest';

import { buildTaskModalOutgoingWorkoutContext } from './task-modal-outgoing-workout-context';

describe('buildTaskModalOutgoingWorkoutContext', () => {
  it('returns null when metadata has no rich workout set', () => {
    expect(buildTaskModalOutgoingWorkoutContext({}, 'Leg day')).toBeNull();
    expect(buildTaskModalOutgoingWorkoutContext({ workout_type: 'AMRAP' }, 'Leg day')).toBeNull();
  });

  it('returns ai_workout_factory snapshot for unsaved generated workouts', () => {
    const workoutSet = {
      workouts: [{ name: 'Main', exerciseBlocks: [{ name: 'Main', exercises: [] }] }],
    };
    const ctx = buildTaskModalOutgoingWorkoutContext(
      {
        workout_type: 'Complex',
        duration_min: 45,
        ai_workout_factory: { workout_set: workoutSet, model: 'gemini' },
      },
      '80lb KB Lower Body Complex',
    );
    expect(ctx).toEqual({
      ai_workout_factory: { workout_set: workoutSet, model: 'gemini' },
      workout_type: 'Complex',
      duration_min: 45,
      workout_task_title: '80lb KB Lower Body Complex',
    });
  });
});
