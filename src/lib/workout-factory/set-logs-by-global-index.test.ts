import { describe, expect, it } from 'vitest';
import { setLogsByGlobalIndexFromMetadata } from './set-logs-by-global-index';

describe('setLogsByGlobalIndexFromMetadata', () => {
  it('maps exercises with set_logs by global index', () => {
    const map = setLogsByGlobalIndexFromMetadata({
      exercises: [
        {
          name: 'Squat',
          sets: 2,
          set_logs: [
            { set: 1, reps: 8, done: true },
            { set: 2, reps: 6, done: true },
          ],
        },
        { name: 'Press', sets: 0, set_logs: [] },
        {
          name: 'Row',
          sets: 1,
          set_logs: [{ set: 1, weight: 50, done: true }],
        },
      ],
    });

    expect(map.size).toBe(2);
    expect(map.get(0)).toHaveLength(2);
    expect(map.get(1)).toBeUndefined();
    expect(map.get(2)).toHaveLength(1);
  });

  it('returns empty map when no exercises', () => {
    expect(setLogsByGlobalIndexFromMetadata({}).size).toBe(0);
  });
});
