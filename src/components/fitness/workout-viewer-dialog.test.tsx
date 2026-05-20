import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Json } from '@/types/database';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { WorkoutViewerContent } from './workout-viewer-dialog';

function renderViewer(
  meta: Record<string, unknown>,
  opts?: { readVariant?: 'workout' | 'log'; onApply?: ReturnType<typeof vi.fn> },
) {
  const onApply = opts?.onApply ?? vi.fn();
  const exercises = (meta.exercises as { name: string; sets: number; reps: string }[]) ?? [];

  return {
    onApply,
    ...render(
      <WorkoutViewerContent
        workoutSet={null}
        exercises={exercises}
        metadata={meta as Json}
        title="Test workout"
        description=""
        canWrite
        workoutUnitSystem="metric"
        onApply={onApply}
        onRequestClose={() => {}}
        syncKey={1}
        readVariant={opts?.readVariant ?? 'workout'}
      />,
    ),
  };
}

describe('WorkoutViewerContent edit mode', () => {
  afterEach(() => cleanup());

  it('renders WorkoutBlockListEditor for rich tabata in edit mode', () => {
    const meta = richMetadataWithBlockFormat('tabata');
    renderViewer(meta);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByTestId('workout-block-list-editor')).toBeTruthy();
    expect(screen.getByText('MAIN')).toBeTruthy();
    expect(screen.queryByLabelText('Exercise name')).toBeTruthy();
  });

  it('renders flat WorkoutExercisesEditor for flat-only metadata', () => {
    renderViewer({ exercises: [{ name: 'Squat', sets: 3, reps: 10 }] });

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.queryByTestId('workout-block-list-editor')).toBeNull();
    expect(screen.getByPlaceholderText('Exercise name')).toBeTruthy();
  });

  it('uses flat editor when readVariant is log', () => {
    const meta = richMetadataWithBlockFormat('tabata');
    renderViewer(meta, { readVariant: 'log' });

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.queryByTestId('workout-block-list-editor')).toBeNull();
  });

  it('includes blocks in Apply payload for rich edit', () => {
    const meta = richMetadataWithBlockFormat('tabata');
    const onApply = vi.fn();
    renderViewer(meta, { onApply });

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const mainSection = screen.getByTestId(/^editor-main-block-/);
    const nameInput = mainSection.querySelector(
      'input[placeholder="Exercise name"]',
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Burpee Tabata' } });

    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));

    expect(onApply).toHaveBeenCalledTimes(1);
    const payload = onApply.mock.calls[0]![0];
    expect(payload.blocks).toBeDefined();
    expect(payload.blocks!.length).toBeGreaterThan(0);
    const main = payload.blocks!.find((b: { section: string }) => b.section === 'main')!;
    expect(main.exercises[0].exerciseName).toBe('Burpee Tabata');
  });
});
