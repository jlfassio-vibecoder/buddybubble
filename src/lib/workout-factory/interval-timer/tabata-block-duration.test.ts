import { describe, expect, it } from 'vitest';

import {
  computeTabataBlockDurationFromParams,
  formatIntervalSecondsLabel,
  formatTabataBlockDurationPreview,
} from './tabata-block-duration';

describe('formatIntervalSecondsLabel', () => {
  it('formats sub-minute values as seconds', () => {
    expect(formatIntervalSecondsLabel(30)).toBe('30s');
    expect(formatIntervalSecondsLabel(10)).toBe('10s');
  });

  it('formats minute-plus values as MM:SS', () => {
    expect(formatIntervalSecondsLabel(60)).toBe('01:00');
    expect(formatIntervalSecondsLabel(300)).toBe('05:00');
  });
});

describe('computeTabataBlockDurationFromParams', () => {
  it('computes classic tabata 20/10 x 8 with default setup', () => {
    expect(
      computeTabataBlockDurationFromParams({
        work_seconds: 20,
        rest_seconds: 10,
        rounds: 8,
      }),
    ).toBe(10 + 8 * 20 + 7 * 10);
  });

  it('computes fighters 300/60 x 5', () => {
    expect(
      computeTabataBlockDurationFromParams({
        work_seconds: 300,
        rest_seconds: 60,
        rounds: 5,
      }),
    ).toBe(10 + 5 * 300 + 4 * 60);
  });

  it('returns null for invalid params', () => {
    expect(computeTabataBlockDurationFromParams({ rounds: 8 })).toBeNull();
    expect(
      computeTabataBlockDurationFromParams({
        work_seconds: 20,
        rest_seconds: -1,
        rounds: 8,
      }),
    ).toBeNull();
  });

  it('uses work_segments for multi-exercise circuit duration', () => {
    expect(
      computeTabataBlockDurationFromParams(
        { work_seconds: 30, rest_seconds: 30, rounds: 3 },
        { exerciseCount: 4 },
      ),
    ).toBe(10 + 12 * 30 + 11 * 30);
  });
});

describe('formatTabataBlockDurationPreview', () => {
  it('prefixes MM:SS total label', () => {
    expect(formatTabataBlockDurationPreview(250)).toBe('~04:10 total');
  });
});
