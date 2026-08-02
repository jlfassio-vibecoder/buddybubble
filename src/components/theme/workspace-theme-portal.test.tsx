import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { WorkspaceThemeProvider } from '@/components/theme/WorkspaceThemeProvider';
import { resolveEffectiveCategory } from '@/hooks/use-theme-override';
import { taskDateFieldLabels } from '@/lib/task-date-labels';
import { getThemeVariables } from '@/lib/theme-engine/merge';

function findAncestorWithPrimaryToken(start: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = start;
  while (el) {
    if (el.getAttribute('style')?.includes('--primary')) return el;
    el = el.parentElement;
  }
  return null;
}

afterEach(() => {
  cleanup();
});

describe('category override is paint-only', () => {
  it('does not change TaskModal date labels when override differs from DB category', () => {
    const workspaceCategory = 'fitness' as const;
    const themeCategory = resolveEffectiveCategory('kids', workspaceCategory);
    expect(themeCategory).toBe('kids');
    expect(taskDateFieldLabels(workspaceCategory).primary).toBe('Scheduled for');
    expect(taskDateFieldLabels(themeCategory).primary).toBe('Scheduled on');
  });
});

describe('Dialog/Sheet portal ThemeScope from WorkspaceThemeProvider', () => {
  it('injects registry --primary on DialogContent under provider', () => {
    const expectedPrimary = (getThemeVariables('fitness', false) as Record<string, string>)[
      '--primary'
    ];
    render(
      <WorkspaceThemeProvider workspaceCategory="fitness" themeCategory="fitness">
        <Dialog open>
          <DialogContent>
            <DialogTitle>Themed dialog</DialogTitle>
            <span data-testid="dialog-child">child</span>
          </DialogContent>
        </Dialog>
      </WorkspaceThemeProvider>,
    );
    const child = screen.getByTestId('dialog-child');
    const themed = findAncestorWithPrimaryToken(child);
    expect(themed).toBeTruthy();
    expect(themed?.getAttribute('style') ?? '').toContain(String(expectedPrimary));
  });

  it('injects registry --primary on SheetContent under provider', () => {
    const expectedPrimary = (getThemeVariables('kids', false) as Record<string, string>)[
      '--primary'
    ];
    render(
      <WorkspaceThemeProvider workspaceCategory="kids" themeCategory="kids">
        <Sheet open>
          <SheetContent>
            <SheetTitle>Themed sheet</SheetTitle>
            <span data-testid="sheet-child">child</span>
          </SheetContent>
        </Sheet>
      </WorkspaceThemeProvider>,
    );
    const child = screen.getByTestId('sheet-child');
    const themed = findAncestorWithPrimaryToken(child);
    expect(themed).toBeTruthy();
    expect(themed?.getAttribute('style') ?? '').toContain(String(expectedPrimary));
  });

  it('does not inject ThemeScope when provider is absent', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Unscoped</DialogTitle>
          <span data-testid="bare-dialog-child">child</span>
        </DialogContent>
      </Dialog>,
    );
    expect(findAncestorWithPrimaryToken(screen.getByTestId('bare-dialog-child'))).toBeNull();
  });
});
