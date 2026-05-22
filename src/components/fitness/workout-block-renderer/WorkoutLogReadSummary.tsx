'use client';

import { useMemo } from 'react';
import type { Json, UnitSystem } from '@/types/database';
import { cn } from '@/lib/utils';
import { parseTaskMetadata } from '@/lib/item-metadata';
import { useWorkoutSessionViewModel } from '@/hooks/use-workout-session-view-model';
import { setLogsByGlobalIndexFromMetadata } from '@/lib/workout-factory/set-logs-by-global-index';
import { WorkoutBlockListRenderer } from '@/components/fitness/workout-block-renderer/WorkoutBlockListRenderer';
import { WorkoutFlatExerciseLogList } from '@/components/fitness/workout-block-renderer/WorkoutFlatExerciseLogList';
import { WorkoutReadExerciseRowFromFactory } from '@/components/fitness/workout-block-renderer/WorkoutReadExerciseRow';

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
  const setLogsByIndex = useMemo(() => setLogsByGlobalIndexFromMetadata(metadata), [metadata]);
  const testId =
    dataTestId ?? (showRich ? 'workout-log-read-summary-blocks' : 'workout-log-read-summary-flat');
  const rowDensity = density === 'compact' ? 'compact' : 'full';

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
          renderExercise={(ctx) => {
            const globalIndex = ctx.globalFlatIndex;
            const setLogs =
              typeof globalIndex === 'number' ? setLogsByIndex.get(globalIndex) : undefined;
            return (
              <WorkoutReadExerciseRowFromFactory
                ex={ctx.exercise}
                taskId={taskId}
                stationLabel={ctx.stationLabel}
                density={rowDensity}
                setLogs={setLogs}
                unitSystem={unitSystem}
              />
            );
          }}
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
