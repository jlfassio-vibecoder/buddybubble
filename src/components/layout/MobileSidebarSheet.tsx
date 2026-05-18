'use client';

import { Drawer } from 'vaul';
import { ThemeScope } from '@/components/theme/ThemeScope';
import { cn } from '@/lib/utils';
import type { WorkspaceCategory } from '@/types/database';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Matches dashboard `ThemeScope` so portaled sheet content gets the same CSS variables. */
  themeCategory: WorkspaceCategory | string | null | undefined;
  children: React.ReactNode;
};

/**
 * Off-canvas workspace rail + bubble list for small viewports (desktop rails stay `md:flex`).
 * Uses vaul for swipe-left-to-close; open-from-edge is handled by {@link MobileEdgeSwipeOpener}.
 */
export function MobileSidebarSheet({ open, onOpenChange, themeCategory, children }: Props) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      direction="left"
      shouldScaleBackground={false}
      setBackgroundColorOnScale={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[100] bg-black/50" />
        <Drawer.Content
          className={cn(
            'fixed inset-y-0 left-0 z-[110] flex h-full w-full max-w-none flex-col p-0 outline-none',
            /* Portal is outside dashboard ThemeScope — strip :root token shell; inner scope paints. */
            'border-0 bg-transparent shadow-none',
          )}
        >
          <Drawer.Title className="sr-only">Socialspaces and channels</Drawer.Title>
          <ThemeScope category={themeCategory}>
            <div className="flex h-full min-h-0 w-full flex-col overflow-hidden pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
              {children}
            </div>
          </ThemeScope>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
