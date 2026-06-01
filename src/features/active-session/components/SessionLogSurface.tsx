'use client';

import { useCallback } from 'react';
import { Separator } from '@/components/ui/separator';
import { WorkoutPlayerBlockList } from '@/components/fitness/workout-block-renderer/WorkoutPlayerBlockList';
import { WorkoutPlayerExercisePanel } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import type { GhostSetSnapshot } from '@/lib/workout-factory/ghost-set-snapshot';
import type { WorkoutSessionViewModel } from '@/hooks/use-workout-session-view-model';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import type { IntervalRowSnapshot } from '@/lib/workout-factory/interval-timer/types';
import type { IntervalShellMachineControl } from '@/components/fitness/interval-shells/interval-shell-control';
import { buildPlayerExerciseIndexLookup } from '@/lib/workout-factory/workout-player-exercise-index';
import { appendAmrapRoundRows } from '@/lib/workout-factory/interval-timer/append-amrap-round-rows';
import {
  appendSetRow,
  applySetChange,
  removeSetRow,
  toggleSetDone,
} from '@/lib/workout-factory/workout-log-mutations';

type Props = {
  viewModel: WorkoutSessionViewModel;
  draftLogs: SetDraft[][];
  ghostLogs: GhostSetSnapshot[][];
  unit: string;
  disabled?: boolean;
  onDraftLogsChange: (next: SetDraft[][]) => void;
  useIntervalMachine?: boolean;
  intervalRowSnapshots?: Record<string, IntervalRowSnapshot | null>;
  onIntervalStart?: (block: WorkoutSessionBlockView) => void;
  intervalMachineControlByBlockId?: Record<string, IntervalShellMachineControl | undefined>;
};

export function SessionLogSurface({
  viewModel,
  draftLogs,
  ghostLogs,
  unit,
  disabled = false,
  onDraftLogsChange,
  useIntervalMachine = false,
  intervalRowSnapshots,
  onIntervalStart,
  intervalMachineControlByBlockId,
}: Props) {
  const { flatExercises, blocks } = viewModel;
  const useBlockList = blocks.length > 0;

  const onSetChange = useCallback(
    (exIdx: number, setIdx: number, field: 'weight' | 'reps' | 'rpe', value: string) => {
      if (disabled) return;
      onDraftLogsChange(applySetChange(draftLogs, exIdx, setIdx, field, value));
    },
    [disabled, draftLogs, onDraftLogsChange],
  );

  const onToggleDone = useCallback(
    (exIdx: number, setIdx: number) => {
      if (disabled) return;
      onDraftLogsChange(toggleSetDone(draftLogs, exIdx, setIdx));
    },
    [disabled, draftLogs, onDraftLogsChange],
  );

  const onAddSet = useCallback(
    (exIdx: number) => {
      if (disabled) return;
      const exercise = flatExercises[exIdx];
      if (!exercise) return;
      onDraftLogsChange(appendSetRow(draftLogs, exIdx, exercise));
    },
    [disabled, draftLogs, flatExercises, onDraftLogsChange],
  );

  const onRemoveSet = useCallback(
    (exIdx: number) => {
      if (disabled) return;
      onDraftLogsChange(removeSetRow(draftLogs, exIdx));
    },
    [disabled, draftLogs, onDraftLogsChange],
  );

  const onLogAmrapRound = useCallback(
    (blockId: string) => {
      if (disabled) return;
      const indices = buildPlayerExerciseIndexLookup(blocks)
        .filter((entry) => entry.blockId === blockId)
        .map((entry) => entry.globalIndex);
      onDraftLogsChange(appendAmrapRoundRows(draftLogs, indices, flatExercises));
    },
    [disabled, blocks, draftLogs, flatExercises, onDraftLogsChange],
  );

  return (
    <section
      className="min-h-0 overflow-auto rounded-lg border border-border bg-card p-4"
      aria-label="Workout log"
    >
      {flatExercises.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No exercises defined for this workout.
        </p>
      ) : useBlockList ? (
        <WorkoutPlayerBlockList
          viewModel={viewModel}
          flatExercises={flatExercises}
          logs={draftLogs}
          ghostLogs={ghostLogs}
          view="simple"
          unit={unit}
          personalNotesByExerciseIndex={flatExercises.map(() => null)}
          readOnly={disabled}
          onSetChange={onSetChange}
          onToggleDone={onToggleDone}
          onAddSet={onAddSet}
          onRemoveSet={onRemoveSet}
          onLogAmrapRound={onLogAmrapRound}
          useIntervalMachine={useIntervalMachine}
          intervalRowSnapshots={intervalRowSnapshots}
          onIntervalStart={onIntervalStart}
          intervalMachineControlByBlockId={intervalMachineControlByBlockId}
        />
      ) : (
        <div className="space-y-6">
          {flatExercises.map((exercise, index) => (
            <div key={`${exercise.name}-${index}`}>
              <WorkoutPlayerExercisePanel
                exercise={exercise}
                index={index}
                sets={draftLogs[index] ?? []}
                ghostSets={ghostLogs[index]}
                view="simple"
                unit={unit}
                personalNotes={null}
                readOnly={disabled}
                onSetChange={(setIdx, field, value) => onSetChange(index, setIdx, field, value)}
                onToggleDone={(setIdx) => onToggleDone(index, setIdx)}
                onAddSet={() => onAddSet(index)}
                onRemoveSet={() => onRemoveSet(index)}
              />
              {index < flatExercises.length - 1 ? <Separator className="mt-6" /> : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
