import { describe, expect, it } from 'vitest';
import {
  isWorkoutLogInProgress,
  WORKOUT_LOG_IN_PROGRESS_LABEL,
  WORKOUT_LOG_IN_PROGRESS_STATUS,
  workoutLogInProgressStatusSelectOption,
} from './workout-log-task-state';

describe('workout-log-task-state', () => {
  it('isWorkoutLogInProgress is true for workout_log + in_progress', () => {
    expect(
      isWorkoutLogInProgress({ item_type: 'workout_log', status: WORKOUT_LOG_IN_PROGRESS_STATUS }),
    ).toBe(true);
  });

  it('isWorkoutLogInProgress is false for completed workout_log', () => {
    expect(isWorkoutLogInProgress({ item_type: 'workout_log', status: 'completed' })).toBe(false);
  });

  it('isWorkoutLogInProgress is false for in_progress workout template', () => {
    expect(
      isWorkoutLogInProgress({ item_type: 'workout', status: WORKOUT_LOG_IN_PROGRESS_STATUS }),
    ).toBe(false);
  });

  it('workoutLogInProgressStatusSelectOption returns friendly label', () => {
    expect(workoutLogInProgressStatusSelectOption()).toEqual({
      value: WORKOUT_LOG_IN_PROGRESS_STATUS,
      label: WORKOUT_LOG_IN_PROGRESS_LABEL,
    });
  });
});
