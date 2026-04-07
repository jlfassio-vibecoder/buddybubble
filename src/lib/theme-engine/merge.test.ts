import { describe, expect, it } from 'vitest';
import { getThemeVariables } from '@/lib/theme-engine/merge';

function themeVars(category: Parameters<typeof getThemeVariables>[0], isDark: boolean) {
  return getThemeVariables(category, isDark) as Record<string, string>;
}

const ACCENT_KEYS = [
  '--accent-yellow',
  '--accent-red',
  '--accent-orange',
  '--accent-blue',
  '--accent-green',
] as const;

describe('getThemeVariables', () => {
  it('falls back to business for unknown / invalid categories', () => {
    const invalid = themeVars('not-a-real-category', false);
    const business = themeVars('business', false);
    expect(invalid['--primary']).toBe(business['--primary']);
    expect(invalid['--background']).toBe(business['--background']);
  });

  it('selects dark vs light token maps', () => {
    const light = themeVars('business', false);
    const dark = themeVars('business', true);
    expect(light['--background']).not.toBe(dark['--background']);
    expect(light['--foreground']).not.toBe(dark['--foreground']);
  });

  it('always merges Kanban --accent-* keys', () => {
    for (const isDark of [false, true]) {
      const vars = themeVars('kids', isDark);
      for (const key of ACCENT_KEYS) {
        expect(vars[key]).toBeDefined();
        expect(String(vars[key]).length).toBeGreaterThan(0);
      }
    }
  });

  it('normalizes category casing', () => {
    const lower = themeVars('class', false);
    const upper = themeVars('CLASS', false);
    expect(lower['--primary']).toBe(upper['--primary']);
  });
});
