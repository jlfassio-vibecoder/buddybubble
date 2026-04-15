import { describe, expect, it } from 'vitest';
import {
  hydrateWorkoutExerciseFromStorefrontCoachNotes,
  parseStorefrontExerciseDetail,
  storefrontPreviewExerciseToWorkoutExercise,
} from '@/lib/workout-factory/storefront-preview-exercise-detail';

describe('parseStorefrontExerciseDetail', () => {
  it('parses N×reps at line start', () => {
    const p = parseStorefrontExerciseDetail('3 x 8-12, controlled tempo');
    expect(p.sets).toBe(3);
    expect(p.reps).toBe('8-12');
    expect(p.remainder).toMatch(/controlled tempo/i);
  });

  it('parses sets-of pattern', () => {
    const p = parseStorefrontExerciseDetail('4 sets of 10');
    expect(p.sets).toBe(4);
    expect(p.reps).toBe(10);
  });

  it('parses RPE', () => {
    const p = parseStorefrontExerciseDetail('3×8 @ RPE 7');
    expect(p.sets).toBe(3);
    expect(p.reps).toBe(8);
    expect(p.rpe).toBe(7);
  });

  it('parses rest range to average seconds', () => {
    const p = parseStorefrontExerciseDetail('3x10, 60-90s rest');
    expect(p.sets).toBe(3);
    expect(p.reps).toBe(10);
    expect(p.rest_seconds).toBe(75);
  });
});

describe('storefrontPreviewExerciseToWorkoutExercise', () => {
  it('maps preview row to metadata exercise', () => {
    const ex = storefrontPreviewExerciseToWorkoutExercise('Squat', '3 x 8 @ RPE 7');
    expect(ex.name).toBe('Squat');
    expect(ex.sets).toBe(3);
    expect(ex.reps).toBe(8);
    expect(ex.rpe).toBe(7);
    expect(ex.coach_notes).toBeUndefined();
  });
});

describe('hydrateWorkoutExerciseFromStorefrontCoachNotes', () => {
  it('fills sets/reps from legacy coach_notes', () => {
    const ex = hydrateWorkoutExerciseFromStorefrontCoachNotes({
      name: 'Bench',
      coach_notes: '4×6–8',
    });
    expect(ex.sets).toBe(4);
    expect(ex.reps).toBe('6-8');
    expect(ex.coach_notes).toBeUndefined();
  });

  it('does not touch exercises that already have reps', () => {
    const ex = hydrateWorkoutExerciseFromStorefrontCoachNotes({
      name: 'Row',
      reps: '10',
      coach_notes: '4×6',
    });
    expect(ex.reps).toBe('10');
    expect(ex.sets).toBeUndefined();
  });
});
