import { describe, expect, it } from 'vitest';
import { blockStationLabel, blockUsesGroupedLayout } from './block-station-label';

describe('blockStationLabel', () => {
  it('returns A1/A2 for superset', () => {
    expect(blockStationLabel('superset', 0)).toBe('A1');
    expect(blockStationLabel('superset', 1)).toBe('A2');
  });

  it('returns null for straight_sets', () => {
    expect(blockStationLabel('straight_sets', 0)).toBeNull();
  });

  it('returns A1–A3 for circuit', () => {
    expect(blockStationLabel('circuit', 2)).toBe('A3');
  });
});

describe('blockUsesGroupedLayout', () => {
  it('is true for superset with 2+ exercises', () => {
    expect(blockUsesGroupedLayout('superset', 2)).toBe(true);
    expect(blockUsesGroupedLayout('superset', 1)).toBe(false);
  });
});
