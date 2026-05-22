'use client';

import { useCallback, useState } from 'react';
import { Separator } from '@/components/ui/separator';
import {
  AmrapIntervalShell,
  EmomIntervalShell,
  TabataIntervalShell,
} from '@/components/fitness/interval-shells';
import { buildPlayerExerciseIndexLookup } from '@/lib/workout-factory/workout-player-exercise-index';
import { resolveAmrapTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-amrap-timer-config';
import { resolveEmomLocalHighlightSetIndex } from '@/lib/workout-factory/interval-timer/resolve-emom-alternating';
import { resolveEmomTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-emom-timer-config';
import { isAlternatingEmomParams } from '@/lib/workout-factory/types/emom-format-params';
import { resolveTabataTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-tabata-timer-config';
import type { IntervalRowSnapshot } from '@/lib/workout-factory/interval-timer/types';
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
  onIntervalSnapshot: (blockId: string, snapshot: IntervalRowSnapshot | null) => void,
  onLogAmrapRound: (blockId: string) => void,
) {
  if (block.blockFormat === 'tabata' && resolveTabataTimerConfig(block)) {
    return <TabataIntervalShell block={block} onSnapshot={onIntervalSnapshot} />;
  }
  if (block.blockFormat === 'amrap' && resolveAmrapTimerConfig(block)) {
    return <AmrapIntervalShell block={block} onLogRound={onLogAmrapRound} />;
  }
  if (block.blockFormat === 'emom' && resolveEmomTimerConfig(block)) {
    return <EmomIntervalShell block={block} onSnapshot={onIntervalSnapshot} />;
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

  const [intervalSnapshots, setIntervalSnapshots] = useState<
    Record<string, IntervalRowSnapshot | null>
  >({});

  const handleIntervalSnapshot = useCallback(
    (blockId: string, snapshot: IntervalRowSnapshot | null) => {
      setIntervalSnapshots((prev) => {
        const cur = prev[blockId] ?? null;
        if (snapshot === null && cur === null) return prev;
        if (
          snapshot &&
          cur &&
          snapshot.roundIndex === cur.roundIndex &&
          snapshot.activeSetPhase === cur.activeSetPhase
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
          renderIntervalShellForBlock(block, handleIntervalSnapshot, onLogAmrapRound)
        }
        renderExercise={(ctx) => {
          const globalIndex =
            ctx.globalFlatIndex ??
            globalIndexByBlockExercise.get(`${ctx.block.id}:${ctx.exerciseIndexInBlock}`);
          if (globalIndex == null) return null;
          const exercise = flatExercises[globalIndex];
          if (!exercise) return null;
          const showSeparator = globalIndex > 0;
          const intervalSnap = intervalSnapshots[ctx.block.id] ?? null;
          const formatParams = ctx.block.formatParams ?? {};
          const isAlternatingEmom =
            ctx.block.blockFormat === 'emom' && isAlternatingEmomParams(formatParams);
          const activeSetIndex =
            intervalSnap && isAlternatingEmom
              ? resolveEmomLocalHighlightSetIndex(
                  ctx.exerciseIndexInBlock,
                  intervalSnap.roundIndex,
                  formatParams,
                )
              : (intervalSnap?.roundIndex ?? null);
          const activeSetPhase =
            intervalSnap && activeSetIndex != null ? intervalSnap.activeSetPhase : null;
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
                activeSetIndex={activeSetIndex}
                activeSetPhase={activeSetPhase}
              />
            </div>
          );
        }}
      />
    </div>
  );
}
