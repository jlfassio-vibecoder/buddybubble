'use client';

import { Separator } from '@/components/ui/separator';
import { buildPlayerExerciseIndexLookup } from '@/lib/workout-factory/workout-player-exercise-index';
import type { WorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import type { WorkoutExercise } from '@/lib/item-metadata';
import type { UserExerciseNotesRow } from '@/hooks/useUserExerciseNotes';
import { WorkoutBlockListRenderer } from '@/components/fitness/workout-block-renderer/WorkoutBlockListRenderer';
import {
  WorkoutPlayerExercisePanel,
  type SetDraft,
} from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';

export type WorkoutPlayerBlockListProps = {
  viewModel: WorkoutSessionViewModel;
  flatExercises: WorkoutExercise[];
  logs: SetDraft[][];
  view: 'simple' | 'detailed';
  unit: string;
  personalNotesByExerciseIndex: (UserExerciseNotesRow | null)[];
  onSetChange: (
    exIdx: number,
    setIdx: number,
    field: 'weight' | 'reps' | 'rpe',
    value: string,
  ) => void;
  onToggleDone: (exIdx: number, setIdx: number) => void;
  onAddSet: (exIdx: number) => void;
};

export function WorkoutPlayerBlockList({
  viewModel,
  flatExercises,
  logs,
  view,
  unit,
  personalNotesByExerciseIndex,
  onSetChange,
  onToggleDone,
  onAddSet,
}: WorkoutPlayerBlockListProps) {
  const { blocks } = viewModel;
  const indexLookup = buildPlayerExerciseIndexLookup(blocks);
  const globalIndexByBlockExercise = new Map(
    indexLookup.map((e) => [`${e.blockId}:${e.exerciseIndexInBlock}`, e.globalIndex]),
  );

  return (
    <div className="space-y-8" data-testid="workout-player-block-list">
      <WorkoutBlockListRenderer
        blocks={blocks}
        density="full"
        className="space-y-8"
        getMainBlockSectionProps={(block) => ({
          'data-testid': `main-block-${block.id}`,
          className: 'space-y-4',
        })}
        renderExercise={(ctx) => {
          const globalIndex =
            ctx.globalFlatIndex ??
            globalIndexByBlockExercise.get(`${ctx.block.id}:${ctx.exerciseIndexInBlock}`);
          if (globalIndex == null) return null;
          const exercise = flatExercises[globalIndex];
          if (!exercise) return null;
          const showSeparator = globalIndex > 0;
          return (
            <div key={`${ctx.block.id}-ex-${ctx.exerciseIndexInBlock}`}>
              {showSeparator ? <Separator className="mb-6" /> : null}
              <WorkoutPlayerExercisePanel
                exercise={exercise}
                index={globalIndex}
                sets={logs[globalIndex] ?? []}
                view={view}
                unit={unit}
                personalNotes={personalNotesByExerciseIndex[globalIndex] ?? null}
                onSetChange={(si, f, v) => onSetChange(globalIndex, si, f, v)}
                onToggleDone={(si) => onToggleDone(globalIndex, si)}
                onAddSet={() => onAddSet(globalIndex)}
              />
            </div>
          );
        }}
      />
    </div>
  );
}
