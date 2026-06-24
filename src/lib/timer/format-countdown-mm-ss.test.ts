import { describe, expect, it } from 'vitest';

import { formatCountdownMmSs } from '@/lib/timer/format-countdown-mm-ss';

describe('formatCountdownMmSs', () => {
  it('formats seconds under a minute', () => {
    expect(formatCountdownMmSs(7)).toBe('00:07');
  });

  it('formats minutes and seconds', () => {
    expect(formatCountdownMmSs(65)).toBe('01:05');
  });

  it('clamps negative values to zero', () => {
    expect(formatCountdownMmSs(-1)).toBe('00:00');
  });

  it('floors fractional seconds', () => {
    expect(formatCountdownMmSs(7.9)).toBe('00:07');
  });
});
