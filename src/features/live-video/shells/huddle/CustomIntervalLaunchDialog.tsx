'use client';

import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  CUSTOM_INTERVAL_REST_SECONDS_BOUNDS,
  CUSTOM_INTERVAL_WORK_SECONDS_BOUNDS,
  DEFAULT_CUSTOM_INTERVAL_CONFIG,
  parseCustomIntervalStationNames,
  previewCustomIntervalDuration,
  validateCustomIntervalConfig,
  type CustomIntervalConfig,
} from '@/lib/workout-factory/interval-timer/custom-interval-config';
import { INTERVAL_PRESET_ROUND_BOUNDS } from '@/lib/workout-factory/interval-timer/interval-preset-catalog';
import { resolveTabataWorkSegmentTotal } from '@/lib/workout-factory/interval-timer/tabata-circuit-rotation';
import { formatTabataBlockDurationPreview } from '@/lib/workout-factory/interval-timer/tabata-block-duration';

export type CustomIntervalLaunchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Parent runs payload + RPC; resolve true on success so dialog can close. */
  onConfirm: (config: CustomIntervalConfig) => Promise<boolean>;
  submitting?: boolean;
};

function numInputValue(v: number): string {
  return Number.isFinite(v) ? String(v) : '';
}

function parseOptionalInt(raw: string): number {
  if (raw === '') return Number.NaN;
  const n = Number(raw);
  if (!Number.isFinite(n)) return Number.NaN;
  return Math.round(n);
}

export function CustomIntervalLaunchDialog({
  open,
  onOpenChange,
  onConfirm,
  submitting = false,
}: CustomIntervalLaunchDialogProps) {
  const [draft, setDraft] = useState<CustomIntervalConfig>(DEFAULT_CUSTOM_INTERVAL_CONFIG);
  const [stationsText, setStationsText] = useState('');

  useEffect(() => {
    if (open) {
      setDraft(DEFAULT_CUSTOM_INTERVAL_CONFIG);
      setStationsText('');
    }
  }, [open]);

  const stationNames = useMemo(() => parseCustomIntervalStationNames(stationsText), [stationsText]);

  const configForValidation: CustomIntervalConfig = {
    ...draft,
    ...(stationNames.length > 0 ? { station_names: stationNames } : {}),
  };

  const validation = validateCustomIntervalConfig(configForValidation);
  const previewSec = previewCustomIntervalDuration(configForValidation);
  const canSubmit = validation.ok && !submitting;
  const roundBounds = INTERVAL_PRESET_ROUND_BOUNDS.custom;
  const stationCount = stationNames.length;
  const workSegments =
    validation.ok && Number.isFinite(draft.rounds)
      ? resolveTabataWorkSegmentTotal(Math.round(draft.rounds), stationCount)
      : null;

  const handleOpenChange = (next: boolean) => {
    if (!next && submitting) return;
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validation.ok || submitting) return;
    const ok = await onConfirm(validation.value);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        hideCloseButton={submitting}
        data-testid="custom-interval-launch-dialog"
        onPointerDownOutside={(e) => {
          if (submitting) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (submitting) e.preventDefault();
        }}
      >
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>Custom Interval</DialogTitle>
            <DialogDescription>
              Set work, rest, and rounds, then launch the timer for everyone in the session.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 py-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="custom-interval-work" className="text-xs">
                Work (sec)
              </Label>
              <Input
                id="custom-interval-work"
                type="number"
                min={CUSTOM_INTERVAL_WORK_SECONDS_BOUNDS.min}
                max={CUSTOM_INTERVAL_WORK_SECONDS_BOUNDS.max}
                disabled={submitting}
                value={numInputValue(draft.work_seconds)}
                className="h-8 text-xs"
                data-testid="custom-interval-work-input"
                onChange={(e) =>
                  setDraft((d) => ({ ...d, work_seconds: parseOptionalInt(e.target.value) }))
                }
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="custom-interval-rest" className="text-xs">
                Rest (sec)
              </Label>
              <Input
                id="custom-interval-rest"
                type="number"
                min={CUSTOM_INTERVAL_REST_SECONDS_BOUNDS.min}
                max={CUSTOM_INTERVAL_REST_SECONDS_BOUNDS.max}
                disabled={submitting}
                value={numInputValue(draft.rest_seconds)}
                className="h-8 text-xs"
                data-testid="custom-interval-rest-input"
                onChange={(e) =>
                  setDraft((d) => ({ ...d, rest_seconds: parseOptionalInt(e.target.value) }))
                }
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="custom-interval-rounds" className="text-xs">
                Rounds
              </Label>
              <Input
                id="custom-interval-rounds"
                type="number"
                min={roundBounds.min}
                max={roundBounds.max}
                disabled={submitting}
                value={numInputValue(draft.rounds)}
                className="h-8 text-xs"
                data-testid="custom-interval-rounds-input"
                onChange={(e) =>
                  setDraft((d) => ({ ...d, rounds: parseOptionalInt(e.target.value) }))
                }
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="custom-interval-stations" className="text-xs">
                Stations (optional)
              </Label>
              <Textarea
                id="custom-interval-stations"
                disabled={submitting}
                value={stationsText}
                placeholder="Burpees, Mountain Climbers, Squats"
                className="min-h-20 text-xs"
                data-testid="custom-interval-stations-input"
                onChange={(e) => setStationsText(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                One per line or comma-separated. Leave blank for a single Movement.
              </p>
            </div>
          </div>

          <div
            className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-2 text-xs"
            data-testid="custom-interval-preview"
          >
            {previewSec != null ? (
              <p className="font-medium">{formatTabataBlockDurationPreview(previewSec)}</p>
            ) : (
              <p className="text-muted-foreground">Enter valid work, rest, and rounds</p>
            )}
            {stationCount > 1 && workSegments != null && Number.isFinite(draft.rounds) ? (
              <p className="mt-1 text-[10px] text-muted-foreground">
                {stationCount} stations × {Math.round(draft.rounds)} rounds = {workSegments} work
                intervals
              </p>
            ) : null}
            <p className="mt-1 text-[10px] text-muted-foreground">
              Live sessions include 10s GET READY
            </p>
            {!validation.ok ? (
              <p className="mt-1 text-[10px] text-destructive" role="alert">
                {validation.errors[0]}
              </p>
            ) : null}
          </div>

          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              data-testid="custom-interval-cancel"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              aria-busy={submitting}
              data-testid="custom-interval-launch"
            >
              {submitting ? 'Launching…' : 'Launch'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
