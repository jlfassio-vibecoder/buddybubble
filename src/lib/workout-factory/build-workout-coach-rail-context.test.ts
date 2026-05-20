import { describe, expect, it } from 'vitest';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import {
  buildWorkoutCoachRailContext,
  exerciseNamesFromCoachWorkoutData,
  normalizeCoachWorkoutDataProp,
} from './build-workout-coach-rail-context';

describe('buildWorkoutCoachRailContext', () => {
  it('includes structure summary and factory for rich tabata metadata', () => {
    const metadata = richMetadataWithBlockFormat('tabata');
    const ctx = buildWorkoutCoachRailContext(metadata, 'Tabata day');
    const vm = buildWorkoutSessionViewModel(metadata);
    const main = vm.blocks.find((b) => b.section === 'main')!;

    expect(Array.isArray(ctx.exercises)).toBe(true);
    expect((ctx.exercises as unknown[]).length).toBeGreaterThan(0);
    expect(ctx.workout_task_title).toBe('Tabata day');
    expect(ctx.ai_workout_factory).toBeTruthy();
    expect(typeof ctx.workout_structure_summary).toBe('string');
    if (main.subtitle) {
      expect(ctx.workout_structure_summary).toContain(main.subtitle);
    }
  });

  it('returns flat exercises for legacy metadata', () => {
    const metadata = {
      exercises: [{ name: 'Squat', sets: 3, reps: 10 }],
      workout_type: 'Strength',
    };
    const ctx = buildWorkoutCoachRailContext(metadata, 'Leg day');
    expect(ctx.workout_type).toBe('Strength');
    expect(ctx.exercises).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Squat' })]),
    );
    expect(ctx.workout_structure_summary).toBeUndefined();
  });

  it('derives exercises from factory when flat cache is empty', () => {
    const metadata = richMetadataWithBlockFormat('tabata');
    const stripped = { ...metadata, exercises: [] };
    const ctx = buildWorkoutCoachRailContext(stripped, 'Factory only');
    expect((ctx.exercises as unknown[]).length).toBeGreaterThan(0);
    expect(ctx.ai_workout_factory).toBeTruthy();
  });
});

describe('exerciseNamesFromCoachWorkoutData', () => {
  it('reads names from structured context', () => {
    const ctx = buildWorkoutCoachRailContext(
      { exercises: [{ name: 'Row', sets: 4, reps: 8 }] },
      'Test',
    );
    expect(exerciseNamesFromCoachWorkoutData(ctx)).toEqual(['Row']);
  });

  it('reads names from bare exercise array', () => {
    expect(exerciseNamesFromCoachWorkoutData([{ name: 'Push-ups' }, { name: 'Pull-ups' }])).toEqual(
      ['Push-ups', 'Pull-ups'],
    );
  });
});

describe('normalizeCoachWorkoutDataProp', () => {
  it('rebuilds from metadata when workoutData is a bare array', () => {
    const metadata = richMetadataWithBlockFormat('tabata');
    const normalized = normalizeCoachWorkoutDataProp(
      [{ name: 'Stale' }] as never,
      metadata,
      'Tabata',
    );
    expect(normalized.workout_structure_summary).toBeTruthy();
    expect((normalized.exercises as unknown[]).length).toBeGreaterThan(0);
  });
});
