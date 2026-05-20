'use client';

import type { WorkoutExercise } from '@/lib/item-metadata';
import {
  exerciseThumbnailSrcFromTask,
  formatExercisePrescriptionLineFromTask,
} from '@/lib/workout-factory/format-exercise-prescription-line';
import type { UnitSystem } from '@/types/database';
import { cn } from '@/lib/utils';
import { WorkoutReadExerciseRow } from '@/components/fitness/workout-block-renderer/WorkoutReadExerciseRow';

export type WorkoutFlatExerciseLogListProps = {
  exercises: WorkoutExercise[];
  taskId?: string | null;
  density?: 'full' | 'compact';
  unitSystem?: UnitSystem;
  emptyMessage?: string;
  className?: string;
};

export function WorkoutFlatExerciseLogList({
  exercises,
  taskId = null,
  density = 'full',
  unitSystem = 'metric',
  emptyMessage = 'No exercises recorded on this log.',
  className,
}: WorkoutFlatExerciseLogListProps) {
  if (exercises.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className={cn('space-y-2', className)}>
      {exercises.map((ex, idx) => {
        const metaLine = formatExercisePrescriptionLineFromTask(ex);
        const notes = ex.coach_notes || ex.notes || null;

        return (
          <li key={idx}>
            <WorkoutReadExerciseRow
              name={ex.name}
              metaLine={metaLine}
              notes={notes}
              thumbnailUrl={exerciseThumbnailSrcFromTask(ex)}
              taskId={taskId}
              density={density}
              setLogs={ex.set_logs}
              unitSystem={unitSystem}
            />
          </li>
        );
      })}
    </ul>
  );
}
