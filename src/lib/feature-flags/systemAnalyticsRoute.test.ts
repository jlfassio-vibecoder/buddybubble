import { afterEach, describe, expect, it } from 'vitest';
import { isSystemAnalyticsRouteEnabled } from '@/lib/feature-flags/systemAnalyticsRoute';

describe('isSystemAnalyticsRouteEnabled', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SYSTEM_ANALYTICS_ROUTE;
  });

  it('returns true when env is 1', () => {
    process.env.NEXT_PUBLIC_SYSTEM_ANALYTICS_ROUTE = '1';
    expect(isSystemAnalyticsRouteEnabled()).toBe(true);
  });

  it('returns false when env is unset or not 1', () => {
    expect(isSystemAnalyticsRouteEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_SYSTEM_ANALYTICS_ROUTE = '0';
    expect(isSystemAnalyticsRouteEnabled()).toBe(false);
  });
});
