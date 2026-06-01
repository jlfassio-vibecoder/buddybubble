'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface ViewResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isHost: boolean;
  resultsText: string;
  onCopy: () => void;
  copyToast: 'success' | 'error' | null;
  roundDurations: number[];
  savedToAnalytics?: boolean;
}

export default function ViewResultsModal({
  isOpen,
  onClose,
  isHost,
  resultsText,
  onCopy,
  copyToast,
  roundDurations: _roundDurations,
  savedToAnalytics = false,
}: ViewResultsModalProps) {
  if (typeof document === 'undefined') {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AMRAP results{isHost ? ' (host)' : ''}</DialogTitle>
        </DialogHeader>
        <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-xs">
          {resultsText}
        </pre>
        {copyToast === 'success' ? (
          <p className="text-xs text-emerald-600">Copied to clipboard.</p>
        ) : null}
        {copyToast === 'error' ? (
          <p className="text-xs text-destructive">Copy failed — try selecting the text manually.</p>
        ) : null}
        {savedToAnalytics ? (
          <p className="text-xs font-medium text-emerald-600">Saved to your Analytics ✓</p>
        ) : null}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" size="sm" onClick={() => onCopy()}>
            Copy results
          </Button>
          <Button type="button" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
