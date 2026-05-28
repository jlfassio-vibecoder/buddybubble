import { describe, expect, it } from 'vitest';
import { computeWorkspaceTierInfo } from '@/lib/subscription-permissions-server';

describe('computeWorkspaceTierInfo', () => {
  it('grants system analytics for trialing/active studio tiers', () => {
    expect(computeWorkspaceTierInfo('trialing', 'studio_pro').hasSystemAnalytics).toBe(true);
    expect(computeWorkspaceTierInfo('active', 'coach_pro').hasSystemAnalytics).toBe(true);
    expect(computeWorkspaceTierInfo('active', 'studio').hasSystemAnalytics).toBe(true);
  });

  it('denies system analytics for non-premium tiers or inactive status', () => {
    expect(computeWorkspaceTierInfo('active', 'host').hasSystemAnalytics).toBe(false);
    expect(computeWorkspaceTierInfo('past_due', 'studio_pro').hasSystemAnalytics).toBe(false);
    expect(computeWorkspaceTierInfo('canceled', 'studio_pro').hasSystemAnalytics).toBe(false);
    expect(computeWorkspaceTierInfo(null, 'studio_pro').hasSystemAnalytics).toBe(false);
    expect(computeWorkspaceTierInfo('active', null).hasSystemAnalytics).toBe(false);
  });
});
