import { describe, expect, it } from 'vitest';
import {
  richAlternatingEmomMetadata,
  richMetadataWithBlockFormat,
} from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import {
  buildWorkoutCoachRailContext,
  exerciseNamesFromCoachWorkoutData,
  normalizeCoachWorkoutDataProp,
  validateLiveSetCounts,
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

  it('includes live_set_counts when aligned with flat exercises', () => {
    const metadata = richMetadataWithBlockFormat('tabata');
    const vm = buildWorkoutSessionViewModel(metadata);
    const ctx = buildWorkoutCoachRailContext(metadata, 'Tabata', [8]);
    expect(ctx.live_set_counts).toEqual([8]);
    expect((ctx.exercises as unknown[]).length).toBe(vm.flatExercises.length);
  });

  it('omits live_set_counts when length mismatches exercises', () => {
    const metadata = richMetadataWithBlockFormat('tabata');
    const ctx = buildWorkoutCoachRailContext(metadata, 'Tabata', [8, 8]);
    expect(ctx.live_set_counts).toBeUndefined();
  });

  it('omits live_set_counts for invalid entries', () => {
    const metadata = richMetadataWithBlockFormat('tabata');
    const ctx = buildWorkoutCoachRailContext(metadata, 'Tabata', [0]);
    expect(ctx.live_set_counts).toBeUndefined();
  });

  it('includes emom_alternating_guide for alternating EMOM metadata', () => {
    const metadata = richAlternatingEmomMetadata({
      totalRounds: 10,
      cycle: [[0], [1], [2]],
    });
    const ctx = buildWorkoutCoachRailContext(metadata, 'EMOM day');
    expect(ctx.emom_alternating_guide).toBeTruthy();
    expect(Array.isArray(ctx.emom_alternating_guide)).toBe(true);
  });

  it('omits emom_alternating_guide for tabata metadata', () => {
    const metadata = richMetadataWithBlockFormat('tabata');
    const ctx = buildWorkoutCoachRailContext(metadata, 'Tabata day');
    expect(ctx.emom_alternating_guide).toBeUndefined();
  });
});

describe('validateLiveSetCounts', () => {
  it('returns null when length mismatches', () => {
    expect(validateLiveSetCounts([8, 4], 1)).toBeNull();
  });

  it('returns counts when valid', () => {
    expect(validateLiveSetCounts([8, 4], 2)).toEqual([8, 4]);
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
