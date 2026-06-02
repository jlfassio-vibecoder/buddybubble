'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
  EmomMinuteSplitEntry,
  IntervalType,
} from '@/features/live-video/wrappers/interval/types/interval-engine';

function viewResultsDialogTitle(intervalType: IntervalType | undefined, isHost: boolean): string {
  const hostSuffix = isHost ? ' (host)' : '';
  switch (intervalType) {
    case 'emom':
      return `EMOM results${hostSuffix}`;
    case 'tabata':
      return `Tabata results${hostSuffix}`;
    case 'amrap':
      return `AMRAP results${hostSuffix}`;
    default:
      return `Workout results${hostSuffix}`;
  }
}

export interface ViewResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isHost: boolean;
  intervalType?: IntervalType;
  resultsText: string;
  onCopy: () => void;
  copyToast: 'success' | 'error' | null;
  roundDurations: number[];
  /** EMOM self pacing (not a huddle leaderboard). */
  minuteSplitEntries?: EmomMinuteSplitEntry[];
  savedToAnalytics?: boolean;
}

export default function ViewResultsModal({
  isOpen,
  onClose,
  isHost,
  intervalType,
  resultsText,
  onCopy,
  copyToast,
  roundDurations: _roundDurations,
  minuteSplitEntries = [],
  savedToAnalytics = false,
}: ViewResultsModalProps) {
  if (typeof document === 'undefined') {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{viewResultsDialogTitle(intervalType, isHost)}</DialogTitle>
        </DialogHeader>
        <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-xs">
          {resultsText}
        </pre>
        {minuteSplitEntries.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">Your EMOM minute splits</p>
            <ul className="flex flex-wrap gap-1.5 text-xs tabular-nums text-muted-foreground">
              {minuteSplitEntries.map((e) => (
                <li
                  key={e.minuteIndex}
                  className="rounded border border-border/60 bg-muted/30 px-2 py-0.5"
                >
                  M{e.minuteIndex} {e.durationLabel}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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
