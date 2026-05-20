'use client';

import type { Json } from '@/types/database';
import { cn } from '@/lib/utils';
import { useWorkoutSessionViewModel } from '@/hooks/use-workout-session-view-model';
import { WorkoutBlockListRenderer } from '@/components/fitness/workout-block-renderer/WorkoutBlockListRenderer';
import { WorkoutFlatExerciseList } from '@/components/fitness/workout-block-renderer/WorkoutFlatExerciseList';

export type WorkoutMetadataPreviewProps = {
  metadata: Json | Record<string, unknown> | null | undefined;
  density?: 'compact' | 'inline';
  taskId?: string | null;
  className?: string;
  emptyMessage?: string;
  maxHeightClass?: string;
  'data-testid'?: string;
};

export function WorkoutMetadataPreview({
  metadata,
  density = 'compact',
  taskId = null,
  className,
  emptyMessage = 'No exercises listed on card.',
  maxHeightClass,
  'data-testid': dataTestId,
}: WorkoutMetadataPreviewProps) {
  const vm = useWorkoutSessionViewModel(metadata as Json);
  const showRich = vm.source === 'rich' && vm.blocks.length > 0;
  const testId =
    dataTestId ?? (showRich ? 'workout-metadata-preview-blocks' : 'workout-metadata-preview-flat');

  return (
    <div className={cn(maxHeightClass, className)} data-testid={showRich ? undefined : testId}>
      {showRich ? (
        <WorkoutBlockListRenderer
          blocks={vm.blocks}
          density={density}
          taskId={taskId}
          data-testid={testId}
        />
      ) : (
        <WorkoutFlatExerciseList
          exercises={vm.flatExercises}
          taskId={taskId}
          density={density === 'inline' ? 'compact' : density}
          emptyMessage={emptyMessage}
        />
      )}
    </div>
  );
}
