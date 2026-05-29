'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  WorkoutIntakeDurationChoice,
  WorkoutIntakeIntensityChoice,
} from '@/lib/agents/coach/task-modal-intake-patch';

export type WorkoutIntakeSessionParamsStepProps = {
  durationMinutes: WorkoutIntakeDurationChoice;
  setDurationMinutes: (value: WorkoutIntakeDurationChoice) => void;
  targetIntensity: WorkoutIntakeIntensityChoice;
  setTargetIntensity: (value: WorkoutIntakeIntensityChoice) => void;
  durationOptions: readonly WorkoutIntakeDurationChoice[];
  intensityOptions: readonly WorkoutIntakeIntensityChoice[];
  onBack: () => void;
  onNext: () => void;
};

export function WorkoutIntakeSessionParamsStep({
  durationMinutes,
  setDurationMinutes,
  targetIntensity,
  setTargetIntensity,
  durationOptions,
  intensityOptions,
  onBack,
  onNext,
}: WorkoutIntakeSessionParamsStepProps) {
  const durationButtons = useMemo(
    () =>
      durationOptions.map((d) => {
        const key = d === 'Optimized for Goals' ? 'opt' : String(d);
        const selected = durationMinutes === d;
        const label = d === 'Optimized for Goals' ? 'Optimized for Goals' : `${d} min`;
        return { key, d, selected, label };
      }),
    [durationMinutes, durationOptions],
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Session duration</p>
        <div className="flex flex-wrap gap-2">
          {durationButtons.map(({ key, d, selected, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setDurationMinutes(d)}
              className={cn(
                'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                selected
                  ? 'border-primary bg-primary/15 text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Target intensity</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {intensityOptions.map((opt) => {
            const selected = targetIntensity === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setTargetIntensity(opt)}
                className={cn(
                  'rounded-md border px-2.5 py-1.5 text-left text-xs font-medium transition-colors',
                  selected
                    ? 'border-primary bg-primary/15 text-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          Back
        </Button>
        <Button type="button" size="sm" onClick={onNext}>
          Next
        </Button>
      </div>
    </div>
  );
}
