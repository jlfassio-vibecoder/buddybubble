'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const PRESET_MINUTES = [5, 10, 15, 20, 30] as const;

export type EmomDurationSettingsProps = {
  totalMinutes: number;
  trackActivePacing: boolean;
  canWrite: boolean;
  onTotalMinutesChange: (minutes: number) => void;
  onTrackActivePacingChange: (enabled: boolean) => void;
  className?: string;
};

export function EmomDurationSettings({
  totalMinutes,
  trackActivePacing,
  canWrite,
  onTotalMinutesChange,
  onTrackActivePacingChange,
  className,
}: EmomDurationSettingsProps) {
  return (
    <div className={cn('space-y-3 rounded-lg border border-border bg-muted/20 p-3', className)}>
      <div className="space-y-2">
        <Label className="text-sm font-medium">Total minutes</Label>
        <div className="flex flex-wrap gap-2">
          {PRESET_MINUTES.map((m) => (
            <Button
              key={m}
              type="button"
              size="sm"
              variant={totalMinutes === m ? 'default' : 'outline'}
              disabled={!canWrite}
              onClick={() => onTotalMinutesChange(m)}
            >
              {m} min
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="emom-custom-minutes" className="shrink-0 text-xs text-muted-foreground">
            Custom
          </Label>
          <Input
            id="emom-custom-minutes"
            type="number"
            min={1}
            max={120}
            disabled={!canWrite}
            value={totalMinutes}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value));
              if (Number.isFinite(n) && n > 0) onTotalMinutesChange(n);
            }}
            className="h-9 w-24"
          />
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border/60 bg-background p-3">
        <input
          type="checkbox"
          checked={trackActivePacing}
          disabled={!canWrite}
          onChange={(e) => onTrackActivePacingChange(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 rounded border-input"
        />
        <span>
          <span className="block text-sm font-semibold text-foreground">Track finish times</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Athletes log active seconds per minute when they tap Done.
          </span>
        </span>
      </label>
    </div>
  );
}
