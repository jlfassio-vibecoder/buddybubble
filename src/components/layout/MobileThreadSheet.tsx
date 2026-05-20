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
 * Full-screen thread overlay for narrow viewports (Chat tab).
 * Uses `inset-0` + `100dvh` so the panel covers the shell (not a partial-width right rail).
 * Swipe / overlay tap closes via vaul; parent strips `?thread=` on close.
 */
export function MobileThreadSheet({ open, onOpenChange, themeCategory, children }: Props) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      direction="right"
      shouldScaleBackground={false}
      setBackgroundColorOnScale={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[100] bg-black/50" />
        <Drawer.Content
          className={cn(
            'fixed inset-0 z-[110] flex h-[100dvh] w-screen max-w-none flex-col p-0 outline-none',
            /* Portal is outside dashboard ThemeScope — strip :root token shell; inner scope paints. */
            'border-0 bg-transparent shadow-none',
          )}
        >
          <Drawer.Title className="sr-only">Message thread</Drawer.Title>
          <ThemeScope category={themeCategory}>
            <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
              {children}
            </div>
          </ThemeScope>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
