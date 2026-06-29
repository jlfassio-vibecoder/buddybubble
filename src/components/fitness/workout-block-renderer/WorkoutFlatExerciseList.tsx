'use client';

import type { WorkoutExercise } from '@/lib/item-metadata';
import type { ResolvedCueBundle } from '@/lib/workout-factory/resolve-exercise-cue-bundle';
import { flatExerciseResolutionKey } from '@/lib/workout-factory/resolve-exercise-cue-bundle';
import {
  exerciseThumbnailSrcFromTask,
  formatExercisePrescriptionLineFromTask,
} from '@/lib/workout-factory/format-exercise-prescription-line';
import type { WorkoutCueEditProps } from '@/components/fitness/workout-block-renderer/workout-block-renderer-types';
import { cn } from '@/lib/utils';
import { WorkoutReadExerciseRow } from '@/components/fitness/workout-block-renderer/WorkoutReadExerciseRow';

export type WorkoutFlatExerciseListProps = {
  exercises: WorkoutExercise[];
  taskId?: string | null;
  density?: 'full' | 'compact';
  emptyMessage?: string;
  className?: string;
  cuesByKey?: Record<string, ResolvedCueBundle>;
  cuesLoading?: boolean;
} & WorkoutCueEditProps;

export function WorkoutFlatExerciseList({
  exercises,
  taskId = null,
  density = 'full',
  emptyMessage = 'No exercises on this card yet.',
  className,
  cuesByKey,
  cuesLoading = false,
  canWriteCue = false,
  onCueSave,
  onCueDraftChange,
  onCueCancel,
  onAskCoachForCues,
  injuriesOnFile = false,
}: WorkoutFlatExerciseListProps) {
  if (exercises.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className={cn('space-y-2', className)}>
      {exercises.map((ex, idx) => {
        const metaLine = formatExercisePrescriptionLineFromTask(ex);
        const notes = ex.coach_notes || ex.notes || null;
        const key = flatExerciseResolutionKey(ex, idx);

        return (
          <li key={ex.id ?? key}>
            <WorkoutReadExerciseRow
              name={ex.name}
              metaLine={metaLine}
              notes={notes}
              thumbnailUrl={exerciseThumbnailSrcFromTask(ex)}
              taskId={taskId}
              density={density}
              resolvedCues={cuesByKey?.[key] ?? null}
              cuePanelEnabled={
                canWriteCue || (!cuesLoading && Object.keys(cuesByKey ?? {}).length > 0)
              }
              resolutionKey={key}
              canWriteCue={canWriteCue}
              onCueSave={onCueSave}
              onCueDraftChange={onCueDraftChange}
              onCueCancel={onCueCancel}
              onAskCoachForCues={onAskCoachForCues}
              injuriesOnFile={injuriesOnFile}
              prescription={
                ex.sets != null || ex.reps != null
                  ? {
                      ...(ex.sets != null ? { sets: ex.sets } : {}),
                      ...(ex.reps != null ? { reps: ex.reps } : {}),
                    }
                  : undefined
              }
              workoutExerciseIndex={idx}
            />
          </li>
        );
      })}
    </ul>
  );
}
