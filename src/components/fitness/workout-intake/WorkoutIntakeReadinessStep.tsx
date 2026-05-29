'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export type WorkoutIntakeReadinessStepProps = {
  readiness: number;
  setReadiness: (value: number) => void;
  sleepQuality: number;
  setSleepQuality: (value: number) => void;
  onNext: () => void;
};

export function WorkoutIntakeReadinessStep({
  readiness,
  setReadiness,
  sleepQuality,
  setSleepQuality,
  onNext,
}: WorkoutIntakeReadinessStepProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="workout-readiness">Readiness / energy (1–10)</Label>
        <div className="flex items-center gap-3">
          <input
            id="workout-readiness"
            type="range"
            min={1}
            max={10}
            step={1}
            value={readiness}
            onChange={(e) => setReadiness(Number(e.target.value))}
            className="h-2 w-full flex-1 cursor-pointer accent-primary"
            aria-valuemin={1}
            aria-valuemax={10}
            aria-valuenow={readiness}
          />
          <span className="w-8 tabular-nums text-sm font-medium text-foreground">{readiness}</span>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="workout-sleep">Sleep quality (1–10)</Label>
        <div className="flex items-center gap-3">
          <input
            id="workout-sleep"
            type="range"
            min={1}
            max={10}
            step={1}
            value={sleepQuality}
            onChange={(e) => setSleepQuality(Number(e.target.value))}
            className="h-2 w-full flex-1 cursor-pointer accent-primary"
            aria-valuemin={1}
            aria-valuemax={10}
            aria-valuenow={sleepQuality}
          />
          <span className="w-8 tabular-nums text-sm font-medium text-foreground">
            {sleepQuality}
          </span>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={onNext}>
          Next
        </Button>
      </div>
    </div>
  );
}
