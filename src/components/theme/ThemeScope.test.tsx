import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeScope } from '@/components/theme/ThemeScope';
import { getThemeVariables } from '@/lib/theme-engine/merge';

afterEach(() => {
  cleanup();
});

describe('ThemeScope', () => {
  it('applies registry CSS variables on a real layout box (not display:contents)', () => {
    const expectedPrimary = (getThemeVariables('fitness', false) as Record<string, string>)[
      '--primary'
    ];
    render(
      <ThemeScope category="fitness">
        <span data-testid="child">child</span>
      </ThemeScope>,
    );
    const child = screen.getByTestId('child');
    const scope = child.parentElement;
    expect(scope).toBeTruthy();
    expect(scope?.getAttribute('data-bb-theme')).toBe('fitness');
    expect(scope?.className).not.toMatch(/\bcontents\b/);
    expect(scope?.getAttribute('style') ?? '').toContain(String(expectedPrimary));
  });
});
