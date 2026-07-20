'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  WorkoutPreflightReadinessPanel,
  type WorkoutPreflightReadinessPanelProps,
} from '@/components/fitness/workout-intake/WorkoutPreflightReadinessPanel';

export type WorkoutPreflightReadinessDialogProps = WorkoutPreflightReadinessPanelProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Modal shell for Pre-session check-in above TaskModal (z-[150]).
 * Reuses WorkoutPreflightReadinessPanel — no forked step UI.
 */
export function WorkoutPreflightReadinessDialog({
  open,
  onOpenChange,
  ...panelProps
}: WorkoutPreflightReadinessDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="z-[160]" />
        <DialogPrimitive.Content
          className={cn(
            'fixed top-[50%] left-[50%] z-[170] grid w-full max-w-md translate-x-[-50%] translate-y-[-50%]',
            'gap-0 border border-border bg-card p-4 pt-10 text-card-foreground shadow-2xl sm:rounded-2xl',
            'max-h-[min(90dvh,640px)] overflow-y-auto',
          )}
        >
          <DialogTitle className="sr-only">Pre-session check-in</DialogTitle>
          <DialogPrimitive.Close className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground opacity-70 ring-offset-background transition-opacity hover:opacity-100 hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
          <WorkoutPreflightReadinessPanel {...panelProps} />
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
