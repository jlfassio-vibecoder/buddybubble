import { describe, expect, it } from 'vitest';
import { parseExecutionPatchFromMetadata } from './execution-patch';

describe('parseExecutionPatchFromMetadata', () => {
  it('accepts numeric weight, reps, and rpe from JSON', () => {
    const raw = [{ exerciseIndex: 0, setIndex: 0, weight: 60, reps: 10, rpe: 8 }];
    expect(parseExecutionPatchFromMetadata(raw)).toEqual([
      { exerciseIndex: 0, setIndex: 0, weight: '60', reps: '10', rpe: '8' },
    ]);
  });

  it('still accepts string values', () => {
    expect(
      parseExecutionPatchFromMetadata([{ exerciseIndex: 1, setIndex: 0, weight: '135 lbs' }]),
    ).toEqual([{ exerciseIndex: 1, setIndex: 0, weight: '135' }]);
  });

  it('omits invalid done and keeps the patch', () => {
    expect(
      parseExecutionPatchFromMetadata([
        { exerciseIndex: 0, setIndex: 0, done: 'yes', weight: '5' },
      ]),
    ).toEqual([{ exerciseIndex: 0, setIndex: 0, weight: '5' }]);
  });

  it('returns null for bad indices', () => {
    expect(parseExecutionPatchFromMetadata([{ exerciseIndex: -1, setIndex: 0 }])).toBeNull();
  });
});
