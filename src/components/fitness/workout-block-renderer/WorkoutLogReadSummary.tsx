'use client';

import type { Json, UnitSystem } from '@/types/database';
import { cn } from '@/lib/utils';
import { parseTaskMetadata } from '@/lib/item-metadata';
import { useWorkoutSessionViewModel } from '@/hooks/use-workout-session-view-model';
import { WorkoutBlockListRenderer } from '@/components/fitness/workout-block-renderer/WorkoutBlockListRenderer';
import { WorkoutFlatExerciseLogList } from '@/components/fitness/workout-block-renderer/WorkoutFlatExerciseLogList';

export type WorkoutLogReadSummaryProps = {
  metadata: Json | Record<string, unknown> | null | undefined;
  taskId?: string | null;
  density?: 'full' | 'compact';
  unitSystem?: UnitSystem;
  className?: string;
  emptyMessage?: string;
  'data-testid'?: string;
};

function durationMinFromMetadata(
  metadata: Json | Record<string, unknown> | null | undefined,
): number | null {
  const parsed = parseTaskMetadata(metadata);
  const dm = (parsed as Record<string, unknown>).duration_min;
  if (typeof dm === 'number' && dm > 0) return dm;
  return null;
}

export function WorkoutLogReadSummary({
  metadata,
  taskId = null,
  density = 'full',
  unitSystem = 'metric',
  className,
  emptyMessage = 'No exercises recorded on this log.',
  'data-testid': dataTestId,
}: WorkoutLogReadSummaryProps) {
  const vm = useWorkoutSessionViewModel(metadata as Json);
  const showRich = vm.source === 'rich' && vm.blocks.length > 0;
  const durationMin = durationMinFromMetadata(metadata);
  const testId =
    dataTestId ?? (showRich ? 'workout-log-read-summary-blocks' : 'workout-log-read-summary-flat');

  return (
    <div className={cn('space-y-3', className)} data-testid={showRich ? undefined : testId}>
      {durationMin != null ? (
        <p className="text-xs text-muted-foreground">Completed in {durationMin} min</p>
      ) : null}
      {showRich ? (
        <WorkoutBlockListRenderer
          blocks={vm.blocks}
          density={density}
          taskId={taskId}
          data-testid={testId}
        />
      ) : (
        <WorkoutFlatExerciseLogList
          exercises={vm.flatExercises}
          taskId={taskId}
          density={density}
          unitSystem={unitSystem}
          emptyMessage={emptyMessage}
        />
      )}
    </div>
  );
}
