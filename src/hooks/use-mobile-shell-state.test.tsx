import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MobileShellProvider, useMobileShellState } from '@/hooks/use-mobile-shell-state';

const replace = vi.fn();
let searchParams = new URLSearchParams('tab=chat');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/ws-smoke',
  useSearchParams: () => searchParams,
}));

function DrawerToggle() {
  const { drawerOpen, setDrawerOpen } = useMobileShellState();
  return (
    <div>
      <span data-testid="drawer-open">{String(drawerOpen)}</span>
      <button type="button" onClick={() => setDrawerOpen(true)}>
        Open drawer
      </button>
      <button type="button" onClick={() => setDrawerOpen(false)}>
        Close drawer
      </button>
    </div>
  );
}

describe('useMobileShellState drawer URL', () => {
  beforeEach(() => {
    cleanup();
    replace.mockClear();
    searchParams = new URLSearchParams('tab=chat');
  });

  afterEach(() => {
    cleanup();
  });

  it('derives drawerOpen from ?nav=open', () => {
    searchParams = new URLSearchParams('tab=chat&nav=open');
    render(
      <MobileShellProvider>
        <DrawerToggle />
      </MobileShellProvider>,
    );
    expect(screen.getByTestId('drawer-open').textContent).toBe('true');
  });

  it('setDrawerOpen(true) replaces URL with nav=open', () => {
    render(
      <MobileShellProvider>
        <DrawerToggle />
      </MobileShellProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open drawer' }));
    expect(replace).toHaveBeenCalledWith('/app/ws-smoke?tab=chat&nav=open', { scroll: false });
  });

  it('setDrawerOpen(false) strips nav param', () => {
    searchParams = new URLSearchParams('tab=chat&nav=open');
    render(
      <MobileShellProvider>
        <DrawerToggle />
      </MobileShellProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    expect(replace).toHaveBeenCalledWith('/app/ws-smoke?tab=chat', { scroll: false });
  });

  it('setDrawerOpen(false) is a no-op when nav is already absent (avoids router.replace loops)', () => {
    render(
      <MobileShellProvider>
        <DrawerToggle />
      </MobileShellProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    expect(replace).not.toHaveBeenCalled();
  });
});
