import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { Json } from '@/types/database';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { WorkoutViewerContent } from './workout-viewer-dialog';

afterEach(() => {
  cleanup();
});

const baseProps = {
  workoutSet: null,
  exercises: [],
  title: 'Test workout',
  description: '',
  canWrite: false,
  workoutUnitSystem: 'metric' as const,
  onApply: () => {},
  onRequestClose: () => {},
  syncKey: 0,
};

describe('WorkoutViewerContent', () => {
  it('renders rich block list from metadata', () => {
    const metadata = richMetadataWithBlockFormat('tabata') as Json;
    const { getByTestId, getByText } = render(
      <WorkoutViewerContent {...baseProps} metadata={metadata} syncKey={1} />,
    );

    expect(getByTestId('workout-viewer-block-list')).toBeTruthy();
    expect(getByText('MAIN')).toBeTruthy();
  });

  it('renders flat exercise list when metadata has no factory', () => {
    const { getByText } = render(
      <WorkoutViewerContent
        {...baseProps}
        metadata={{}}
        exercises={[{ name: 'Squat', sets: 3, reps: 10 }]}
        syncKey={1}
      />,
    );

    expect(getByText(/No AI workout structure saved/)).toBeTruthy();
    expect(getByText('Squat')).toBeTruthy();
  });

  it('renders log read summary with set_logs when readVariant is log', () => {
    const { getByTestId, getByText, queryByText } = render(
      <WorkoutViewerContent
        {...baseProps}
        metadata={{ duration_min: 30 }}
        exercises={[
          {
            name: 'Deadlift',
            set_logs: [{ set: 1, weight: 140, reps: 5, done: true }],
          },
        ]}
        readVariant="log"
        syncKey={1}
      />,
    );

    expect(getByTestId('workout-viewer-log-read')).toBeTruthy();
    expect(getByText('Deadlift')).toBeTruthy();
    expect(getByText('Set 1 · 140 kg · 5 reps')).toBeTruthy();
    expect(queryByText(/No AI workout structure saved/)).toBeNull();
  });
});
