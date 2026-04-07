import { describe, expect, it } from 'vitest';
import { resolveEffectiveCategory } from '@/hooks/use-theme-override';

describe('resolveEffectiveCategory', () => {
  it('uses explicit override when not auto', () => {
    expect(resolveEffectiveCategory('kids', 'business')).toBe('kids');
    expect(resolveEffectiveCategory('community', null)).toBe('community');
  });

  it('uses workspace category when override is auto', () => {
    expect(resolveEffectiveCategory('auto', 'class')).toBe('class');
    expect(resolveEffectiveCategory('auto', 'COMMUNITY')).toBe('community');
  });

  it('falls back to business for invalid workspace category', () => {
    expect(resolveEffectiveCategory('auto', 'unknown-type')).toBe('business');
    expect(resolveEffectiveCategory('auto', null)).toBe('business');
    expect(resolveEffectiveCategory('auto', undefined)).toBe('business');
  });
});
