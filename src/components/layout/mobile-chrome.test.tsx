import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { MobileShellProvider } from '@/hooks/use-mobile-shell-state';
import { BubbleSidebar } from '@/components/dashboard/bubble-sidebar';
import { MobileHeader } from '@/components/layout/MobileHeader';
import { MobileSidebarSheet } from '@/components/layout/MobileSidebarSheet';
import { MobileTabBar } from '@/components/layout/MobileTabBar';
import { MobileWorkspaceStrip } from '@/components/layout/MobileWorkspaceStrip';
import { ThemeScope } from '@/components/theme/ThemeScope';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { BubbleRow } from '@/types/database';

function findAncestorWithRailBgToken(start: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = start;
  while (el) {
    if (el.getAttribute('style')?.includes('--rail-bg')) return el;
    el = el.parentElement;
  }
  return null;
}

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/ws-smoke',
  useSearchParams: () => new URLSearchParams('tab=chat'),
}));

vi.mock('@/app/(dashboard)/app/[workspace_id]/bubble-actions', () => ({
  createBubbleAction: vi.fn(),
}));

vi.mock('@/components/modals/BubbleSettingsModal', () => ({
  BubbleSettingsModal: () => null,
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('vaul', () => {
  const DrawerRoot = ({
    open,
    children,
  }: {
    open?: boolean;
    children: ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => (open ? <>{children}</> : null);

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

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
  }) => (
    <a
      href={href}
      onClick={(e) => {
        onClick?.();
        e.preventDefault();
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}));

const sampleBubble: BubbleRow = {
  id: 'bubble-1',
  workspace_id: 'ws-smoke',
  name: 'General',
  is_private: false,
  bubble_type: 'community',
  created_at: '2026-01-01T00:00:00Z',
  icon: null,
  message_visibility: 'members',
  metadata: {},
};

describe('mobile chrome smoke', () => {
  let userWorkspacesSnapshot: ReturnType<typeof useWorkspaceStore.getState>['userWorkspaces'];

  beforeEach(() => {
    userWorkspacesSnapshot = useWorkspaceStore.getState().userWorkspaces;
  });

  afterEach(() => {
    cleanup();
    useWorkspaceStore.setState({ userWorkspaces: userWorkspacesSnapshot });
  });

  it('mounts MobileHeader', () => {
    render(<MobileHeader title="Test Bubble" />);
    expect(screen.getByRole('heading', { name: 'Test Bubble' })).toBeTruthy();
  });

  it('mounts MobileWorkspaceStrip with empty workspace list under ThemeScope', () => {
    useWorkspaceStore.setState({ userWorkspaces: [] });
    render(
      <ThemeScope category="business">
        <MobileWorkspaceStrip workspaceId="" currentWorkspaceName="Acme Gym" />
      </ThemeScope>,
    );
    expect(screen.getByRole('navigation', { name: 'BuddyBubble list' })).toBeTruthy();
    expect(screen.getByText('Socialspaces')).toBeTruthy();
    expect(screen.getByText('Acme Gym')).toBeTruthy();
  });

  it('calls onWorkspaceNavigate when a workspace link is clicked', () => {
    const onWorkspaceNavigate = vi.fn();
    useWorkspaceStore.setState({
      userWorkspaces: [
        {
          id: 'ws-other',
          name: 'Other Space',
          category_type: 'business',
          icon_url: null,
          created_at: '',
          role: 'admin',
          onboarding_status: 'completed',
          trial_expires_at: null,
        },
      ],
    });
    render(
      <ThemeScope category="business">
        <MobileWorkspaceStrip
          workspaceId="ws-smoke"
          currentWorkspaceName="Smoke"
          onWorkspaceNavigate={onWorkspaceNavigate}
        />
      </ThemeScope>,
    );
    const nav = screen.getByRole('navigation', { name: 'BuddyBubble list' });
    fireEvent.click(within(nav).getByRole('link', { name: 'Other Space' }));
    expect(onWorkspaceNavigate).toHaveBeenCalledTimes(1);
  });

  it('SheetContent hideCloseButton omits the default sheet close control', () => {
    render(
      <Sheet open onOpenChange={() => {}}>
        <SheetContent hideCloseButton className="p-4">
          <span>panel</span>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('MobileWorkspaceStrip footer shows action captions', () => {
    useWorkspaceStore.setState({ userWorkspaces: [] });
    render(
      <ThemeScope category="business">
        <MobileWorkspaceStrip
          workspaceId="ws-smoke"
          currentWorkspaceName="Acme"
          onOpenCreateWorkspace={() => {}}
          onOpenProfile={() => {}}
        />
      </ThemeScope>,
    );
    const actions = screen.getByRole('navigation', { name: 'Socialspace actions' });
    expect(within(actions).getByText('Invite')).toBeTruthy();
    expect(within(actions).getByText('New')).toBeTruthy();
    expect(within(actions).getByText('You')).toBeTruthy();
  });

  it('MobileWorkspaceStrip close button calls onClose', () => {
    const onClose = vi.fn();
    useWorkspaceStore.setState({ userWorkspaces: [] });
    render(
      <ThemeScope category="business">
        <MobileWorkspaceStrip workspaceId="" currentWorkspaceName="Acme" onClose={onClose} />
      </ThemeScope>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('MobileSidebarSheet injects theme variables inside the portaled drawer', () => {
    render(
      <MobileSidebarSheet open themeCategory="business" onOpenChange={() => {}}>
        <span data-testid="drawer-child">child</span>
      </MobileSidebarSheet>,
    );
    const child = screen.getByTestId('drawer-child');
    expect(findAncestorWithRailBgToken(child)).toBeTruthy();
  });

  it('drawer mode shows Channels header and stacked new-bubble form', () => {
    render(
      <ThemeScope category="business">
        <BubbleSidebar
          workspaceId="ws-smoke"
          collapsed={false}
          onCollapsedChange={() => {}}
          bubbles={[]}
          selectedBubbleId={null}
          onSelectBubble={() => {}}
          onBubblesChange={() => {}}
          canCreateWorkspaceBubble
          isAdmin={false}
          hideSidebarCollapseButton
          isMobileDrawerMode
        />
      </ThemeScope>,
    );
    expect(screen.getByRole('heading', { name: 'Bubbles' }).textContent).toBe('Channels');
    const form = screen.getByPlaceholderText('New bubble').closest('form');
    expect(form?.className).toMatch(/flex-col/);
    expect(form?.querySelector('button[type="submit"]')?.className).toMatch(/w-full/);
  });

  it('shows bubble settings control in mobile drawer mode without hover', () => {
    render(
      <ThemeScope category="business">
        <BubbleSidebar
          workspaceId="ws-smoke"
          collapsed={false}
          onCollapsedChange={() => {}}
          bubbles={[sampleBubble]}
          selectedBubbleId={null}
          onSelectBubble={() => {}}
          onBubblesChange={() => {}}
          canCreateWorkspaceBubble={false}
          isAdmin
          hideSidebarCollapseButton
          isMobileDrawerMode
        />
      </ThemeScope>,
    );
    const settings = screen.getByRole('button', { name: 'Settings for General' });
    expect(settings.className).not.toMatch(/opacity-0/);
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
