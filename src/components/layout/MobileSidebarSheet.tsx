'use client';

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

/**
 * Off-canvas workspace rail + bubble list for small viewports (desktop rails stay `md:flex`).
 */
export function MobileSidebarSheet({ open, onOpenChange, children }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[min(100vw-0.5rem,24rem)] max-w-none p-0">
        <SheetTitle className="sr-only">Workspaces and channels</SheetTitle>
        <div className="flex h-full min-h-0 w-full flex-row overflow-hidden pt-12">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
