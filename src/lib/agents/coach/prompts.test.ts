import { describe, expect, it } from 'vitest';
import {
  EXERCISE_INDEX_MAP_HEADER,
  buildTaskModalIntakeUiCoachBlock,
  formatExerciseIndexMap,
  taskMetadataLooksWorkoutShaped,
} from './prompts';

describe('formatExerciseIndexMap', () => {
  it('returns null for invalid or non-object JSON', () => {
    expect(formatExerciseIndexMap('')).toBeNull();
    expect(formatExerciseIndexMap('not json')).toBeNull();
    expect(formatExerciseIndexMap('[]')).toBeNull();
    expect(formatExerciseIndexMap('{"exercises":[]}')).toBeNull();
  });

  it('emits one line per exercise index with names or (unnamed)', () => {
    const json = JSON.stringify({
      exercises: [{ name: 'Leg Swings' }, { name: 'Kettlebell Goblet Squat' }, {}],
    });
    const out = formatExerciseIndexMap(json);
    expect(out).toContain(EXERCISE_INDEX_MAP_HEADER);
    expect(out).toContain('0: Leg Swings');
    expect(out).toContain('1: Kettlebell Goblet Squat');
    expect(out).toContain('2: (unnamed)');
  });

  it('accepts a root-level exercises array (sentinel / rail payload shape)', () => {
    const json = JSON.stringify([{ name: 'Dumbbell Bench Press' }, { name: 'Row' }]);
    const out = formatExerciseIndexMap(json);
    expect(out).toContain('0: Dumbbell Bench Press');
    expect(out).toContain('1: Row');
  });
});

describe('taskMetadataLooksWorkoutShaped', () => {
  it('is false for null, arrays, and empty objects', () => {
    expect(taskMetadataLooksWorkoutShaped(null)).toBe(false);
    expect(taskMetadataLooksWorkoutShaped([])).toBe(false);
    expect(taskMetadataLooksWorkoutShaped({})).toBe(false);
  });

  it('is true when workout_type, exercises, workoutContext, or duration_min is set', () => {
    expect(taskMetadataLooksWorkoutShaped({ workout_type: 'AMRAP' })).toBe(true);
    expect(taskMetadataLooksWorkoutShaped({ workoutType: ' HIIT ' })).toBe(true);
    expect(taskMetadataLooksWorkoutShaped({ exercises: [{ name: 'Squat' }] })).toBe(true);
    expect(taskMetadataLooksWorkoutShaped({ workoutContext: { exercises: [] } })).toBe(true);
    expect(taskMetadataLooksWorkoutShaped({ duration_min: 30 })).toBe(true);
    expect(taskMetadataLooksWorkoutShaped({ durationMin: '25' })).toBe(true);
  });
});

describe('buildTaskModalIntakeUiCoachBlock', () => {
  it('includes worked GOOD/BAD examples for scale and soreness', () => {
    const block = buildTaskModalIntakeUiCoachBlock();
    expect(block).toContain('GOOD: {"readiness":7,"sleep_quality":8}');
    expect(block).toContain('BAD: {"readiness":72}');
    expect(block).toContain('BAD: {"soreness":["None","Legs"]}');
  });
});
