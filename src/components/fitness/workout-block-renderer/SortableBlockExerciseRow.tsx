'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  WorkoutBlockExerciseEditRow,
  type WorkoutBlockExerciseEditRowProps,
} from '@/components/fitness/workout-block-renderer/WorkoutBlockExerciseEditRow';

export type SortableBlockExerciseRowProps = WorkoutBlockExerciseEditRowProps & {
  sortableId: string;
};

export function SortableBlockExerciseRow({
  sortableId,
  canWrite,
  ...rowProps
}: SortableBlockExerciseRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortableId,
    disabled: !canWrite,
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
    <div ref={setNodeRef} style={style} className="flex items-start gap-2">
      {canWrite ? (
        <button
          type="button"
          ref={setActivatorNodeRef}
          className={cn(
            'mt-3 shrink-0 rounded p-0.5 text-muted-foreground touch-none',
            'cursor-grab active:cursor-grabbing',
          )}
          aria-label="Drag to reorder exercise"
          {...listeners}
          {...attributes}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <WorkoutBlockExerciseEditRow canWrite={canWrite} {...rowProps} />
      </div>
    </div>
  );
}
