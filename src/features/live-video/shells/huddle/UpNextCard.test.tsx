import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { TaskRow } from '@/types/database';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { UpNextCard } from './UpNextCard';
import { useWorkoutDeckSelectionOptional } from './workout-deck-selection-context';
import type { SessionDeckSnapshot } from './session-deck-snapshot';

vi.mock('./workout-deck-selection-context', () => ({
  useWorkoutDeckSelectionOptional: vi.fn(),
}));

const mockDeckCtx = vi.mocked(useWorkoutDeckSelectionOptional);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function snapshot(metadata: Record<string, unknown>, title = 'Workout'): SessionDeckSnapshot {
  const meta = metadata as TaskRow['metadata'];
  return {
    deckRowKey: 'row-1',
    snapshotId: 'snap-1',
    deckItemId: null,
    originTaskId: 'task-1',
    task: { id: 'snap-1', title, metadata: meta } as TaskRow,
    baselineMetadata: meta,
    dirty: false,
  };
}

describe('UpNextCard', () => {
  it('shows block subtitle in summary for rich tabata metadata', () => {
    const metadata = richMetadataWithBlockFormat('tabata');
    const vm = buildWorkoutSessionViewModel(metadata);
    const main = vm.blocks.find((b) => b.section === 'main')!;

    mockDeckCtx.mockReturnValue({
      deck: [snapshot(metadata, 'Tabata session')],
      activeSnapshotId: 'snap-1',
    } as ReturnType<typeof useWorkoutDeckSelectionOptional>);

    const { getByText } = render(<UpNextCard />);
    if (main.subtitle) {
      expect(
        getByText(new RegExp(main.subtitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
      ).toBeTruthy();
    }
    expect(getByText(/MAIN/)).toBeTruthy();
  });

  it('keeps flat exercise summary for legacy metadata', () => {
    const metadata = {
      exercises: [{ name: 'Squat', sets: 3, reps: 10 }],
    };
    mockDeckCtx.mockReturnValue({
      deck: [snapshot(metadata)],
      activeSnapshotId: 'snap-1',
    } as ReturnType<typeof useWorkoutDeckSelectionOptional>);

    const { getByText } = render(<UpNextCard />);
    expect(getByText(/10 Squat/)).toBeTruthy();
  });
});
