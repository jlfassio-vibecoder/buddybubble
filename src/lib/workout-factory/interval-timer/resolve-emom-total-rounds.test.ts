import { describe, expect, it } from 'vitest';
import { resolveEmomTotalRounds } from './resolve-emom-total-rounds';

describe('resolveEmomTotalRounds', () => {
  it('uses total_rounds when present', () => {
    expect(resolveEmomTotalRounds({ total_rounds: 10, interval_seconds: 60 })).toBe(10);
  });

  it('derives rounds from total_minutes and interval_seconds', () => {
    expect(resolveEmomTotalRounds({ total_minutes: 16, interval_seconds: 60 })).toBe(16);
  });

  it('floors non-60 interval derivation', () => {
    expect(resolveEmomTotalRounds({ total_minutes: 10, interval_seconds: 45 })).toBe(13);
  });

  it('falls back to legacy rounds key', () => {
    expect(resolveEmomTotalRounds({ rounds: 8, interval_seconds: 60 })).toBe(8);
  });

  it('returns null when duration missing', () => {
    expect(resolveEmomTotalRounds({ interval_seconds: 60 })).toBeNull();
  });

  it('returns null when interval_seconds invalid', () => {
    expect(resolveEmomTotalRounds({ total_minutes: 10, interval_seconds: 0 })).toBeNull();
  });
});
