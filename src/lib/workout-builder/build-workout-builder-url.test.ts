import { describe, expect, it } from 'vitest';
import {
  buildWorkoutBuilderUrl,
  isWorkoutBuilderPathname,
} from '@/lib/workout-builder/build-workout-builder-url';

describe('buildWorkoutBuilderUrl', () => {
  it('builds base path', () => {
    expect(buildWorkoutBuilderUrl('ws-1', 'task-1')).toBe('/app/ws-1/builder/task-1');
  });

  it('appends query params', () => {
    const url = buildWorkoutBuilderUrl('ws-1', 'task-1', {
      from: 'modal',
      return: '/app/ws-1',
    });
    expect(url).toContain('/app/ws-1/builder/task-1?');
    expect(url).toContain('from=modal');
    expect(url).toContain('return=%2Fapp%2Fws-1');
  });
});

describe('isWorkoutBuilderPathname', () => {
  it('matches builder routes', () => {
    expect(isWorkoutBuilderPathname('/app/ws-1/builder/task-1')).toBe(true);
    expect(isWorkoutBuilderPathname('/app/ws-1/builder/task-1/')).toBe(true);
  });

  it('rejects other paths', () => {
    expect(isWorkoutBuilderPathname(null)).toBe(false);
    expect(isWorkoutBuilderPathname('/app/ws-1/session/task-1')).toBe(false);
    expect(isWorkoutBuilderPathname('/app/ws-1')).toBe(false);
  });
});
