import { describe, expect, it } from 'vitest';
import {
  formatExercisePrescriptionLineFromFactory,
  formatExercisePrescriptionLineFromTask,
} from './format-exercise-prescription-line';

describe('formatExercisePrescriptionLineFromFactory', () => {
  it('joins sets, reps, rpe, rest, work, rounds', () => {
    const line = formatExercisePrescriptionLineFromFactory({
      order: 1,
      exerciseName: 'Squat',
      sets: 3,
      reps: '5',
      rpe: 8,
      restSeconds: 90,
      workSeconds: 20,
      rounds: 4,
    });
    expect(line).toContain('3×');
    expect(line).toContain('5 reps');
    expect(line).toContain('RPE 8');
    expect(line).toContain('Rest');
    expect(line).toContain('20s work');
    expect(line).toContain('4 rounds');
  });

  it('returns null when no prescription fields', () => {
    expect(
      formatExercisePrescriptionLineFromFactory({
        order: 1,
        exerciseName: 'Squat',
        sets: 0,
        reps: '',
      }),
    ).toBeNull();
  });
});

describe('formatExercisePrescriptionLineFromTask', () => {
  it('formats flat exercise meta', () => {
    const line = formatExercisePrescriptionLineFromTask({
      name: 'Bench',
      sets: 3,
      reps: 8,
      rest_seconds: 60,
    });
    expect(line).toBe('3× · 8 reps · Rest 1 min');
  });
});
