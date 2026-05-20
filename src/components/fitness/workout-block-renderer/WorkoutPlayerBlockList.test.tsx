import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { WorkoutPlayerBlockList } from './WorkoutPlayerBlockList';
import type { SetDraft } from './WorkoutPlayerExercisePanel';

function emptyLogs(count: number): SetDraft[][] {
  return Array.from({ length: count }, () => [{ weight: '', reps: '', rpe: '', done: false }]);
}

describe('WorkoutPlayerBlockList', () => {
  it('renders block subtitle and exercise panels for tabata', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const logs = emptyLogs(vm.flatExercises.length);

    render(
      <WorkoutPlayerBlockList
        viewModel={vm}
        flatExercises={vm.flatExercises}
        logs={logs}
        view="simple"
        unit="kg"
        personalNotesByExerciseIndex={vm.flatExercises.map(() => null)}
        onSetChange={() => {}}
        onToggleDone={() => {}}
        onAddSet={() => {}}
      />,
    );

    const lists = screen.getAllByTestId('workout-player-block-list');
    expect(lists.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Tabata/).length).toBeGreaterThan(0);
    expect(screen.getAllByTestId(/^exercise-panel-/)).toHaveLength(vm.flatExercises.length);
  });

  it('renders warmup instruction section', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('amrap'));

    render(
      <WorkoutPlayerBlockList
        viewModel={vm}
        flatExercises={vm.flatExercises}
        logs={emptyLogs(vm.flatExercises.length)}
        view="simple"
        unit="kg"
        personalNotesByExerciseIndex={vm.flatExercises.map(() => null)}
        onSetChange={() => {}}
        onToggleDone={() => {}}
        onAddSet={() => {}}
      />,
    );

    const list = screen.getAllByTestId('workout-player-block-list')[0];
    expect(list.querySelector('[data-testid="instruction-section-warmup"]')).toBeTruthy();
  });
});
