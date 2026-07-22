import { describe, expect, it } from 'vitest';
import type { TaskRow } from '@/types/database';
import {
  collectTaskTextFilterHaystacks,
  haystackContainsWordToken,
  taskMatchesTextFilter,
  textFilterTokenVariants,
} from './task-text-filter';

function makeTask(partial: Partial<TaskRow> & { title?: string }): TaskRow {
  return {
    id: 't1',
    title: 'Untitled',
    description: null,
    metadata: {},
    ...partial,
  } as TaskRow;
}

describe('textFilterTokenVariants', () => {
  it('expands simple plural / singular pairs', () => {
    expect(textFilterTokenVariants('legs').sort()).toEqual(['leg', 'legs']);
    expect(textFilterTokenVariants('leg').sort()).toEqual(['leg', 'legs']);
  });
});

describe('haystackContainsWordToken', () => {
  it('matches leg/legs as words but not College', () => {
    expect(haystackContainsWordToken('Leg Day', 'legs')).toBe(true);
    expect(haystackContainsWordToken('Legs focus', 'leg')).toBe(true);
    expect(haystackContainsWordToken('College prep', 'leg')).toBe(false);
    expect(haystackContainsWordToken('College prep', 'legs')).toBe(false);
  });
});

describe('taskMatchesTextFilter', () => {
  it('returns true for empty query', () => {
    expect(taskMatchesTextFilter(makeTask({ title: 'Anything' }), '')).toBe(true);
    expect(taskMatchesTextFilter(makeTask({ title: 'Anything' }), '   ')).toBe(true);
  });

  it('matches title', () => {
    const task = makeTask({ title: 'Lower Body Legs Strength' });
    expect(taskMatchesTextFilter(task, 'Legs')).toBe(true);
    expect(taskMatchesTextFilter(task, 'push')).toBe(false);
  });

  it('matches description', () => {
    const task = makeTask({
      title: 'Session A',
      description: 'Focus on legs and hips today',
    });
    expect(taskMatchesTextFilter(task, 'legs')).toBe(true);
  });

  it('matches metadata.workout_type', () => {
    const task = makeTask({
      title: 'Metcon',
      metadata: { workout_type: 'AMRAP' },
    });
    expect(taskMatchesTextFilter(task, 'amrap')).toBe(true);
  });

  it('does not match nested exercise names', () => {
    const task = makeTask({
      title: 'Upper Push',
      description: 'Chest and shoulders',
      metadata: {
        workout_type: 'Strength',
        exercises: [{ name: 'Bulgarian Split Squats - Legs' }, { name: 'Leg Press' }],
      },
    });
    expect(taskMatchesTextFilter(task, 'legs')).toBe(false);
    expect(collectTaskTextFilterHaystacks(task)).toEqual([
      'Upper Push',
      'Chest and shoulders',
      'Strength',
    ]);
  });

  it('OR-matches across whitespace-separated tokens', () => {
    const task = makeTask({ title: 'Push Day' });
    expect(taskMatchesTextFilter(task, 'pull push')).toBe(true);
    expect(taskMatchesTextFilter(task, 'pull legs')).toBe(false);
  });
});
