import { describe, expect, it } from 'vitest';

import { normalizeStripeEnvKey, stripeKeyModeFromSecretKey } from '@/lib/stripe-runtime';

describe('stripe-runtime', () => {
  it('accepts standard and restricted secret key prefixes', () => {
    expect(stripeKeyModeFromSecretKey('sk_test_abc')).toBe('test');
    expect(stripeKeyModeFromSecretKey('sk_live_abc')).toBe('live');
    expect(stripeKeyModeFromSecretKey('rk_test_abc')).toBe('test');
    expect(stripeKeyModeFromSecretKey('rk_live_abc')).toBe('live');
  });

  it('trims whitespace and wrapping quotes', () => {
    expect(stripeKeyModeFromSecretKey('  sk_live_abc  ')).toBe('live');
    expect(stripeKeyModeFromSecretKey('"sk_test_abc"')).toBe('test');
  });

  it('rejects webhook secrets and empty values', () => {
    expect(stripeKeyModeFromSecretKey('whsec_abc')).toBeNull();
    expect(stripeKeyModeFromSecretKey('')).toBeNull();
    expect(stripeKeyModeFromSecretKey(undefined)).toBeNull();
  });

  it('normalizeStripeEnvKey returns undefined for blank', () => {
    expect(normalizeStripeEnvKey('   ')).toBeUndefined();
  });
});
