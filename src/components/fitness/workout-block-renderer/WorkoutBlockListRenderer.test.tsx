import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { BLOCK_FORMAT_ENUM } from '@/lib/agents/coach/block-blueprint-library';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { WorkoutBlockListRenderer } from './WorkoutBlockListRenderer';

afterEach(() => {
  cleanup();
});

describe('WorkoutBlockListRenderer', () => {
  it('returns null when blocks are empty', () => {
    const { container } = render(
      <WorkoutBlockListRenderer blocks={[]} data-testid="read-block-list" />,
    );
    expect(container.firstChild).toBeNull();
  });

  for (const format of BLOCK_FORMAT_ENUM) {
    it(`renders ${format} main block header and subtitle`, () => {
      const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat(format));
      const { getByTestId, getByText } = render(
        <WorkoutBlockListRenderer blocks={vm.blocks} data-testid="read-block-list" />,
      );

      expect(getByTestId('read-block-list')).toBeTruthy();
      expect(getByText('MAIN')).toBeTruthy();

      const main = vm.blocks.find((b) => b.section === 'main');
      if (main?.subtitle) {
        expect(getByText(main.subtitle)).toBeTruthy();
      }
    });
  }

  it('renders warmup instruction section for amrap fixture', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('amrap'));
    const { getByTestId } = render(<WorkoutBlockListRenderer blocks={vm.blocks} />);
    expect(getByTestId('instruction-section-warmup')).toBeTruthy();
  });

  it('renders A1 and A2 for superset fixture', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('superset'));
    const { getByText } = render(<WorkoutBlockListRenderer blocks={vm.blocks} />);
    expect(getByText('A1')).toBeTruthy();
    expect(getByText('A2')).toBeTruthy();
  });

  it('renders A1 and A2 for contrast fixture', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('contrast'));
    const { getByText } = render(<WorkoutBlockListRenderer blocks={vm.blocks} />);
    expect(getByText('A1')).toBeTruthy();
    expect(getByText('A2')).toBeTruthy();
  });

  it('renders A1 through A3 for circuit fixture', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('circuit'));
    const { getByText } = render(<WorkoutBlockListRenderer blocks={vm.blocks} />);
    expect(getByText('A1')).toBeTruthy();
    expect(getByText('A2')).toBeTruthy();
    expect(getByText('A3')).toBeTruthy();
  });

  it('uses renderExercise slot instead of default rows', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const { getByTestId, queryByText } = render(
      <WorkoutBlockListRenderer
        blocks={vm.blocks}
        renderExercise={({ exerciseIndexInBlock }) => (
          <div data-testid={`custom-exercise-${exerciseIndexInBlock}`}>custom</div>
        )}
      />,
    );

    expect(getByTestId('custom-exercise-0')).toBeTruthy();
    expect(queryByText('Goblet Squat')).toBeNull();
  });

  it('renders compact density with smaller exercise row padding', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const { container, getByText } = render(
      <WorkoutBlockListRenderer
        blocks={vm.blocks}
        density="compact"
        data-testid="read-block-list"
      />,
    );

    expect(container.querySelector('.p-2')).toBeTruthy();
    expect(getByText('MAIN')).toBeTruthy();
  });

  it('renders inline density stub for main blocks', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const main = vm.blocks.find((b) => b.section === 'main')!;
    const { getByText, queryByText } = render(
      <WorkoutBlockListRenderer blocks={vm.blocks} density="inline" />,
    );

    expect(getByText(/MAIN/)).toBeTruthy();
    if (main.subtitle) {
      expect(
        getByText(new RegExp(main.subtitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
      ).toBeTruthy();
    }
    expect(queryByText('Goblet Squat')).toBeNull();
  });

  it('renders structure and session narrative chrome without legacy description fields', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('circuit'));
    const { getByText, queryByText } = render(
      <WorkoutBlockListRenderer
        blocks={vm.blocks}
        density="full"
        chrome={{
          structureRationale: 'Main work: 3-round circuit.',
          sessionAdaptations: '45-minute session target. Training phase: Build.',
        }}
      />,
    );

    expect(getByText('Structure')).toBeTruthy();
    expect(getByText('Main work: 3-round circuit.')).toBeTruthy();
    expect(getByText('Session adjustments')).toBeTruthy();
    expect(getByText('45-minute session target. Training phase: Build.')).toBeTruthy();
    expect(queryByText('Coach brief')).toBeNull();
  });
});
