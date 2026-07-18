'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { StudioFailsafeWarningReason } from '@/features/live-video/hooks/useStudioFailsafe';

export type StudioTimeoutWarningModalProps = {
  open: boolean;
  warningReason: StudioFailsafeWarningReason | null;
  secondsLeft: number | null;
  onStay: () => void;
};

function reasonSubtitle(reason: StudioFailsafeWarningReason | null): string {
  if (reason === 'idle') {
    return 'No recording was started. Confirm you are still here to keep the studio open.';
  }
  if (reason === 'overtime') {
    return 'Your estimated session time (plus buffer) has ended. Confirm to extend, or the session will close.';
  }
  return 'Confirm you are still here to keep the studio open.';
}

/**
 * Full-screen Solo Studio failsafe warning. Not dismissable via overlay/Escape —
 * host must click “Yes, I'm here” or wait for auto-close.
 */
export function StudioTimeoutWarningModal({
  open,
  warningReason,
  secondsLeft,
  onStay,
}: StudioTimeoutWarningModalProps) {
  const secs = secondsLeft ?? 0;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="z-[100] sm:max-w-md"
        hideCloseButton
        data-testid="studio-timeout-warning-modal"
        onPointerDownOutside={(e) => {
          e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
        }}
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Are you still there?</DialogTitle>
          <DialogDescription>
            Session will close automatically in{' '}
            <span className="font-semibold text-foreground tabular-nums">{secs}</span> seconds.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{reasonSubtitle(warningReason)}</p>
        <DialogFooter>
          <Button type="button" onClick={onStay} data-testid="studio-timeout-stay">
            Yes, I&apos;m here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
