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

  it('renders Coach brief label in preview when coachBrief is provided', () => {
    const metadata = richMetadataWithBlockFormat('emom') as Json;
    const sessionVm = buildWorkoutSessionViewModel(metadata);

    render(
      <WorkoutBuilderGeneratedReview
        {...baseProps}
        blocks={sessionVm.blocks}
        coachBrief="Heavy lower body focus"
        coreDirty
      />,
    );

    expect(screen.getByText('Coach brief')).toBeTruthy();
    expect(screen.getByText('Heavy lower body focus')).toBeTruthy();
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

  it('stays in edit when blocks content changes but syncKey is unchanged', () => {
    const metadataA = richMetadataWithBlockFormat('emom') as Json;
    const metadataB = richMetadataWithBlockFormat('tabata') as Json;
    const blocksA = buildWorkoutSessionViewModel(metadataA).blocks;
    const blocksB = buildWorkoutSessionViewModel(metadataB).blocks;

    const { rerender } = render(
      <WorkoutBuilderGeneratedReview {...baseProps} syncKey="stable" blocks={blocksA} coreDirty />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Edit' }));
    expect(screen.getByTestId('workout-builder-block-editor')).toBeTruthy();

    rerender(
      <WorkoutBuilderGeneratedReview {...baseProps} syncKey="stable" blocks={blocksB} coreDirty />,
    );

    expect(screen.getByTestId('workout-builder-block-editor')).toBeTruthy();
    expect(screen.queryByTestId('workout-builder-block-list')).toBeNull();
  });

  it('resets to preview when syncKey changes', () => {
    const metadata = richMetadataWithBlockFormat('emom') as Json;
    const blocks = buildWorkoutSessionViewModel(metadata).blocks;

    const { rerender } = render(
      <WorkoutBuilderGeneratedReview {...baseProps} syncKey="1" blocks={blocks} coreDirty />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Edit' }));
    expect(screen.getByTestId('workout-builder-block-editor')).toBeTruthy();

    rerender(
      <WorkoutBuilderGeneratedReview {...baseProps} syncKey="2" blocks={blocks} coreDirty />,
    );

    expect(screen.getByTestId('workout-builder-block-list')).toBeTruthy();
    expect(screen.queryByTestId('workout-builder-block-editor')).toBeNull();
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
