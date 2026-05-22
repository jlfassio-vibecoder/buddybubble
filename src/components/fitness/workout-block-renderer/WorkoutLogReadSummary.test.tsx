import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { Json } from '@/types/database';
import {
  richAlternatingEmomMetadata,
  richMetadataWithBlockFormat,
} from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
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

  it('renders rich block headers and set_logs overlay', () => {
    const base = richMetadataWithBlockFormat('tabata');
    const metadata = {
      ...base,
      exercises: [
        {
          name: 'Goblet Squat',
          sets: 2,
          set_logs: [
            { set: 1, weight: 53, reps: 10, rpe: 8, done: true },
            { set: 2, weight: 53, reps: 9, done: true },
          ],
        },
      ],
    };

    const { getByTestId, getByText } = render(
      <WorkoutLogReadSummary metadata={metadata as Json} />,
    );

    expect(getByTestId('workout-log-read-summary-blocks')).toBeTruthy();
    expect(getByText('MAIN')).toBeTruthy();
    expect(getByText('Set 1 · 53 kg · 10 reps · RPE 8')).toBeTruthy();
    expect(getByText('Set 2 · 53 kg · 9 reps')).toBeTruthy();
  });

  it('renders rich blocks without set lines when no set_logs', () => {
    const { getByTestId, getByText, queryByText } = render(
      <WorkoutLogReadSummary metadata={richMetadataWithBlockFormat('tabata') as Json} />,
    );

    expect(getByTestId('workout-log-read-summary-blocks')).toBeTruthy();
    expect(getByText('MAIN')).toBeTruthy();
    expect(queryByText(/^Set 1 ·/)).toBeNull();
  });

  it('renders AMRAP block header with many set_logs lines', () => {
    const base = richMetadataWithBlockFormat('amrap');
    const set_logs = Array.from({ length: 12 }, (_, i) => ({
      set: i + 1,
      reps: 10,
      done: true as const,
    }));
    const metadata = {
      ...base,
      exercises: [{ name: 'Goblet Squat', sets: 12, set_logs }],
    };

    const { getByTestId, getByText } = render(
      <WorkoutLogReadSummary metadata={metadata as Json} />,
    );

    expect(getByTestId('workout-log-read-summary-blocks')).toBeTruthy();
    expect(getByText('MAIN')).toBeTruthy();
    expect(getByText('Set 1 · 10 reps')).toBeTruthy();
    expect(getByText('Set 12 · 10 reps')).toBeTruthy();
  });

  it('renders empty message when no exercises', () => {
    const { getByText } = render(<WorkoutLogReadSummary metadata={{ exercises: [] }} />);

    expect(getByText('No exercises recorded on this log.')).toBeTruthy();
  });

  it('renders alternating EMOM taxonomy in block subtitle', () => {
    const metadata = richAlternatingEmomMetadata({
      totalRounds: 12,
      cycle: [[0], [1, 2]],
    });

    const { getByTestId, getByText } = render(
      <WorkoutLogReadSummary metadata={metadata as Json} />,
    );

    expect(getByTestId('workout-log-read-summary-blocks')).toBeTruthy();
    expect(getByText(/Alternating EMOM/)).toBeTruthy();
    expect(getByText(/A \/ B\+C/)).toBeTruthy();
  });
});
