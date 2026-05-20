'use client';

import { Separator } from '@/components/ui/separator';
import { buildPlayerExerciseIndexLookup } from '@/lib/workout-factory/workout-player-exercise-index';
import type { WorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import type { WorkoutExercise } from '@/lib/item-metadata';
import type { UserExerciseNotesRow } from '@/hooks/useUserExerciseNotes';
import { WorkoutBlockHeader } from '@/components/fitness/workout-block-renderer/WorkoutBlockHeader';
import { WorkoutInstructionBlockList } from '@/components/fitness/workout-block-renderer/WorkoutInstructionBlockList';
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

  const globalIndexByBlockExercise = new Map<string, number>();
  for (const entry of indexLookup) {
    globalIndexByBlockExercise.set(
      `${entry.blockId}:${entry.exerciseIndexInBlock}`,
      entry.globalIndex,
    );
  }

  const mainBlocks = blocks.filter((b) => b.section === 'main');

  const mainPanels: Array<{
    block: (typeof mainBlocks)[number];
    ei: number;
    globalIndex: number;
    showSeparator: boolean;
  }> = [];
  let panelIndex = 0;
  for (const block of mainBlocks) {
    const exerciseCount = block.exercises?.length ?? 0;
    for (let ei = 0; ei < exerciseCount; ei++) {
      const globalIndex = globalIndexByBlockExercise.get(`${block.id}:${ei}`);
      if (globalIndex == null) continue;
      mainPanels.push({
        block,
        ei,
        globalIndex,
        showSeparator: panelIndex > 0,
      });
      panelIndex++;
    }
  }

  return (
    <div className="space-y-8" data-testid="workout-player-block-list">
      <WorkoutInstructionBlockList section="warmup" blocks={blocks} />

      {mainBlocks.map((block) => {
        const panels = mainPanels.filter((p) => p.block.id === block.id);
        return (
          <section key={block.id} className="space-y-4" data-testid={`main-block-${block.id}`}>
            <WorkoutBlockHeader name={block.name} subtitle={block.subtitle} />
            <div className="space-y-6">
              {panels.map(({ ei, globalIndex, showSeparator }) => {
                const exercise = flatExercises[globalIndex];
                if (!exercise) return null;
                return (
                  <div key={`${block.id}-ex-${ei}`}>
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
              })}
            </div>
          </section>
        );
      })}

      <WorkoutInstructionBlockList section="finisher" blocks={blocks} />
      <WorkoutInstructionBlockList section="cooldown" blocks={blocks} />
    </div>
  );
}
