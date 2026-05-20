import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { SessionDeckWorkoutSummary } from './SessionDeckWorkoutSummary';

afterEach(() => {
  cleanup();
});

describe('SessionDeckWorkoutSummary', () => {
  it('renders strip summary with block subtitle for rich tabata metadata', () => {
    const metadata = richMetadataWithBlockFormat('tabata');
    const vm = buildWorkoutSessionViewModel(metadata);
    const main = vm.blocks.find((b) => b.section === 'main')!;

    const { getByTestId } = render(<SessionDeckWorkoutSummary metadata={metadata} mode="strip" />);

    const el = getByTestId('session-deck-workout-strip');
    expect(el.textContent).toBeTruthy();
    if (main.subtitle) {
      expect(el.textContent).toContain(main.subtitle);
    }
  });

  it('renders compact block preview in compact mode', () => {
    const metadata = richMetadataWithBlockFormat('tabata');
    const { getByTestId, getByText } = render(
      <SessionDeckWorkoutSummary metadata={metadata} mode="compact" />,
    );

    expect(getByTestId('session-deck-workout-preview')).toBeTruthy();
    expect(getByText('MAIN')).toBeTruthy();
  });

  it('renders flat strip for legacy exercises', () => {
    const { getByTestId } = render(
      <SessionDeckWorkoutSummary
        metadata={{ exercises: [{ name: 'Squat', sets: 3, reps: 10 }] }}
        mode="strip"
      />,
    );

    expect(getByTestId('session-deck-workout-strip').textContent).toContain('Squat');
  });
});
