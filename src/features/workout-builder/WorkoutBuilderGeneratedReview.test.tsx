import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Json } from '@/types/database';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { WorkoutBuilderGeneratedReview } from '@/features/workout-builder/WorkoutBuilderGeneratedReview';

const baseProps = {
  taskId: 'task-1',
  title: 'EMOM workout',
  description: 'Test',
  canWrite: true,
  workoutUnitSystem: 'metric' as const,
  syncKey: '1',
  chrome: { cardTitle: 'EMOM workout' },
  onApplyEdits: vi.fn(),
  onSaveAndReturn: vi.fn(),
  onReturn: vi.fn(),
  saving: false,
};

describe('WorkoutBuilderGeneratedReview', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders preview block list and switches to editor', () => {
    const metadata = richMetadataWithBlockFormat('emom') as Json;
    const sessionVm = buildWorkoutSessionViewModel(metadata);

    render(<WorkoutBuilderGeneratedReview {...baseProps} blocks={sessionVm.blocks} coreDirty />);

    expect(screen.getByTestId('workout-builder-block-list')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Edit' }));
    expect(screen.getByTestId('workout-builder-block-editor')).toBeTruthy();
  });

  it('calls onApplyEdits when Apply changes is clicked', () => {
    const metadata = richMetadataWithBlockFormat('emom') as Json;
    const sessionVm = buildWorkoutSessionViewModel(metadata);
    const onApplyEdits = vi.fn();

    render(
      <WorkoutBuilderGeneratedReview
        {...baseProps}
        blocks={sessionVm.blocks}
        onApplyEdits={onApplyEdits}
        coreDirty
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    expect(onApplyEdits).toHaveBeenCalledTimes(1);
    expect(onApplyEdits.mock.calls[0][0].blocks?.length).toBeGreaterThan(0);
  });

  it('calls onSaveAndReturn when dirty', () => {
    const metadata = richMetadataWithBlockFormat('emom') as Json;
    const sessionVm = buildWorkoutSessionViewModel(metadata);
    const onSaveAndReturn = vi.fn();
    const onReturn = vi.fn();

    render(
      <WorkoutBuilderGeneratedReview
        {...baseProps}
        blocks={sessionVm.blocks}
        onSaveAndReturn={onSaveAndReturn}
        onReturn={onReturn}
        coreDirty
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save & Return to Board' }));
    expect(onSaveAndReturn).toHaveBeenCalledTimes(1);
    expect(onReturn).not.toHaveBeenCalled();
  });

  it('calls onReturn without save when clean', () => {
    const metadata = richMetadataWithBlockFormat('emom') as Json;
    const sessionVm = buildWorkoutSessionViewModel(metadata);
    const onSaveAndReturn = vi.fn();
    const onReturn = vi.fn();

    render(
      <WorkoutBuilderGeneratedReview
        {...baseProps}
        blocks={sessionVm.blocks}
        onSaveAndReturn={onSaveAndReturn}
        onReturn={onReturn}
        coreDirty={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Return to Board' }));
    expect(onReturn).toHaveBeenCalledTimes(1);
    expect(onSaveAndReturn).not.toHaveBeenCalled();
  });
});
