'use client';

import { Info } from 'lucide-react';
import type {
  CueProvenance,
  ResolvedCueBundle,
  ResolvedCueField,
} from '@/lib/workout-factory/resolve-exercise-cue-bundle';
import { cn } from '@/lib/utils';

export type WorkoutExerciseCuePanelProps = {
  exerciseName: string;
  bundle: ResolvedCueBundle;
  isExpanded: boolean;
};

const PROVENANCE_LABEL: Record<CueProvenance, string> = {
  workout: 'This workout',
  personal: 'Your notes',
  flat: 'This card',
  library: 'Library',
};

function CueSection({ label, field }: { label: string; field: ResolvedCueField }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-foreground/80">{label}</p>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {PROVENANCE_LABEL[field.provenance]}
        </span>
      </div>
      <p className="mt-0.5 whitespace-pre-wrap">{field.value}</p>
    </div>
  );
}

export function WorkoutExerciseCuePanel({
  exerciseName,
  bundle,
  isExpanded,
}: WorkoutExerciseCuePanelProps) {
  if (!isExpanded) return null;

  if (bundle.isEmpty) {
    return (
      <p className="mt-2 text-xs text-muted-foreground" data-testid="workout-exercise-cue-empty">
        No form cues yet for {exerciseName}.
      </p>
    );
  }

  return (
    <div
      className={cn('mt-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2.5')}
      data-testid="workout-exercise-cue-panel"
    >
      <div className="flex gap-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2 text-xs leading-relaxed text-muted-foreground">
          {bundle.instructions ? (
            <CueSection label="Instructions" field={bundle.instructions} />
          ) : null}
          {bundle.form_cues ? <CueSection label="Form cues" field={bundle.form_cues} /> : null}
          {bundle.tips ? <CueSection label="Tips" field={bundle.tips} /> : null}
          {bundle.injury_prevention_tips ? (
            <CueSection label="Injury notes" field={bundle.injury_prevention_tips} />
          ) : null}
          {bundle.coach_notes ? (
            <CueSection label="Coach notes" field={bundle.coach_notes} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Badge state for row chrome: empty, partial, or full cues available. */
export function cueBadgeState(
  bundle: ResolvedCueBundle | null | undefined,
): 'empty' | 'partial' | 'full' {
  if (!bundle || bundle.isEmpty) return 'empty';
  const count = [
    bundle.instructions,
    bundle.form_cues,
    bundle.tips,
    bundle.injury_prevention_tips,
    bundle.coach_notes,
  ].filter(Boolean).length;
  if (count >= 3) return 'full';
  return 'partial';
}
