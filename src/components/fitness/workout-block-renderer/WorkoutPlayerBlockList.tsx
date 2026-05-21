'use client';

import { useCallback, useState } from 'react';
import { Separator } from '@/components/ui/separator';
import { AmrapIntervalShell, TabataIntervalShell } from '@/components/fitness/interval-shells';
import { buildPlayerExerciseIndexLookup } from '@/lib/workout-factory/workout-player-exercise-index';
import { resolveAmrapTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-amrap-timer-config';
import { resolveTabataTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-tabata-timer-config';
import type { IntervalTimerSnapshot } from '@/lib/workout-factory/interval-timer/types';
import type { WorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
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
  onLogAmrapRound: (blockId: string) => void;
};

function renderIntervalShellForBlock(
  block: WorkoutSessionBlockView,
  onTabataSnapshot: (blockId: string, snapshot: IntervalTimerSnapshot | null) => void,
  onLogAmrapRound: (blockId: string) => void,
) {
  if (block.blockFormat === 'tabata' && resolveTabataTimerConfig(block)) {
    return <TabataIntervalShell block={block} onSnapshot={onTabataSnapshot} />;
  }
  if (block.blockFormat === 'amrap' && resolveAmrapTimerConfig(block)) {
    return <AmrapIntervalShell block={block} onLogRound={onLogAmrapRound} />;
  }
  return null;
}

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
  onLogAmrapRound,
}: WorkoutPlayerBlockListProps) {
  const { blocks } = viewModel;
  const indexLookup = buildPlayerExerciseIndexLookup(blocks);
  const globalIndexByBlockExercise = new Map(
    indexLookup.map((e) => [`${e.blockId}:${e.exerciseIndexInBlock}`, e.globalIndex]),
  );

  const [tabataSnapshots, setTabataSnapshots] = useState<
    Record<string, IntervalTimerSnapshot | null>
  >({});

  const handleTabataSnapshot = useCallback(
    (blockId: string, snapshot: IntervalTimerSnapshot | null) => {
      setTabataSnapshots((prev) => {
        const cur = prev[blockId] ?? null;
        if (snapshot === null && cur === null) return prev;
        if (
          snapshot &&
          cur &&
          snapshot.phase === cur.phase &&
          snapshot.roundIndex === cur.roundIndex &&
          snapshot.isPaused === cur.isPaused
        ) {
          return prev;
        }
        return { ...prev, [blockId]: snapshot };
      });
    },
    [],
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
        renderMainBlockAfterHeader={(block) =>
          renderIntervalShellForBlock(block, handleTabataSnapshot, onLogAmrapRound)
        }
        renderExercise={(ctx) => {
          const globalIndex =
            ctx.globalFlatIndex ??
            globalIndexByBlockExercise.get(`${ctx.block.id}:${ctx.exerciseIndexInBlock}`);
          if (globalIndex == null) return null;
          const exercise = flatExercises[globalIndex];
          if (!exercise) return null;
          const showSeparator = globalIndex > 0;
          const tabataSnap = tabataSnapshots[ctx.block.id] ?? null;
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
                activeSetIndex={tabataSnap?.roundIndex ?? null}
                activeSetPhase={tabataSnap?.phase ?? null}
              />
            </div>
          );
        }}
      />
    </div>
  );
}
