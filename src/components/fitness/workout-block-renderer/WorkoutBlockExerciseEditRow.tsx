'use client';

import type { Exercise } from '@/lib/workout-factory/types/ai-program';
import {
  formatRepsDisplay,
  parseRepsDraftToStorage,
} from '@/lib/workout-factory/parse-reps-scalar';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type WorkoutBlockExerciseEditRowProps = {
  exercise: Exercise;
  stationLabel?: string | null;
  canWrite: boolean;
  idPrefix: string;
  exerciseIndex: number;
  onChange: (patch: Partial<Exercise>) => void;
  onRemove?: () => void;
};

function parseOptionalNumber(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function WorkoutBlockExerciseEditRow({
  exercise,
  stationLabel,
  canWrite,
  idPrefix,
  exerciseIndex,
  onChange,
  onRemove,
}: WorkoutBlockExerciseEditRowProps) {
  const metaBits: string[] = [];
  if (typeof exercise.workSeconds === 'number' && exercise.workSeconds > 0) {
    metaBits.push(`${exercise.workSeconds}s work`);
  }
  if (typeof exercise.rounds === 'number' && exercise.rounds > 0) {
    metaBits.push(`${exercise.rounds} rounds`);
  }

  return (
    <div className="rounded-xl bg-muted/40 p-3 ring-1 ring-border/15">
      <div className="mb-2 flex items-center gap-2">
        {stationLabel ? (
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {stationLabel}
          </span>
        ) : null}
        <Label htmlFor={`${idPrefix}-name-${exerciseIndex}`} className="sr-only">
          Exercise name
        </Label>
        <Input
          id={`${idPrefix}-name-${exerciseIndex}`}
          value={exercise.exerciseName}
          disabled={!canWrite}
          onChange={(e) => onChange({ exerciseName: e.target.value })}
          className="h-8 min-w-0 flex-1 font-semibold"
          placeholder="Exercise name"
        />
        {canWrite && onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
            aria-label={`Remove exercise: ${exercise.exerciseName}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-sets-${exerciseIndex}`} className="text-xs">
            Sets
          </Label>
          <Input
            id={`${idPrefix}-sets-${exerciseIndex}`}
            type="number"
            min={0}
            disabled={!canWrite}
            value={exercise.sets ?? ''}
            onChange={(e) => {
              const sets = parseOptionalNumber(e.target.value);
              onChange({ sets: sets != null && sets > 0 ? sets : 1 });
            }}
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-reps-${exerciseIndex}`} className="text-xs">
            Reps
          </Label>
          <Input
            id={`${idPrefix}-reps-${exerciseIndex}`}
            disabled={!canWrite}
            value={formatRepsDisplay(exercise.reps) ?? ''}
            onChange={(e) => {
              const reps = parseRepsDraftToStorage(e.target.value);
              onChange({ reps: reps != null ? String(reps) : '' });
            }}
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-rpe-${exerciseIndex}`} className="text-xs">
            RPE
          </Label>
          <Input
            id={`${idPrefix}-rpe-${exerciseIndex}`}
            type="number"
            min={1}
            max={10}
            disabled={!canWrite}
            value={exercise.rpe ?? ''}
            onChange={(e) => {
              const rpe = parseOptionalNumber(e.target.value);
              onChange({ rpe });
            }}
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-rest-${exerciseIndex}`} className="text-xs">
            Rest (s)
          </Label>
          <Input
            id={`${idPrefix}-rest-${exerciseIndex}`}
            type="number"
            min={0}
            disabled={!canWrite}
            value={exercise.restSeconds ?? ''}
            onChange={(e) => {
              const restSeconds = parseOptionalNumber(e.target.value);
              onChange({ restSeconds });
            }}
            className="h-8"
          />
        </div>
      </div>
      <div className="mt-2 space-y-1">
        <Label htmlFor={`${idPrefix}-notes-${exerciseIndex}`} className="text-xs">
          Coach notes
        </Label>
        <Input
          id={`${idPrefix}-notes-${exerciseIndex}`}
          disabled={!canWrite}
          value={exercise.coachNotes ?? ''}
          onChange={(e) => onChange({ coachNotes: e.target.value || undefined })}
          className="h-8"
        />
      </div>
      {metaBits.length > 0 ? (
        <p className={cn('mt-2 text-xs text-muted-foreground')}>{metaBits.join(' · ')}</p>
      ) : null}
    </div>
  );
}
