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
    const tabataBlock = vm.blocks.find((b) => b.blockFormat === 'tabata');
    expect(tabataBlock).toBeDefined();
    expect(screen.getByTestId(`tabata-interval-shell-${tabataBlock!.id}`)).toBeTruthy();
  });

  it('renders warmup instruction section without tabata shell', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('amrap'));

    const { container } = render(
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

    const list = container.querySelector('[data-testid="workout-player-block-list"]');
    expect(list?.querySelector('[data-testid="instruction-section-warmup"]')).toBeTruthy();
    expect(list?.querySelector('[data-testid^="tabata-interval-shell-"]')).toBeNull();
  });
});
