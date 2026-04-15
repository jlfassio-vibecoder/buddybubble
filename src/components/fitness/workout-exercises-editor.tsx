'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Dumbbell, GripVertical, X } from 'lucide-react';
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
  /**
   * When true, open the first exercise in inline edit mode as soon as the list is non-empty
   * (e.g. user chose the Kanban pencil for explicit edit intent).
   */
  autoEditFirstRow?: boolean;
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

function newSortableId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function exerciseStableSig(ex: WorkoutExercise): string {
  return JSON.stringify(ex);
}

function multisetEqualStrings(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
  return true;
}

/** Keeps inline edit index aligned with `arrayMove` on the exercise list. */
function mapEditingIndexAfterReorder(
  editing: number | null,
  from: number,
  to: number,
): number | null {
  if (editing === null) return null;
  if (editing === from) return to;
  if (from < to) {
    if (editing > from && editing <= to) return editing - 1;
  } else if (from > to) {
    if (editing >= to && editing < from) return editing + 1;
  }
  return editing;
}

type SortableExerciseRowProps = {
  id: string;
  index: number;
  ex: WorkoutExercise;
  canWrite: boolean;
  isEditing: boolean;
  workoutUnitSystem: UnitSystem;
  idPrefix: string;
  summary: string;
  editName: string;
  editSets: string;
  editReps: string;
  editWeight: string;
  editDuration: string;
  editRpe: string;
  onEditName: (v: string) => void;
  onEditSets: (v: string) => void;
  onEditReps: (v: string) => void;
  onEditWeight: (v: string) => void;
  onEditDuration: (v: string) => void;
  onEditRpe: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onBeginEdit: (idx: number) => void;
  onRemove: (idx: number) => void;
};

function SortableExerciseRow({
  id,
  index,
  ex,
  canWrite,
  isEditing,
  workoutUnitSystem,
  idPrefix,
  summary,
  editName,
  editSets,
  editReps,
  editWeight,
  editDuration,
  editRpe,
  onEditName,
  onEditSets,
  onEditReps,
  onEditWeight,
  onEditDuration,
  onEditRpe,
  onSaveEdit,
  onCancelEdit,
  onBeginEdit,
  onRemove,
}: SortableExerciseRowProps) {
  const dragDisabled = !canWrite || isEditing;
  const thumb =
    typeof ex.thumbnail_url === 'string' && ex.thumbnail_url.trim().length > 0
      ? ex.thumbnail_url.trim()
      : null;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled: dragDisabled,
    transition: {
      duration: 220,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };

  return (
    <li ref={setNodeRef} style={style}>
      {isEditing && canWrite ? (
        <div
          className="space-y-2 rounded-md border border-border/60 bg-background px-3 py-2"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onCancelEdit();
            }
          }}
        >
          <Input
            id={`${idPrefix}-edit-name-${index}`}
            value={editName}
            onChange={(e) => onEditName(e.target.value)}
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
                onChange={(e) => onEditSets(e.target.value)}
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
                onChange={(e) => onEditReps(e.target.value)}
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
                onChange={(e) => onEditWeight(e.target.value)}
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
                onChange={(e) => onEditDuration(e.target.value)}
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
              onChange={(e) => onEditRpe(e.target.value)}
              placeholder="—"
              className="h-8 text-xs"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onSaveEdit}
              className="text-xs font-medium text-primary hover:underline"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="text-xs text-muted-foreground hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-2 py-2 text-sm ring-1 ring-border/10">
          {canWrite ? (
            <button
              type="button"
              ref={setActivatorNodeRef}
              className={cn(
                'shrink-0 rounded p-0.5 text-muted-foreground touch-none',
                dragDisabled ? 'cursor-default opacity-40' : 'cursor-grab active:cursor-grabbing',
              )}
              aria-label="Drag to reorder exercise"
              {...(dragDisabled ? {} : listeners)}
              {...(dragDisabled ? {} : attributes)}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          ) : null}
          <div
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2',
              canWrite && 'cursor-pointer hover:bg-muted/40',
            )}
            onClick={canWrite ? () => onBeginEdit(index) : undefined}
            role={canWrite ? 'button' : undefined}
            tabIndex={canWrite ? 0 : undefined}
            onKeyDown={
              canWrite
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onBeginEdit(index);
                    }
                  }
                : undefined
            }
          >
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border/40 bg-background/80">
              {thumb ? (
                <img src={thumb} alt="" className="h-full w-full object-cover" />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center bg-muted/40"
                  aria-hidden
                >
                  <Dumbbell className="size-4 text-muted-foreground/45" />
                </div>
              )}
            </div>
            <span className="min-w-0 flex-1 font-medium">{ex.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{summary}</span>
            {canWrite && (
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBeginEdit(index);
                  }}
                  className="rounded px-1.5 py-0.5 text-xs text-primary hover:bg-muted"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(index);
                  }}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                  aria-label={`Remove exercise: ${ex.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
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
  autoEditFirstRow = false,
}: WorkoutExercisesEditorProps) {
  const autoEditFirstRowAppliedRef = useRef(false);

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

  const [sortIds, setSortIds] = useState<string[]>(() => exercises.map(() => newSortableId()));
  const prevExercisesRef = useRef<WorkoutExercise[]>(exercises);

  useLayoutEffect(() => {
    const prevEx = prevExercisesRef.current;
    setSortIds((prev) => {
      const n = exercises.length;
      if (n !== prev.length) {
        if (n > prev.length) {
          return [...prev, ...Array.from({ length: n - prev.length }, () => newSortableId())];
        }
        return prev.slice(0, n);
      }
      if (prev.length !== n) {
        return exercises.map(() => newSortableId());
      }
      const prevSigs = prevEx.map(exerciseStableSig);
      const nextSigs = exercises.map(exerciseStableSig);
      if (multisetEqualStrings(prevSigs, nextSigs)) {
        const buckets = new Map<string, string[]>();
        for (let i = 0; i < n; i++) {
          const s = prevSigs[i]!;
          const arr = buckets.get(s) ?? [];
          arr.push(prev[i]!);
          buckets.set(s, arr);
        }
        return exercises.map((ex) => {
          const s = exerciseStableSig(ex);
          const arr = buckets.get(s) ?? [];
          const id = arr.shift();
          if (!arr.length) buckets.delete(s);
          else buckets.set(s, arr);
          return id ?? newSortableId();
        });
      }
      return exercises.map((ex, i) => {
        const p = prevEx[i];
        if (p && exerciseStableSig(p) === exerciseStableSig(ex)) return prev[i]!;
        return newSortableId();
      });
    });
    prevExercisesRef.current = exercises;
  }, [exercises]);

  const dragSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const handleExerciseDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeId = String(active.id);
      const overId = String(over.id);
      const oldIndex = sortIds.indexOf(activeId);
      const newIndex = sortIds.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0) return;
      setSortIds((ids) => arrayMove(ids, oldIndex, newIndex));
      onChange(arrayMove(exercises, oldIndex, newIndex));
      setEditingIndex((ei) => mapEditingIndexAfterReorder(ei, oldIndex, newIndex));
    },
    [exercises, onChange, sortIds],
  );

  const removeExerciseAt = useCallback(
    (idx: number) => {
      onChange(exercises.filter((_, i) => i !== idx));
      setSortIds((ids) => ids.filter((_, i) => i !== idx));
      setEditingIndex((e) => {
        if (e === null) return null;
        if (e === idx) return null;
        if (e > idx) return e - 1;
        return e;
      });
    },
    [exercises, onChange],
  );

  useEffect(() => {
    if (editingIndex != null && editingIndex >= exercises.length) {
      setEditingIndex(null);
    }
  }, [exercises.length, editingIndex]);

  useEffect(() => {
    if (!autoEditFirstRow) {
      autoEditFirstRowAppliedRef.current = false;
      return;
    }
    if (!canWrite || exercises.length === 0 || autoEditFirstRowAppliedRef.current) return;
    autoEditFirstRowAppliedRef.current = true;
    const ex = exercises[0];
    if (!ex) return;
    const d = draftFromExercise(ex);
    setEditName(d.name);
    setEditSets(d.sets);
    setEditReps(d.reps);
    setEditWeight(d.weight);
    setEditDuration(d.duration);
    setEditRpe(d.rpe);
    setEditingIndex(0);
  }, [autoEditFirstRow, canWrite, exercises]);

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
    setSortIds((ids) => [...ids, newSortableId()]);
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

  const sortableListReady = sortIds.length === exercises.length;

  return (
    <div className="space-y-2">
      <Label>Exercises</Label>
      {exercises.length > 0 &&
        (canWrite && sortableListReady ? (
          <DndContext
            id={`${idPrefix}-ex-dnd`}
            sensors={dragSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleExerciseDragEnd}
          >
            <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1.5">
                {exercises.map((ex, idx) => (
                  <SortableExerciseRow
                    key={sortIds[idx]}
                    id={sortIds[idx]!}
                    index={idx}
                    ex={ex}
                    canWrite={canWrite}
                    isEditing={editingIndex === idx}
                    workoutUnitSystem={workoutUnitSystem}
                    idPrefix={idPrefix}
                    summary={formatExerciseSummary(ex)}
                    editName={editName}
                    editSets={editSets}
                    editReps={editReps}
                    editWeight={editWeight}
                    editDuration={editDuration}
                    editRpe={editRpe}
                    onEditName={setEditName}
                    onEditSets={setEditSets}
                    onEditReps={setEditReps}
                    onEditWeight={setEditWeight}
                    onEditDuration={setEditDuration}
                    onEditRpe={setEditRpe}
                    onSaveEdit={saveEdit}
                    onCancelEdit={cancelEdit}
                    onBeginEdit={beginEdit}
                    onRemove={removeExerciseAt}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        ) : (
          <ul className="space-y-1.5">
            {exercises.map((ex, idx) => (
              <li key={idx}>
                <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 font-medium">{ex.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatExerciseSummary(ex)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ))}
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
