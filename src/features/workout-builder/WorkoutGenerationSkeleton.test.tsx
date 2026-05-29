import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { WorkoutGenerationSkeleton } from '@/features/workout-builder/WorkoutGenerationSkeleton';

describe('WorkoutGenerationSkeleton', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders block summaries with shimmering exercise rows', () => {
    render(
      <WorkoutGenerationSkeleton
        blocks={[
          {
            name: 'Main',
            block_format: 'emom',
            format_params: { total_minutes: 15, interval_seconds: 60 },
            exercises: [{ name: 'Swing' }, { name: 'Thruster' }],
          },
        ]}
      />,
    );

    expect(screen.getByText(/Main — EMOM/i)).toBeTruthy();
    expect(screen.getByTestId('workout-generation-skeleton-row-0')).toBeTruthy();
    expect(screen.getByTestId('workout-generation-skeleton-row-1')).toBeTruthy();
  });

  it('falls back to generic rows when outline blocks are empty', () => {
    render(<WorkoutGenerationSkeleton blocks={[]} />);
    expect(screen.getByText('Generating workout…')).toBeTruthy();
    expect(screen.getByTestId('workout-generation-skeleton-row-0')).toBeTruthy();
    expect(screen.getByTestId('workout-generation-skeleton-row-1')).toBeTruthy();
    expect(screen.getByTestId('workout-generation-skeleton-row-2')).toBeTruthy();
  });
});
