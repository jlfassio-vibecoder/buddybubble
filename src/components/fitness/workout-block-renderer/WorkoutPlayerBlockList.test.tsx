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
        onLogAmrapRound={() => {}}
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

  it('renders amrap interval shell and warmup section', () => {
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
        onLogAmrapRound={() => {}}
      />,
    );

    const list = container.querySelector('[data-testid="workout-player-block-list"]');
    expect(list?.querySelector('[data-testid="instruction-section-warmup"]')).toBeTruthy();
    expect(list?.querySelector('[data-testid^="tabata-interval-shell-"]')).toBeNull();
    const amrapBlock = vm.blocks.find((b) => b.blockFormat === 'amrap');
    expect(amrapBlock).toBeDefined();
    expect(
      list?.querySelector(`[data-testid="amrap-interval-shell-${amrapBlock!.id}"]`),
    ).toBeTruthy();
  });

  it('renders emom interval shell', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('emom'));

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
        onLogAmrapRound={() => {}}
      />,
    );

    const list = container.querySelector('[data-testid="workout-player-block-list"]');
    expect(list?.querySelector('[data-testid^="tabata-interval-shell-"]')).toBeNull();
    expect(list?.querySelector('[data-testid^="amrap-interval-shell-"]')).toBeNull();
    const emomBlock = vm.blocks.find((b) => b.blockFormat === 'emom');
    expect(emomBlock).toBeDefined();
    expect(
      list?.querySelector(`[data-testid="emom-interval-shell-${emomBlock!.id}"]`),
    ).toBeTruthy();
  });
});
