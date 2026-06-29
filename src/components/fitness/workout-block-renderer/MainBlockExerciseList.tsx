'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Exercise } from '@/lib/workout-factory/types/ai-program';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import { Button } from '@/components/ui/button';
import { SortableBlockExerciseRow } from '@/components/fitness/workout-block-renderer/SortableBlockExerciseRow';
import { WorkoutBlockExerciseEditRow } from '@/components/fitness/workout-block-renderer/WorkoutBlockExerciseEditRow';
import {
  addExerciseToBlock,
  blockStationLabel,
  createDefaultBlockExercise,
  moveArrayItem,
  removeExerciseFromBlock,
  reorderExercisesInBlock,
  splitExerciseInBlock,
  canSplitExerciseNames,
  updateExerciseInBlock,
} from '@/components/fitness/workout-block-renderer/workout-block-editor-types';

function newSortableId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function exerciseStableSig(ex: Exercise): string {
  return JSON.stringify({
    id: ex.id,
    exerciseName: ex.exerciseName,
    sets: ex.sets,
    reps: ex.reps,
    order: ex.order,
  });
}

function multisetEqualStrings(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
  return true;
}

function initialSortIds(exercises: Exercise[]): string[] {
  return exercises.map((ex) => ex.id ?? newSortableId());
}

function commitBlockExerciseDragEnd(
  sortIds: string[],
  blocks: WorkoutSessionBlockView[],
  blockId: string,
  activeId: string,
  overId: string,
): { nextSortIds: string[]; nextBlocks: WorkoutSessionBlockView[] } | null {
  if (activeId === overId) return null;
  const oldIndex = sortIds.indexOf(activeId);
  const newIndex = sortIds.indexOf(overId);
  if (oldIndex < 0 || newIndex < 0) return null;
  const nextBlocks = reorderExercisesInBlock(blocks, blockId, oldIndex, newIndex);
  if (nextBlocks === blocks) return null;
  return {
    nextSortIds: moveArrayItem(sortIds, oldIndex, newIndex),
    nextBlocks,
  };
}

export type MainBlockExerciseListProps = {
  block: WorkoutSessionBlockView;
  blocks: WorkoutSessionBlockView[];
  canWrite: boolean;
  idPrefix: string;
  allowAdd: boolean;
  allowRemove: boolean;
  grouped: boolean;
  onChange: (next: WorkoutSessionBlockView[]) => void;
};

export function MainBlockExerciseList({
  block,
  blocks,
  canWrite,
  idPrefix,
  allowAdd,
  allowRemove,
  grouped,
  onChange,
}: MainBlockExerciseListProps) {
  const exercises = block.exercises ?? [];
  const [sortIds, setSortIds] = useState<string[]>(() => initialSortIds(exercises));
  const prevExercisesRef = useRef<Exercise[]>(exercises);

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
        return prev[i] ?? newSortableId();
      });
    });
    prevExercisesRef.current = exercises;
  }, [exercises]);

  const dragSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const result = commitBlockExerciseDragEnd(
        sortIds,
        blocks,
        block.id,
        String(active.id),
        String(over.id),
      );
      if (!result) return;
      setSortIds(result.nextSortIds);
      onChange(result.nextBlocks);
    },
    [blocks, block.id, onChange, sortIds],
  );

  const addExerciseButton = allowAdd ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 text-xs"
      data-testid={`add-exercise-${block.id}`}
      onClick={() =>
        onChange(
          addExerciseToBlock(blocks, block.id, createDefaultBlockExercise(block, exercises.length)),
        )
      }
    >
      Add exercise
    </Button>
  ) : null;

  const sortableReady = canWrite && exercises.length > 1 && sortIds.length === exercises.length;

  const rows = exercises.map((ex, ei) => {
    const rowProps = {
      exercise: ex,
      stationLabel: blockStationLabel(block.blockFormat, ei),
      canWrite,
      idPrefix: `${idPrefix}-${block.id}`,
      exerciseIndex: ei,
      onChange: (patch: Partial<Exercise>) =>
        onChange(updateExerciseInBlock(blocks, block.id, ei, patch)),
      onRemove: allowRemove
        ? () => onChange(removeExerciseFromBlock(blocks, block.id, ei))
        : undefined,
      canSplit: canSplitExerciseNames(block, ex.exerciseName.split(',')),
      onSplit:
        canWrite && canSplitExerciseNames(block, ex.exerciseName.split(','))
          ? () => {
              const names = ex.exerciseName
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
              onChange(splitExerciseInBlock(blocks, block.id, ei, names));
            }
          : undefined,
    };

    if (sortableReady) {
      return <SortableBlockExerciseRow key={sortIds[ei]} sortableId={sortIds[ei]!} {...rowProps} />;
    }

    return <WorkoutBlockExerciseEditRow key={ex.id ?? `${block.id}-ex-${ei}`} {...rowProps} />;
  });

  const listBody = sortableReady ? (
    <DndContext
      id={`${idPrefix}-block-${block.id}-dnd`}
      sensors={dragSensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">{rows}</div>
      </SortableContext>
    </DndContext>
  ) : (
    <div className="space-y-2">{rows}</div>
  );

  if (grouped) {
    return (
      <div className="space-y-2 rounded-xl p-2 ring-1 ring-border/20">
        {listBody}
        {addExerciseButton}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {listBody}
      {addExerciseButton}
    </div>
  );
}

/** @internal Exported for unit tests simulating drag-end without pointer events. */
export function applyBlockExerciseDragEnd(
  sortIds: string[],
  blocks: WorkoutSessionBlockView[],
  blockId: string,
  activeId: string,
  overId: string,
): { nextSortIds: string[]; nextBlocks: WorkoutSessionBlockView[] } | null {
  return commitBlockExerciseDragEnd(sortIds, blocks, blockId, activeId, overId);
}
