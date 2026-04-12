'use client';

import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { WorkoutExercise } from '@/lib/item-metadata';
import type { UnitSystem } from '@/types/database';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  formatRepsDisplay,
  parseRepsDraftToStorage,
} from '@/lib/workout-factory/parse-reps-scalar';

export type WorkoutExercisesEditorProps = {
  exercises: WorkoutExercise[];
  onChange: (next: WorkoutExercise[]) => void;
  canWrite: boolean;
  workoutUnitSystem: UnitSystem;
  /** Prefix for input ids (avoid duplicate ids when multiple editors mount). */
  idPrefix?: string;
};

function parseOptionalNumber(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Merge draft into base; clears optional numeric fields when inputs are empty. */
function exerciseFromDraft(
  base: WorkoutExercise,
  name: string,
  draft: { sets: string; reps: string; weight: string; duration: string; rpe: string },
): WorkoutExercise {
  const sets = parseOptionalNumber(draft.sets);
  const reps = parseRepsDraftToStorage(draft.reps);
  const weight = parseOptionalNumber(draft.weight);
  const duration_min = parseOptionalNumber(draft.duration);
  const rpe = parseOptionalNumber(draft.rpe);

  const next: WorkoutExercise = {
    ...base,
    name: name.trim() || base.name,
  };

  if (sets !== undefined) next.sets = sets;
  else delete next.sets;
  if (reps !== undefined) next.reps = reps;
  else delete next.reps;
  if (weight !== undefined) next.weight = weight;
  else delete next.weight;
  if (duration_min !== undefined) next.duration_min = duration_min;
  else delete next.duration_min;
  if (rpe !== undefined) next.rpe = rpe;
  else delete next.rpe;

  return next;
}

function draftFromExercise(ex: WorkoutExercise) {
  return {
    name: ex.name,
    sets: ex.sets != null ? String(ex.sets) : '',
    reps: ex.reps != null ? (formatRepsDisplay(ex.reps) ?? '') : '',
    weight: ex.weight != null ? String(ex.weight) : '',
    duration: ex.duration_min != null ? String(ex.duration_min) : '',
    rpe: ex.rpe != null ? String(ex.rpe) : '',
  };
}

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
  const [newExRpe, setNewExRpe] = useState('');

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editSets, setEditSets] = useState('');
  const [editReps, setEditReps] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [editRpe, setEditRpe] = useState('');

  useEffect(() => {
    if (editingIndex != null && editingIndex >= exercises.length) {
      setEditingIndex(null);
    }
  }, [exercises.length, editingIndex]);

  const beginEdit = useCallback(
    (idx: number) => {
      const ex = exercises[idx];
      if (!ex || !canWrite) return;
      const d = draftFromExercise(ex);
      setEditName(d.name);
      setEditSets(d.sets);
      setEditReps(d.reps);
      setEditWeight(d.weight);
      setEditDuration(d.duration);
      setEditRpe(d.rpe);
      setEditingIndex(idx);
    },
    [exercises, canWrite],
  );

  const cancelEdit = useCallback(() => {
    setEditingIndex(null);
  }, []);

  const saveEdit = useCallback(() => {
    if (editingIndex === null) return;
    const name = editName.trim();
    if (!name) return;
    const base = exercises[editingIndex];
    if (!base) return;
    const nextRow = exerciseFromDraft(base, name, {
      sets: editSets,
      reps: editReps,
      weight: editWeight,
      duration: editDuration,
      rpe: editRpe,
    });
    onChange(exercises.map((e, i) => (i === editingIndex ? nextRow : e)));
    setEditingIndex(null);
  }, [
    editingIndex,
    editName,
    editSets,
    editReps,
    editWeight,
    editDuration,
    editRpe,
    exercises,
    onChange,
  ]);

  const commitExercise = useCallback(() => {
    const name = newExerciseName.trim();
    if (!name) return;
    const sets = parseOptionalNumber(newExSets);
    const reps = parseRepsDraftToStorage(newExReps);
    const weight = parseOptionalNumber(newExWeight);
    const duration_min = parseOptionalNumber(newExDuration);
    const rpe = parseOptionalNumber(newExRpe);
    const row: WorkoutExercise = { name };
    if (sets !== undefined) row.sets = sets;
    if (reps !== undefined) row.reps = reps;
    if (weight !== undefined) row.weight = weight;
    if (duration_min !== undefined) row.duration_min = duration_min;
    if (rpe !== undefined) row.rpe = rpe;
    onChange([...exercises, row]);
    setNewExerciseName('');
    setNewExSets('');
    setNewExReps('');
    setNewExWeight('');
    setNewExDuration('');
    setNewExRpe('');
  }, [
    newExerciseName,
    newExSets,
    newExReps,
    newExWeight,
    newExDuration,
    newExRpe,
    exercises,
    onChange,
  ]);

  const formatExerciseSummary = (ex: WorkoutExercise) =>
    [
      ex.sets != null && `${ex.sets}×`,
      ex.reps != null && `${formatRepsDisplay(ex.reps)} reps`,
      ex.weight != null && `${ex.weight} ${workoutUnitSystem === 'imperial' ? 'lbs' : 'kg'}`,
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
      .join(' · ');

  return (
    <div className="space-y-2">
      <Label>Exercises</Label>
      {exercises.length > 0 && (
        <ul className="space-y-1.5">
          {exercises.map((ex, idx) => (
            <li key={idx}>
              {editingIndex === idx && canWrite ? (
                <div
                  className="space-y-2 rounded-md border border-border/60 bg-background px-3 py-2"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelEdit();
                    }
                  }}
                >
                  <Input
                    id={`${idPrefix}-edit-name-${idx}`}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Exercise name"
                    className="h-9"
                    autoFocus
                  />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">Sets</label>
                      <Input
                        type="number"
                        min={0}
                        value={editSets}
                        onChange={(e) => setEditSets(e.target.value)}
                        placeholder="—"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">Reps</label>
                      <Input
                        type="text"
                        inputMode="text"
                        value={editReps}
                        onChange={(e) => setEditReps(e.target.value)}
                        placeholder="12 or 8–10"
                        className="h-8 text-xs"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">
                        {workoutUnitSystem === 'imperial' ? 'lbs' : 'kg'}
                      </label>
                      <Input
                        type="number"
                        min={0}
                        value={editWeight}
                        onChange={(e) => setEditWeight(e.target.value)}
                        placeholder="—"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">Min</label>
                      <Input
                        type="number"
                        min={0}
                        value={editDuration}
                        onChange={(e) => setEditDuration(e.target.value)}
                        placeholder="—"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="max-w-[8rem] space-y-1">
                    <label className="text-[10px] text-muted-foreground">RPE</label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={editRpe}
                      onChange={(e) => setEditRpe(e.target.value)}
                      placeholder="—"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={saveEdit}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm',
                    canWrite && 'cursor-pointer hover:bg-muted/40',
                  )}
                  onClick={canWrite ? () => beginEdit(idx) : undefined}
                  role={canWrite ? 'button' : undefined}
                  tabIndex={canWrite ? 0 : undefined}
                  onKeyDown={
                    canWrite
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            beginEdit(idx);
                          }
                        }
                      : undefined
                  }
                >
                  <span className="min-w-0 flex-1 font-medium">{ex.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatExerciseSummary(ex)}
                  </span>
                  {canWrite && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          beginEdit(idx);
                        }}
                        className="rounded px-1.5 py-0.5 text-xs text-primary hover:bg-muted"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onChange(exercises.filter((_, i) => i !== idx));
                        }}
                        className="text-muted-foreground transition-colors hover:text-destructive"
                        aria-label={`Remove exercise: ${ex.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
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
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                    type="text"
                    inputMode="text"
                    value={newExReps}
                    onChange={(e) => setNewExReps(e.target.value)}
                    placeholder="12 or 8–10"
                    className="h-8 text-xs"
                    autoComplete="off"
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
              <div className="max-w-[8rem] space-y-1">
                <label className="text-[10px] text-muted-foreground">RPE</label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={newExRpe}
                  onChange={(e) => setNewExRpe(e.target.value)}
                  placeholder="—"
                  className="h-8 text-xs"
                />
              </div>
            </>
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
