import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobileShellProvider } from '@/hooks/use-mobile-shell-state';
import { MobileHeader } from '@/components/layout/MobileHeader';
import { MobileTabBar } from '@/components/layout/MobileTabBar';
import { MobileWorkspaceStrip } from '@/components/layout/MobileWorkspaceStrip';
import { useWorkspaceStore } from '@/store/workspaceStore';

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/ws-smoke',
  useSearchParams: () => new URLSearchParams('tab=chat'),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('mobile chrome smoke', () => {
  let userWorkspacesSnapshot: ReturnType<typeof useWorkspaceStore.getState>['userWorkspaces'];

  beforeEach(() => {
    userWorkspacesSnapshot = useWorkspaceStore.getState().userWorkspaces;
  });

  afterEach(() => {
    useWorkspaceStore.setState({ userWorkspaces: userWorkspacesSnapshot });
  });

  it('mounts MobileHeader', () => {
    render(<MobileHeader title="Test Bubble" />);
    expect(screen.getByRole('heading', { name: 'Test Bubble' })).toBeTruthy();
  });

  it('mounts MobileWorkspaceStrip with empty workspace list', () => {
    useWorkspaceStore.setState({ userWorkspaces: [] });
    render(<MobileWorkspaceStrip workspaceId="" />);
    expect(screen.getByRole('navigation', { name: 'BuddyBubble list' })).toBeTruthy();
  });

  it('mounts MobileTabBar inside MobileShellProvider', () => {
    render(
      <MobileShellProvider>
        <MobileTabBar />
      </MobileShellProvider>,
    );
    expect(screen.getByRole('navigation', { name: 'Primary socialspace views' })).toBeTruthy();
    expect(screen.getByText('Menu')).toBeTruthy();
  });
});
