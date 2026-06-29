'use client';

import {
  blockStationLabel,
  blockUsesGroupedLayout,
} from '@/lib/workout-factory/block-station-label';
import { cn } from '@/lib/utils';
import type {
  WorkoutBlockExerciseRenderContext,
  WorkoutBlockListRendererProps,
  WorkoutCueEditProps,
} from '@/components/fitness/workout-block-renderer/workout-block-renderer-types';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import type { ResolvedCueBundle } from '@/lib/workout-factory/resolve-exercise-cue-bundle';
import { exerciseResolutionKey } from '@/lib/workout-factory/resolve-exercise-cue-bundle';
import { WorkoutReadExerciseRowFromFactory } from '@/components/fitness/workout-block-renderer/WorkoutReadExerciseRow';

export type WorkoutBlockExerciseGroupProps = {
  block: WorkoutSessionBlockView;
  taskId?: string | null;
  density?: 'full' | 'compact';
  renderExercise?: WorkoutBlockListRendererProps['renderExercise'];
  globalFlatIndexStart?: number;
  cuesByKey?: Record<string, ResolvedCueBundle>;
  cuesLoading?: boolean;
} & WorkoutCueEditProps;

export function WorkoutBlockExerciseGroup({
  block,
  taskId = null,
  density = 'full',
  renderExercise,
  globalFlatIndexStart = 0,
  cuesByKey,
  cuesLoading = false,
  canWriteCue = false,
  onCueSave,
  onCueDraftChange,
  onCueCancel,
}: WorkoutBlockExerciseGroupProps) {
  const exercises = block.exercises;
  if (exercises.length === 0) return null;

  const grouped = blockUsesGroupedLayout(block.blockFormat, exercises.length);

  const rows = exercises.map((ex, exerciseIndexInBlock) => {
    const stationLabel = blockStationLabel(block.blockFormat, exerciseIndexInBlock);
    const ctx: WorkoutBlockExerciseRenderContext = {
      block,
      exercise: ex,
      exerciseIndexInBlock,
      stationLabel,
      globalFlatIndex: globalFlatIndexStart + exerciseIndexInBlock,
    };

    if (renderExercise) {
      return (
        <div key={ex.id ?? `${block.id}-ex-${exerciseIndexInBlock}`}>{renderExercise(ctx)}</div>
      );
    }

    return (
      <WorkoutReadExerciseRowFromFactory
        key={ex.id ?? `${block.id}-ex-${exerciseIndexInBlock}`}
        ex={ex}
        taskId={taskId}
        stationLabel={stationLabel}
        density={density}
        resolvedCues={cuesByKey?.[exerciseResolutionKey(ex)] ?? null}
        cuePanelEnabled={canWriteCue || (!cuesLoading && Object.keys(cuesByKey ?? {}).length > 0)}
        resolutionKey={exerciseResolutionKey(ex)}
        canWriteCue={canWriteCue}
        onCueSave={onCueSave}
        onCueDraftChange={onCueDraftChange}
        onCueCancel={onCueCancel}
      />
    );
  });

  if (grouped) {
    return <div className="space-y-2 rounded-xl p-2 ring-1 ring-border/20">{rows}</div>;
  }

  return <div className={cn('space-y-2')}>{rows}</div>;
}
