import { describe, expect, it } from 'vitest';
import type { WorkoutExercise } from '@/lib/item-metadata';
import { appendAmrapRoundRows } from '@/lib/workout-factory/interval-timer/append-amrap-round-rows';

const ex0: WorkoutExercise = { name: 'Burpees', sets: 1, reps: 10, weight: 0 };
const ex1: WorkoutExercise = { name: 'Squats', sets: 1, reps: 12, weight: 45 };

describe('appendAmrapRoundRows', () => {
  it('appends row copying last set values', () => {
    const logs = [[{ weight: '50', reps: '10', rpe: '8', done: true }]];
    const next = appendAmrapRoundRows(logs, [0], [ex0]);
    expect(next[0]).toHaveLength(2);
    expect(next[0][1]).toEqual({ weight: '50', reps: '10', rpe: '8', done: false });
  });

  it('appends for two exercises in block', () => {
    const logs = [
      [{ weight: '', reps: '10', rpe: '', done: false }],
      [{ weight: '45', reps: '12', rpe: '', done: false }],
    ];
    const next = appendAmrapRoundRows(logs, [0, 1], [ex0, ex1]);
    expect(next[0]).toHaveLength(2);
    expect(next[1]).toHaveLength(2);
    expect(next[1][1].weight).toBe('45');
  });

  it('uses prescription when exercise has no rows', () => {
    const logs = [[] as { weight: string; reps: string; rpe: string; done: boolean }[]];
    const next = appendAmrapRoundRows(logs, [0], [ex0]);
    expect(next[0]).toHaveLength(1);
    expect(next[0][0].reps).toBe('10');
    expect(next[0][0].done).toBe(false);
  });

  it('skips out-of-range index', () => {
    const logs = [[{ weight: '', reps: '', rpe: '', done: false }]];
    const next = appendAmrapRoundRows(logs, [99], [ex0]);
    expect(next[0]).toHaveLength(1);
  });

  it('does not mutate input', () => {
    const logs = [[{ weight: '1', reps: '2', rpe: '3', done: false }]];
    const frozen = logs.map((r) => [...r]);
    appendAmrapRoundRows(logs, [0], [ex0]);
    expect(logs).toEqual(frozen);
  });
});
