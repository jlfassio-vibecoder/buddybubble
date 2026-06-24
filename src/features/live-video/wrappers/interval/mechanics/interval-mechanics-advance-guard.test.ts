import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  endIntervalMechanicsAdvance,
  runIntervalMechanicsAdvance,
  tryBeginIntervalMechanicsAdvance,
} from '@/features/live-video/wrappers/interval/mechanics/interval-mechanics-advance-guard';

describe('interval-mechanics-advance-guard', () => {
  afterEach(() => {
    endIntervalMechanicsAdvance();
  });

  it('blocks concurrent advance calls', async () => {
    expect(tryBeginIntervalMechanicsAdvance()).toBe(true);
    expect(tryBeginIntervalMechanicsAdvance()).toBe(false);
    endIntervalMechanicsAdvance();
    expect(tryBeginIntervalMechanicsAdvance()).toBe(true);
  });

  it('runIntervalMechanicsAdvance skips when already syncing', async () => {
    expect(tryBeginIntervalMechanicsAdvance()).toBe(true);
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await runIntervalMechanicsAdvance(fn);
    expect(result).toBeUndefined();
    expect(fn).not.toHaveBeenCalled();
    endIntervalMechanicsAdvance();
  });
});
