import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

afterEach(() => {
  cleanup();
});

function overlayEl(): HTMLElement | null {
  return document.querySelector('[class*="bg-black/50"]');
}

describe('Sheet modal overlay', () => {
  it('renders backdrop when Sheet modal defaults to true', () => {
    render(
      <Sheet open onOpenChange={() => {}}>
        <SheetContent className="p-4">
          <SheetTitle>Panel</SheetTitle>
          panel
        </SheetContent>
      </Sheet>,
    );
    expect(overlayEl()).toBeTruthy();
  });

  it('omits backdrop when Sheet modal is false (T3 non-modal panel)', () => {
    render(
      <Sheet open modal={false} onOpenChange={() => {}}>
        <SheetContent className="p-4">
          <SheetTitle>Panel</SheetTitle>
          panel
        </SheetContent>
      </Sheet>,
    );
    expect(overlayEl()).toBeNull();
  });

  it('SheetContent modal prop can force no overlay inside a modal Sheet', () => {
    render(
      <Sheet open onOpenChange={() => {}}>
        <SheetContent modal={false} className="p-4">
          <SheetTitle>Panel</SheetTitle>
          panel
        </SheetContent>
      </Sheet>,
    );
    expect(overlayEl()).toBeNull();
  });
});
