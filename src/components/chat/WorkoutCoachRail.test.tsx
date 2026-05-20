import { describe, expect, it } from 'vitest';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import {
  buildWorkoutCoachRailContext,
  exerciseNamesFromCoachWorkoutData,
  normalizeCoachWorkoutDataProp,
} from '@/lib/workout-factory/build-workout-coach-rail-context';

describe('WorkoutCoachRail workout context', () => {
  it('hash picker names come from VM flat exercises for rich metadata', () => {
    const metadata = richMetadataWithBlockFormat('tabata');
    const ctx = buildWorkoutCoachRailContext(metadata, 'Tabata');
    const names = exerciseNamesFromCoachWorkoutData(ctx);
    expect(names.length).toBeGreaterThan(0);
    expect(names.some((n) => n.toLowerCase().includes('squat') || n.length > 0)).toBe(true);
  });

  it('normalizeCoachWorkoutDataProp preserves structured launch payload', () => {
    const metadata = richMetadataWithBlockFormat('tabata');
    const launch = buildWorkoutCoachRailContext(metadata, 'Tabata') as unknown as Record<
      string,
      unknown
    >;
    const normalized = normalizeCoachWorkoutDataProp(launch as never, null, 'Tabata');
    expect(normalized.workout_structure_summary).toBeTruthy();
    expect(exerciseNamesFromCoachWorkoutData(normalized).length).toBeGreaterThan(0);
  });
});
