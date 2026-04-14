import { describe, expect, it } from 'vitest';
import {
  acquisitionContextFromInviteType,
  formatUtmParams,
  inviteTokenSuffix,
  normalizedAcquisitionContext,
  resolveLeadSegment,
} from '@/lib/lead-capture-analytics';

describe('acquisitionContextFromInviteType', () => {
  it('maps qr and link to in_person', () => {
    expect(acquisitionContextFromInviteType('qr')).toBe('in_person');
    expect(acquisitionContextFromInviteType('LINK')).toBe('in_person');
  });

  it('treats other types as online', () => {
    expect(acquisitionContextFromInviteType('email')).toBe('online');
    expect(acquisitionContextFromInviteType(null)).toBe('online');
  });
});

describe('normalizedAcquisitionContext', () => {
  it('reads acquisition_context from metadata', () => {
    expect(normalizedAcquisitionContext({ acquisition_context: 'in_person' })).toBe('in_person');
    expect(normalizedAcquisitionContext({ acquisition_context: 'online' })).toBe('online');
  });

  it('defaults invalid or missing to online', () => {
    expect(normalizedAcquisitionContext(null)).toBe('online');
    expect(normalizedAcquisitionContext({})).toBe('online');
  });
});

describe('resolveLeadSegment', () => {
  it('prefers invitation invite_type over metadata', () => {
    expect(resolveLeadSegment({ acquisition_context: 'online' }, 'link')).toBe('in_person');
  });

  it('falls back to metadata when invite type is blank', () => {
    expect(resolveLeadSegment({ acquisition_context: 'in_person' }, '')).toBe('in_person');
  });
});

describe('formatUtmParams', () => {
  it('formats key=value pairs', () => {
    expect(formatUtmParams({ utm_source: 'x', empty: '' })).toBe('utm_source=x');
  });

  it('returns em dash for empty', () => {
    expect(formatUtmParams(null)).toBe('—');
  });
});

describe('inviteTokenSuffix', () => {
  it('returns last 8 chars with ellipsis prefix', () => {
    expect(inviteTokenSuffix('abcdefghijklmnop')).toBe('…ijklmnop');
  });

  it('returns null for short token', () => {
    expect(inviteTokenSuffix('short')).toBeNull();
  });
});
