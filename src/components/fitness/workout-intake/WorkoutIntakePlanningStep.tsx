'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { WorkoutGenerationProgressionTrend } from '@/lib/workout-factory/generation-intake-context';

export type WorkoutIntakePlanningStepProps = {
  progressionTrend: WorkoutGenerationProgressionTrend;
  setProgressionTrend: (value: WorkoutGenerationProgressionTrend) => void;
  progressionTrendOptions: readonly WorkoutGenerationProgressionTrend[];
  anchorLiftName: string;
  setAnchorLiftName: (value: string) => void;
  anchorLiftWeight: number | null;
  setAnchorLiftWeight: (value: number | null) => void;
  anchorLiftReps: number | null;
  setAnchorLiftReps: (value: number | null) => void;
  temporaryLimitations: string;
  setTemporaryLimitations: (value: string) => void;
  onBack: () => void;
  submitSlot: ReactNode;
};

function parseOptionalPositiveInt(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded > 0 ? rounded : null;
}

export function WorkoutIntakePlanningStep({
  progressionTrend,
  setProgressionTrend,
  progressionTrendOptions,
  anchorLiftName,
  setAnchorLiftName,
  anchorLiftWeight,
  setAnchorLiftWeight,
  anchorLiftReps,
  setAnchorLiftReps,
  temporaryLimitations,
  setTemporaryLimitations,
  onBack,
  submitSlot,
}: WorkoutIntakePlanningStepProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Progression trend</p>
        <div className="flex flex-wrap gap-2">
          {progressionTrendOptions.map((opt) => {
            const selected = progressionTrend === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setProgressionTrend(opt)}
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

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Anchor lift (optional)</p>
        <p className="text-[11px] text-muted-foreground">
          Primary lift for baseline loading — e.g. Squat, Bench, Deadlift.
        </p>
        <Input
          value={anchorLiftName}
          onChange={(e) => setAnchorLiftName(e.target.value)}
          placeholder="Primary lift"
          className="h-8 text-xs"
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            value={anchorLiftWeight ?? ''}
            onChange={(e) => setAnchorLiftWeight(parseOptionalPositiveInt(e.target.value))}
            placeholder="Weight"
            className="h-8 text-xs"
          />
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            value={anchorLiftReps ?? ''}
            onChange={(e) => setAnchorLiftReps(parseOptionalPositiveInt(e.target.value))}
            placeholder="Reps"
            className="h-8 text-xs"
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Temporary limitations (optional)</p>
        <p className="text-[11px] text-muted-foreground">
          Acute issues this week only — chronic conditions live in your profile.
        </p>
        <Textarea
          value={temporaryLimitations}
          onChange={(e) => setTemporaryLimitations(e.target.value)}
          placeholder="Any temporary limitations this week?"
          rows={3}
          className="text-xs"
        />
      </div>

      <div className="flex flex-wrap justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          Back
        </Button>
        {submitSlot}
      </div>
    </div>
  );
}
