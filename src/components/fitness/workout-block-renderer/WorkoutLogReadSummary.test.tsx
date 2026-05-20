import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { Json } from '@/types/database';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { WorkoutLogReadSummary } from './WorkoutLogReadSummary';

afterEach(() => {
  cleanup();
});

describe('WorkoutLogReadSummary', () => {
  it('renders flat log exercises with set_logs', () => {
    const { getByTestId, getByText } = render(
      <WorkoutLogReadSummary
        metadata={{
          duration_min: 42,
          exercises: [
            {
              name: 'Bench Press',
              sets: 2,
              set_logs: [
                { set: 1, weight: 100, reps: 8, rpe: 8, done: true },
                { set: 2, weight: 100, reps: 6, done: true },
              ],
            },
          ],
        }}
      />,
    );

    expect(getByTestId('workout-log-read-summary-flat')).toBeTruthy();
    expect(getByText('Completed in 42 min')).toBeTruthy();
    expect(getByText('Bench Press')).toBeTruthy();
    expect(getByText('Set 1 · 100 kg · 8 reps · RPE 8')).toBeTruthy();
    expect(getByText('Set 2 · 100 kg · 6 reps')).toBeTruthy();
  });

  it('renders block list for rich metadata (future logs with factory)', () => {
    const { getByTestId, getByText } = render(
      <WorkoutLogReadSummary metadata={richMetadataWithBlockFormat('tabata') as Json} />,
    );

    expect(getByTestId('workout-log-read-summary-blocks')).toBeTruthy();
    expect(getByText('MAIN')).toBeTruthy();
  });

  it('renders empty message when no exercises', () => {
    const { getByText } = render(<WorkoutLogReadSummary metadata={{ exercises: [] }} />);

    expect(getByText('No exercises recorded on this log.')).toBeTruthy();
  });
});
