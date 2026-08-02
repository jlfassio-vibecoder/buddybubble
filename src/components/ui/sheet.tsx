'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { ThemeScope } from '@/components/theme/ThemeScope';
import { useWorkspaceTheme } from '@/components/theme/WorkspaceThemeProvider';
import { cn } from '@/lib/utils';

const SheetModalContext = React.createContext<boolean | null>(null);

type SheetProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root>;

function Sheet({ modal = true, ...props }: SheetProps) {
  return (
    <SheetModalContext.Provider value={modal}>
      <DialogPrimitive.Root modal={modal} {...props} />
    </SheetModalContext.Provider>
  );
}

const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-[110] bg-black/50 backdrop-blur-[2px]', className)}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

type SheetContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  side?: 'left' | 'right' | 'bottom';
  /** When set, overrides `Sheet` `modal` for overlay rendering (default: inherit from `Sheet`). */
  modal?: boolean;
  /** Hide the default top-right close control (e.g. custom chrome inside the sheet). */
  hideCloseButton?: boolean;
};

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ side = 'left', className, children, hideCloseButton, modal: modalProp, ...props }, ref) => {
  const modalFromContext = React.useContext(SheetModalContext);
  const modal = modalProp ?? modalFromContext ?? false;
  const workspaceTheme = useWorkspaceTheme();

  const content = (
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed z-[120] flex flex-col gap-0 border-border bg-background shadow-xl outline-none',
        side === 'left' &&
          'inset-y-0 left-0 h-full w-[min(100vw-1rem,22rem)] max-w-[24rem] border-r p-0',
        side === 'right' && 'inset-y-0 right-0 h-full w-[min(100vw-1rem,22rem)] border-l p-0',
        side === 'bottom' &&
          'inset-x-0 bottom-0 max-h-[85vh] h-[85vh] w-full rounded-t-xl border-t p-0',
        className,
      )}
      {...props}
    >
      {children}
      {!hideCloseButton ? (
        <DialogPrimitive.Close
          type="button"
          className="absolute right-3 top-3 z-10 rounded-md p-2 text-muted-foreground opacity-80 ring-offset-background transition-opacity hover:opacity-100 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none"
        >
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      ) : null}
    </DialogPrimitive.Content>
  );

  return (
    <SheetPortal>
      {modal ? <SheetOverlay /> : null}
      {workspaceTheme ? (
        <ThemeScope category={workspaceTheme.themeCategory} className="block">
          {content}
        </ThemeScope>
      ) : (
        content
      )}
    </SheetPortal>
  );
});
SheetContent.displayName = 'SheetContent';

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold text-foreground', className)}
    {...props}
  />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle };
