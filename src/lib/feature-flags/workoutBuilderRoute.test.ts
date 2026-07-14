import { afterEach, describe, expect, it } from 'vitest';
import { isWorkoutBuilderRouteEnabled } from '@/lib/feature-flags/workoutBuilderRoute';

describe('isWorkoutBuilderRouteEnabled', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_WORKOUT_BUILDER_ROUTE;
  });

  it('returns true when env is unset (default on)', () => {
    expect(isWorkoutBuilderRouteEnabled()).toBe(true);
  });

  it('returns true when env is empty string', () => {
    process.env.NEXT_PUBLIC_WORKOUT_BUILDER_ROUTE = '';
    expect(isWorkoutBuilderRouteEnabled()).toBe(true);
  });

  it('returns true when env is 1 or true', () => {
    process.env.NEXT_PUBLIC_WORKOUT_BUILDER_ROUTE = '1';
    expect(isWorkoutBuilderRouteEnabled()).toBe(true);
    process.env.NEXT_PUBLIC_WORKOUT_BUILDER_ROUTE = 'true';
    expect(isWorkoutBuilderRouteEnabled()).toBe(true);
    process.env.NEXT_PUBLIC_WORKOUT_BUILDER_ROUTE = 'TRUE';
    expect(isWorkoutBuilderRouteEnabled()).toBe(true);
  });

  it('returns false only for explicit kill-switch values', () => {
    process.env.NEXT_PUBLIC_WORKOUT_BUILDER_ROUTE = '0';
    expect(isWorkoutBuilderRouteEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_WORKOUT_BUILDER_ROUTE = 'false';
    expect(isWorkoutBuilderRouteEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_WORKOUT_BUILDER_ROUTE = 'off';
    expect(isWorkoutBuilderRouteEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_WORKOUT_BUILDER_ROUTE = ' OFF ';
    expect(isWorkoutBuilderRouteEnabled()).toBe(false);
  });
});
