import { describe, expect, it } from 'vitest';
import {
  buildWorkoutBuilderGeneratedHandoffUrl,
  buildWorkoutBuilderUrl,
  isWorkoutBuilderPathname,
  WORKOUT_BUILDER_OPEN_WORKOUT_VIEWER_QUERY,
  WORKOUT_BUILDER_TASK_HANDOFF_QUERY,
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

describe('buildWorkoutBuilderGeneratedHandoffUrl', () => {
  it('appends handoff query params for task modal + viewer', () => {
    const url = buildWorkoutBuilderGeneratedHandoffUrl('ws-1', 'task-1');
    expect(url).toContain(`${WORKOUT_BUILDER_TASK_HANDOFF_QUERY}=task-1`);
    expect(url).toContain(`${WORKOUT_BUILDER_OPEN_WORKOUT_VIEWER_QUERY}=1`);
    expect(url.startsWith('/app/ws-1')).toBe(true);
  });

  it('uses safe return path when provided', () => {
    const url = buildWorkoutBuilderGeneratedHandoffUrl('ws-1', 'task-1', {
      returnPath: '/app/ws-1?bubble=b1',
    });
    expect(url).toContain('/app/ws-1?bubble=b1&');
    expect(url).toContain(`${WORKOUT_BUILDER_TASK_HANDOFF_QUERY}=task-1`);
  });
});
