'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { WorkoutIntakeDurationChoice } from '@/lib/agents/coach/task-modal-intake-patch';
import {
  getWorkoutGenerationPhaseIntentLabel,
  type WorkoutGenerationPhaseIntent,
} from '@/lib/workout-factory/generation-intake-context';

export type WorkoutIntakeSessionParamsStepProps = {
  durationMinutes: WorkoutIntakeDurationChoice;
  setDurationMinutes: (value: WorkoutIntakeDurationChoice) => void;
  phaseIntent: WorkoutGenerationPhaseIntent;
  setPhaseIntent: (value: WorkoutGenerationPhaseIntent) => void;
  durationOptions: readonly WorkoutIntakeDurationChoice[];
  phaseIntentOptions: readonly WorkoutGenerationPhaseIntent[];
  onBack: () => void;
  onNext: () => void;
  showBack?: boolean;
};

export function WorkoutIntakeSessionParamsStep({
  durationMinutes,
  setDurationMinutes,
  phaseIntent,
  setPhaseIntent,
  durationOptions,
  phaseIntentOptions,
  onBack,
  onNext,
  showBack = true,
}: WorkoutIntakeSessionParamsStepProps) {
  const durationButtons = useMemo(
    () =>
      durationOptions.map((d) => {
        const key = d === 'Optimized for Goals' ? 'opt' : String(d);
        const selected = durationMinutes === d;
        const label = d === 'Optimized for Goals' ? 'Goal-Driven (Uncapped)' : `${d} min`;
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
        <p className="text-xs text-muted-foreground">Phase intent</p>
        <p className="text-[11px] text-muted-foreground">
          Frame the intent for this planned session — e.g. technical baseline vs. aggressive
          overload.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {phaseIntentOptions.map((opt) => {
            const selected = phaseIntent === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setPhaseIntent(opt)}
                className={cn(
                  'rounded-md border px-2.5 py-1.5 text-left text-xs font-medium transition-colors',
                  selected
                    ? 'border-primary bg-primary/15 text-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                {getWorkoutGenerationPhaseIntentLabel(opt)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        {showBack ? (
          <Button type="button" variant="outline" size="sm" onClick={onBack}>
            Back
          </Button>
        ) : (
          <span />
        )}
        <Button type="button" size="sm" onClick={onNext}>
          Next
        </Button>
      </div>
    </div>
  );
}
