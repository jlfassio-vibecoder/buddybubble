'use client';

import { Separator } from '@/components/ui/separator';
import { WorkoutPlayerBlockList } from '@/components/fitness/workout-block-renderer/WorkoutPlayerBlockList';
import { WorkoutPlayerExercisePanel } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import type { WorkoutSessionViewModel } from '@/hooks/use-workout-session-view-model';

type Props = {
  viewModel: WorkoutSessionViewModel;
  draftLogs: SetDraft[][];
  unit: string;
};

export function SessionLogSurface({ viewModel, draftLogs, unit }: Props) {
  const { flatExercises, blocks } = viewModel;
  const useBlockList = blocks.length > 0;

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
          view="simple"
          unit={unit}
          personalNotesByExerciseIndex={flatExercises.map(() => null)}
          readOnly
          onSetChange={() => {}}
          onToggleDone={() => {}}
          onAddSet={() => {}}
          onLogAmrapRound={() => {}}
        />
      ) : (
        <div className="space-y-6">
          {flatExercises.map((exercise, index) => (
            <div key={`${exercise.name}-${index}`}>
              <WorkoutPlayerExercisePanel
                exercise={exercise}
                index={index}
                sets={draftLogs[index] ?? []}
                view="simple"
                unit={unit}
                personalNotes={null}
                readOnly
                onSetChange={() => {}}
                onToggleDone={() => {}}
                onAddSet={() => {}}
              />
              {index < flatExercises.length - 1 ? <Separator className="mt-6" /> : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
