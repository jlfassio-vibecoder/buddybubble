'use client';

import { useCallback, useState } from 'react';
import { X } from 'lucide-react';
import type { WorkoutExercise } from '@/lib/item-metadata';
import type { UnitSystem } from '@/types/database';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type WorkoutExercisesEditorProps = {
  exercises: WorkoutExercise[];
  onChange: (next: WorkoutExercise[]) => void;
  canWrite: boolean;
  workoutUnitSystem: UnitSystem;
  /** Prefix for input ids (avoid duplicate ids when multiple editors mount). */
  idPrefix?: string;
};

/**
 * Inline exercise list + add form — shared by TaskModal and WorkoutViewerDialog.
 */
export function WorkoutExercisesEditor({
  exercises,
  onChange,
  canWrite,
  workoutUnitSystem,
  idPrefix = 'wex',
}: WorkoutExercisesEditorProps) {
  const [newExerciseName, setNewExerciseName] = useState('');
  const [newExSets, setNewExSets] = useState('');
  const [newExReps, setNewExReps] = useState('');
  const [newExWeight, setNewExWeight] = useState('');
  const [newExDuration, setNewExDuration] = useState('');

  const commitExercise = useCallback(() => {
    const name = newExerciseName.trim();
    if (!name) return;
    const sets = newExSets.trim() ? Number(newExSets) : undefined;
    const reps = newExReps.trim() ? Number(newExReps) : undefined;
    const weight = newExWeight.trim() ? Number(newExWeight) : undefined;
    const duration = newExDuration.trim() ? Number(newExDuration) : undefined;
    onChange([...exercises, { name, sets, reps, weight, duration_min: duration }]);
    setNewExerciseName('');
    setNewExSets('');
    setNewExReps('');
    setNewExWeight('');
    setNewExDuration('');
  }, [newExerciseName, newExSets, newExReps, newExWeight, newExDuration, exercises, onChange]);

  return (
    <div className="space-y-2">
      <Label>Exercises</Label>
      {exercises.length > 0 && (
        <ul className="space-y-1.5">
          {exercises.map((ex, idx) => (
            <li
              key={idx}
              className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 font-medium">{ex.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {[
                  ex.sets != null && `${ex.sets}×`,
                  ex.reps != null && `${ex.reps} reps`,
                  ex.weight != null &&
                    `${ex.weight} ${workoutUnitSystem === 'imperial' ? 'lbs' : 'kg'}`,
                  ex.duration_min != null && `${ex.duration_min} min`,
                  ex.work_seconds != null && ex.rest_seconds != null
                    ? `${ex.work_seconds}s work / ${ex.rest_seconds}s rest`
                    : ex.work_seconds != null
                      ? `${ex.work_seconds}s work`
                      : null,
                  ex.rounds != null && ex.rounds > 0 && `${ex.rounds} rounds`,
                  ex.rpe != null && `RPE ${ex.rpe}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => onChange(exercises.filter((_, i) => i !== idx))}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                  aria-label={`Remove exercise: ${ex.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <div className="space-y-2">
          <Input
            id={`${idPrefix}-name`}
            value={newExerciseName}
            onChange={(e) => setNewExerciseName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitExercise();
              }
            }}
            placeholder="Exercise name"
            className="h-9"
          />
          {newExerciseName.trim() && (
            <div className="grid grid-cols-4 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Sets</label>
                <Input
                  type="number"
                  min={0}
                  value={newExSets}
                  onChange={(e) => setNewExSets(e.target.value)}
                  placeholder="—"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Reps</label>
                <Input
                  type="number"
                  min={0}
                  value={newExReps}
                  onChange={(e) => setNewExReps(e.target.value)}
                  placeholder="—"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">
                  {workoutUnitSystem === 'imperial' ? 'lbs' : 'kg'}
                </label>
                <Input
                  type="number"
                  min={0}
                  value={newExWeight}
                  onChange={(e) => setNewExWeight(e.target.value)}
                  placeholder="—"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Min</label>
                <Input
                  type="number"
                  min={0}
                  value={newExDuration}
                  onChange={(e) => setNewExDuration(e.target.value)}
                  placeholder="—"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}
          {newExerciseName.trim() && (
            <button
              type="button"
              onClick={commitExercise}
              className="text-xs text-primary hover:underline"
            >
              + Add exercise
            </button>
          )}
        </div>
      )}
    </div>
  );
}
