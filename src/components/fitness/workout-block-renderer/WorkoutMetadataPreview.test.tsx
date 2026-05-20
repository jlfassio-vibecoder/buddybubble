import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { Json } from '@/types/database';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { WorkoutMetadataPreview } from './WorkoutMetadataPreview';

afterEach(() => {
  cleanup();
});

describe('WorkoutMetadataPreview', () => {
  it('renders block list for rich metadata', () => {
    const { getByTestId, getByText } = render(
      <WorkoutMetadataPreview metadata={richMetadataWithBlockFormat('tabata') as Json} />,
    );

    expect(getByTestId('workout-metadata-preview-blocks')).toBeTruthy();
    expect(getByText('MAIN')).toBeTruthy();
  });

  it('renders flat list when metadata has no factory', () => {
    const { getByTestId, getByText } = render(
      <WorkoutMetadataPreview
        metadata={{
          exercises: [{ name: 'Lunge', sets: 3, reps: 12 }],
        }}
      />,
    );

    expect(getByTestId('workout-metadata-preview-flat')).toBeTruthy();
    expect(getByText('Lunge')).toBeTruthy();
  });
});
