'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { Exercise } from '@/lib/workout-factory/types/ai-program';
import { normalizeWorkoutForEditor } from '@/lib/workout-factory/program-schedule-utils';
import type { ProgramWorkout } from '@/lib/workout-factory/program-schedule-utils';
import type { WorkoutSetTemplate } from '@/lib/workout-factory/types/workout-contract';
import type { WorkoutExercise } from '@/lib/item-metadata';
import type { UnitSystem } from '@/types/database';
import { cn } from '@/lib/utils';
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { WorkoutExercisesEditor } from '@/components/fitness/workout-exercises-editor';

export type WorkoutViewerApplyPayload = {
  title: string;
  description: string;
  exercises: WorkoutExercise[];
};

type ViewMode = 'view' | 'edit';

function ExerciseDetail({ ex }: { ex: Exercise }) {
  const bits = [
    typeof ex.sets === 'number' && ex.sets > 0 && `${ex.sets} sets`,
    ex.reps && `reps ${ex.reps}`,
    ex.rpe != null && `RPE ${ex.rpe}`,
    ex.restSeconds != null && ex.restSeconds > 0 && `rest ${ex.restSeconds}s`,
    ex.workSeconds != null && ex.workSeconds > 0 && `work ${ex.workSeconds}s`,
    ex.rounds != null && ex.rounds > 0 && `${ex.rounds} rounds`,
  ].filter(Boolean);

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
      <p className="font-medium text-foreground">{ex.exerciseName}</p>
      {bits.length > 0 && (
        <p className="mt-0.5 text-xs text-muted-foreground">{bits.join(' · ')}</p>
      )}
      {ex.coachNotes?.trim() ? (
        <p className="mt-1.5 text-xs leading-relaxed text-foreground">{ex.coachNotes.trim()}</p>
      ) : null}
    </div>
  );
}

function InstructionBlockSection({
  title,
  blocks,
}: {
  title: string;
  blocks: Array<{ order: number; exerciseName: string; instructions: string[] }>;
}) {
  if (!blocks?.length) return null;
  return (
    <section className="space-y-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <div className="space-y-2">
        {blocks.map((b, i) => (
          <div
            key={`${b.order}-${i}`}
            className="rounded-md border border-border/60 bg-background px-3 py-2"
          >
            <p className="text-sm font-medium text-foreground">{b.exerciseName}</p>
            {b.instructions?.length ? (
              <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                {b.instructions.map((line, j) => (
                  <li key={j}>{line}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function RichWorkoutReadView({ workoutSet }: { workoutSet: WorkoutSetTemplate }) {
  const firstRaw = workoutSet.workouts?.[0] as ProgramWorkout | undefined;
  if (!firstRaw) {
    return <p className="text-sm text-muted-foreground">No session in this workout set.</p>;
  }
  const first = normalizeWorkoutForEditor(firstRaw);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Workout set</p>
        <p className="text-base font-semibold text-foreground">{workoutSet.title}</p>
        {workoutSet.description?.trim() ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{workoutSet.description}</p>
        ) : null}
        <p className="text-xs text-muted-foreground capitalize">
          Difficulty: {workoutSet.difficulty}
        </p>
      </div>

      <div className="space-y-1 border-t border-border pt-4">
        <p className="text-xs font-medium text-muted-foreground">Session</p>
        <p className="text-sm font-semibold text-foreground">{first.title}</p>
        {first.description?.trim() ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{first.description}</p>
        ) : null}
      </div>

      <InstructionBlockSection title="Warm-up" blocks={first.warmupBlocks ?? []} />

      {first.exerciseBlocks?.map((block, bi) => (
        <section key={block.id ?? `block-${bi}`} className="space-y-2">
          {block.name?.trim() ? (
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {block.name}
            </h4>
          ) : (
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Main work
            </h4>
          )}
          <div className="space-y-2">
            {(block.exercises ?? []).map((ex, ei) => (
              <ExerciseDetail key={ex.id ?? `${bi}-${ei}`} ex={ex} />
            ))}
          </div>
        </section>
      ))}

      <InstructionBlockSection title="Finisher" blocks={first.finisherBlocks ?? []} />
      <InstructionBlockSection title="Cool down" blocks={first.cooldownBlocks ?? []} />
    </div>
  );
}

function FlatExercisesReadView({ exercises }: { exercises: WorkoutExercise[] }) {
  if (exercises.length === 0) {
    return <p className="text-sm text-muted-foreground">No exercises on this card yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {exercises.map((ex, idx) => (
        <li
          key={idx}
          className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm text-foreground"
        >
          <span className="font-medium">{ex.name}</span>
          {[
            ex.sets != null && `${ex.sets}×`,
            ex.reps != null && `${ex.reps} reps`,
            ex.coach_notes && ex.coach_notes,
          ].filter(Boolean).length > 0 && (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {[
                ex.sets != null && `${ex.sets}×`,
                ex.reps != null && `${ex.reps} reps`,
                ex.coach_notes,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export type WorkoutViewerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rich AI output when present. */
  workoutSet: WorkoutSetTemplate | null;
  /** Flat list from task metadata (always passed). */
  exercises: WorkoutExercise[];
  title: string;
  description: string;
  canWrite: boolean;
  workoutUnitSystem: UnitSystem;
  onApply: (payload: WorkoutViewerApplyPayload) => void;
};

export function WorkoutViewerDialog({
  open,
  onOpenChange,
  workoutSet,
  exercises,
  title,
  description,
  canWrite,
  workoutUnitSystem,
  onApply,
}: WorkoutViewerDialogProps) {
  const [mode, setMode] = useState<ViewMode>('view');
  const [localTitle, setLocalTitle] = useState(title);
  const [localDescription, setLocalDescription] = useState(description);
  const [localExercises, setLocalExercises] = useState<WorkoutExercise[]>([]);

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setLocalTitle(title);
      setLocalDescription(description);
      setLocalExercises(exercises.map((e) => ({ ...e })));
      setMode('view');
    }
    wasOpenRef.current = open;
  }, [open, title, description, exercises]);

  const handleApply = useCallback(() => {
    onApply({
      title: localTitle.trim(),
      description: localDescription.trim(),
      exercises: localExercises,
    });
    onOpenChange(false);
  }, [localTitle, localDescription, localExercises, onApply, onOpenChange]);

  const showRich = mode === 'view' && workoutSet != null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="z-[155]" />
        <DialogPrimitive.Content
          className={cn(
            'fixed top-[50%] left-[50%] z-[160] grid max-h-[min(90vh,720px)] w-full max-w-lg translate-x-[-50%] translate-y-[-50%]',
            'gap-0 border border-border bg-card p-0 text-card-foreground shadow-2xl sm:rounded-2xl',
            'grid-rows-[auto_minmax(0,1fr)_auto]',
          )}
        >
          <div className="flex flex-col gap-3 border-b border-border px-5 py-4">
            <div className="flex items-start justify-between gap-2">
              <DialogTitle className="text-lg font-semibold leading-tight text-foreground">
                Workout viewer
              </DialogTitle>
              <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border p-0.5">
                <button
                  type="button"
                  onClick={() => setMode('view')}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    mode === 'view'
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  View
                </button>
                <button
                  type="button"
                  disabled={!canWrite}
                  onClick={() => setMode('edit')}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    mode === 'edit'
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-muted',
                    !canWrite && 'cursor-not-allowed opacity-50',
                  )}
                >
                  Edit
                </button>
              </div>
            </div>
            {!canWrite && mode === 'edit' ? (
              <p className="text-xs text-muted-foreground">
                You don’t have permission to edit this card.
              </p>
            ) : null}
          </div>

          <div className="min-h-0 overflow-y-auto px-5 py-4">
            {mode === 'view' && showRich ? (
              <RichWorkoutReadView workoutSet={workoutSet} />
            ) : mode === 'view' ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  No AI workout structure saved — showing the exercise list from this card.
                </p>
                <FlatExercisesReadView exercises={exercises} />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="wv-title">Title</Label>
                  <Input
                    id="wv-title"
                    value={localTitle}
                    onChange={(e) => setLocalTitle(e.target.value)}
                    disabled={!canWrite}
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wv-desc">Description</Label>
                  <Textarea
                    id="wv-desc"
                    value={localDescription}
                    onChange={(e) => setLocalDescription(e.target.value)}
                    disabled={!canWrite}
                    rows={4}
                    className="min-h-[96px] resize-y"
                  />
                </div>
                <WorkoutExercisesEditor
                  exercises={localExercises}
                  onChange={setLocalExercises}
                  canWrite={canWrite}
                  workoutUnitSystem={workoutUnitSystem}
                  idPrefix="wv-ex"
                />
              </div>
            )}
          </div>

          {mode === 'edit' && canWrite ? (
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={handleApply}>
                Apply changes
              </Button>
            </div>
          ) : (
            <div className="flex justify-end border-t border-border px-5 py-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
