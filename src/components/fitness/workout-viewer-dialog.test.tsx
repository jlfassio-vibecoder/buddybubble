import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Json } from '@/types/database';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { WorkoutViewerContent } from './workout-viewer-dialog';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function renderViewer(
  meta: Record<string, unknown>,
  opts?: {
    readVariant?: 'workout' | 'log';
    onApply?: ReturnType<typeof vi.fn>;
    onRequestClose?: ReturnType<typeof vi.fn>;
  },
) {
  const onApply = opts?.onApply ?? vi.fn();
  const onRequestClose = opts?.onRequestClose ?? vi.fn();
  const exercises = (meta.exercises as { name: string; sets: number; reps: string }[]) ?? [];

  return {
    onApply,
    onRequestClose,
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
        onRequestClose={onRequestClose}
        syncKey={1}
        readVariant={opts?.readVariant ?? 'workout'}
      />,
    ),
  };
}

const baseViewProps = {
  workoutSet: null,
  exercises: [] as { name: string; sets: number; reps: string }[],
  title: 'Test workout',
  description: '',
  canWrite: false,
  workoutUnitSystem: 'metric' as const,
  onApply: () => {},
  onRequestClose: () => {},
  syncKey: 0,
};

describe('WorkoutViewerContent view mode', () => {
  afterEach(() => cleanup());

  it('renders rich block list from metadata', () => {
    const metadata = richMetadataWithBlockFormat('tabata') as Json;
    render(<WorkoutViewerContent {...baseViewProps} metadata={metadata} syncKey={1} />);

    expect(screen.getByTestId('workout-viewer-block-list')).toBeTruthy();
    expect(screen.getByText('MAIN')).toBeTruthy();
  });

  it('readVariant log uses WorkoutLogReadSummary with set_logs not bare block list', () => {
    const base = richMetadataWithBlockFormat('tabata');
    const meta = {
      ...base,
      exercises: [
        {
          name: 'Goblet Squat',
          sets: 1,
          reps: '10',
          set_logs: [{ set: 1, reps: 12, done: true }],
        },
      ],
    };
    renderViewer(meta, { readVariant: 'log' });

    expect(screen.getByTestId('workout-viewer-log-read')).toBeTruthy();
    expect(screen.queryByTestId('workout-viewer-block-list')).toBeNull();
    expect(screen.getByText('Set 1 · 12 reps')).toBeTruthy();
  });

  it('readVariant workout still uses block list for rich prescription', () => {
    const metadata = richMetadataWithBlockFormat('tabata') as Json;
    render(
      <WorkoutViewerContent
        {...baseViewProps}
        metadata={metadata}
        syncKey={1}
        readVariant="workout"
      />,
    );

    expect(screen.getByTestId('workout-viewer-block-list')).toBeTruthy();
    expect(screen.queryByTestId('workout-viewer-log-read')).toBeNull();
  });

  it('renders flat exercise list when metadata has no factory', () => {
    render(
      <WorkoutViewerContent
        {...baseViewProps}
        metadata={{} as Json}
        exercises={[{ name: 'Squat', sets: 3, reps: 10 }]}
        syncKey={1}
      />,
    );

    expect(screen.getByText(/No AI workout structure saved/)).toBeTruthy();
    expect(screen.getByText('Squat')).toBeTruthy();
  });
});

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

  it('Apply returns to view mode without closing the pane', () => {
    const meta = richMetadataWithBlockFormat('tabata');
    const onApply = vi.fn();
    const onRequestClose = vi.fn();
    renderViewer(meta, { onApply, onRequestClose });

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const mainSection = screen.getByTestId(/^editor-main-block-/);
    const nameInput = mainSection.querySelector(
      'input[placeholder="Exercise name"]',
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Burpee Tabata' } });

    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onRequestClose).not.toHaveBeenCalled();
    expect(screen.queryByTestId('workout-block-list-editor')).toBeNull();
    expect(screen.getByTestId('workout-viewer-block-list')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('Cancel discards edits and returns to view mode without closing', () => {
    const meta = richMetadataWithBlockFormat('tabata');
    const onRequestClose = vi.fn();
    renderViewer(meta, { onRequestClose });

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Changed title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onRequestClose).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Title')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Test workout' })).toBeTruthy();
  });

  it('header X closes the pane', () => {
    const meta = richMetadataWithBlockFormat('tabata');
    const onRequestClose = vi.fn();
    renderViewer(meta, { onRequestClose });

    fireEvent.click(screen.getByLabelText('Close workout viewer'));

    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });
});

describe('WorkoutViewerContent active session launch', () => {
  afterEach(() => cleanup());

  it('shows Launch Active Session in header when activeSessionLaunch is launch mode', () => {
    const metadata = richMetadataWithBlockFormat('tabata') as Json;
    render(
      <WorkoutViewerContent
        {...baseViewProps}
        metadata={metadata}
        canWrite
        taskId="task-123"
        activeSessionLaunch={{
          launchUi: { mode: 'launch', label: 'Launch Active Session (Beta)' },
          onLaunchClick: vi.fn(),
          busy: false,
        }}
        syncKey={1}
      />,
    );
    expect(screen.getByRole('button', { name: /Launch Active Session/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View' })).toBeTruthy();
  });

  it('shows disabled Save & Start when activeSessionLaunch is dirty', () => {
    const metadata = richMetadataWithBlockFormat('tabata') as Json;
    render(
      <WorkoutViewerContent
        {...baseViewProps}
        metadata={metadata}
        canWrite
        taskId="task-123"
        activeSessionLaunch={{
          launchUi: {
            mode: 'disabled',
            label: 'Save & Start',
            tooltip: 'Save changes to start session.',
          },
          onLaunchClick: vi.fn(),
          busy: false,
        }}
        syncKey={1}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Save & Start' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('hides launch control when activeSessionLaunch is null', () => {
    const metadata = richMetadataWithBlockFormat('tabata') as Json;
    render(
      <WorkoutViewerContent
        {...baseViewProps}
        metadata={metadata}
        taskId="task-123"
        activeSessionLaunch={null}
        syncKey={1}
      />,
    );
    expect(screen.queryByRole('button', { name: /Launch Active Session/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Save & Start/i })).toBeNull();
  });
});
