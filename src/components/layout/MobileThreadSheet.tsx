'use client';

import { Drawer } from 'vaul';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

/**
 * Full-screen thread overlay for narrow viewports (Chat tab).
 * Uses `inset-0` + `100dvh` so the panel covers the shell (not a partial-width right rail).
 * Swipe / overlay tap closes via vaul; parent strips `?thread=` on close.
 */
export function MobileThreadSheet({ open, onOpenChange, children }: Props) {
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
            'fixed inset-0 z-[110] flex h-[100dvh] w-screen max-w-none flex-col bg-background p-0 outline-none',
          )}
        >
          <Drawer.Title className="sr-only">Message thread</Drawer.Title>
          <div className="flex h-full min-h-0 w-full flex-col overflow-hidden pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
