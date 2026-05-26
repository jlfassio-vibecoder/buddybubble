import { describe, expect, it } from 'vitest';
import { intervalRowSnapshotKey } from '@/lib/workout-factory/interval-timer/interval-row-snapshot-key';

describe('intervalRowSnapshotKey', () => {
  it('returns null key for null snapshot', () => {
    expect(intervalRowSnapshotKey(null)).toBe('null');
  });

  it('keys tabata work phase by round and phase', () => {
    expect(intervalRowSnapshotKey({ roundIndex: 1, activeSetPhase: 'work' })).toBe('1:work:');
  });

  it('keys emom alternating stations in sorted order', () => {
    expect(
      intervalRowSnapshotKey({
        roundIndex: 0,
        activeSetPhase: 'work',
        activeStationIndices: [1, 0],
      }),
    ).toBe('0:work:0,1');
  });
});
