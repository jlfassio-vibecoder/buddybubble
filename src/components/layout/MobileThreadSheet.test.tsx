import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MobileThreadSheet } from '@/components/layout/MobileThreadSheet';

vi.mock('vaul', () => {
  const DrawerRoot = ({
    open,
    children,
    direction,
  }: {
    open?: boolean;
    children: ReactNode;
    direction?: string;
    onOpenChange?: (open: boolean) => void;
  }) =>
    open ? (
      <div data-vaul-root data-direction={direction}>
        {children}
      </div>
    ) : null;

  const DrawerPortal = ({ children }: { children: ReactNode }) => <>{children}</>;

  const DrawerOverlay = (props: ComponentProps<'div'>) => <div data-vaul-overlay {...props} />;

  const DrawerContent = ({ children, className, ...rest }: ComponentProps<'div'>) => (
    <div data-vaul-content className={className} {...rest}>
      {children}
    </div>
  );

  const DrawerTitle = ({ children, className }: ComponentProps<'h2'>) => (
    <h2 className={className}>{children}</h2>
  );

  return {
    Drawer: {
      Root: DrawerRoot,
      Portal: DrawerPortal,
      Overlay: DrawerOverlay,
      Content: DrawerContent,
      Title: DrawerTitle,
    },
  };
});

describe('MobileThreadSheet', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders right-direction drawer when open with full-width content', () => {
    render(
      <MobileThreadSheet open themeCategory="business" onOpenChange={() => {}}>
        <p>Thread body</p>
      </MobileThreadSheet>,
    );
    expect(screen.getByText('Thread body')).toBeTruthy();
    const root = document.querySelector('[data-vaul-root]');
    expect(root?.getAttribute('data-direction')).toBe('right');
    const content = document.querySelector('[data-vaul-content]');
    expect(content?.className).toMatch(/inset-0/);
    expect(content?.className).toMatch(/w-screen/);
    expect(content?.className).toMatch(/100dvh/);
    expect(content?.className).toMatch(/z-\[110\]/);
  });

  it('does not render children when closed', () => {
    render(
      <MobileThreadSheet open={false} themeCategory="business" onOpenChange={() => {}}>
        <p>Thread body</p>
      </MobileThreadSheet>,
    );
    expect(screen.queryByText('Thread body')).toBeNull();
  });
});
