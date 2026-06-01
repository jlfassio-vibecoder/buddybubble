'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type WorkoutIntakeSorenessStepProps = {
  sorenessOptions: readonly string[];
  soreness: Set<string>;
  toggleSoreness: (name: string) => void;
  onBack: () => void;
  submitSlot: ReactNode;
};

export function WorkoutIntakeSorenessStep({
  sorenessOptions,
  soreness,
  toggleSoreness,
  onBack,
  submitSlot,
}: WorkoutIntakeSorenessStepProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Soreness (select any that apply)</p>
      <div className="flex flex-wrap gap-2">
        {sorenessOptions.map((name) => {
          const selected = soreness.has(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => toggleSoreness(name)}
              className={cn(
                'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                selected
                  ? 'border-primary bg-primary/15 text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              {name}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          Back
        </Button>
        {submitSlot}
      </div>
    </div>
  );
}
