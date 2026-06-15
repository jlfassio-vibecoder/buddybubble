import { describe, expect, it } from 'vitest';
import { WorkoutFactoryError, workoutFactoryErrorMessage } from '@/lib/workout-factory/api-client';

describe('workoutFactoryErrorMessage', () => {
  it('returns structure message for structure 422', () => {
    const err = new WorkoutFactoryError('fail', {
      status: 422,
      validationReason: 'structure',
    });
    expect(workoutFactoryErrorMessage(err).message).toContain('structure mismatch');
  });

  it('returns parse message for parse 422', () => {
    const err = new WorkoutFactoryError('fail', {
      status: 422,
      failureKind: 'parse',
      validationReason: 'parse',
    });
    expect(workoutFactoryErrorMessage(err)).toEqual({
      message:
        "We had trouble reading the AI's response format. Please try generating the workout again.",
      showRegenerate: true,
    });
  });

  it('returns prescription message for other validation 422', () => {
    const err = new WorkoutFactoryError('fail', {
      status: 422,
      failureKind: 'validation',
      validationReason: 'prescription',
    });
    expect(workoutFactoryErrorMessage(err).message).toContain('exercise prescriptions');
  });
});
