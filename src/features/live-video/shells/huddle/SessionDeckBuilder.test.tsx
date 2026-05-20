import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import type { TaskRow } from '@/types/database';
import { SessionDeckBuilder } from './SessionDeckBuilder';
import type { SessionDeckSnapshot } from './session-deck-snapshot';
import { initialSessionState } from '@/features/live-video/state/sessionStateMachine';

vi.mock('@utils/supabase/client', () => ({
  createClient: () => ({}),
}));

vi.mock('@/features/live-video/hooks/useLiveSessionDeck', () => ({
  useLiveSessionDeck: () => ({ rows: [], loading: false, error: null, refresh: vi.fn() }),
}));

vi.mock('@/features/live-video/theater/live-session-runtime-context', () => ({
  useLiveSessionRuntimeOptional: () => ({
    sessionId: 'session-1',
    isHost: true,
    supabase: {},
    actions: { setActiveDeckItem: vi.fn() },
  }),
}));

vi.mock('@/hooks/use-board-columns', () => ({
  useBoardColumnDefs: () => [],
}));

vi.mock('@/store/workspaceStore', () => ({
  useWorkspaceStore: (
    sel: (s: {
      activeWorkspace: { id: string; category_type: string; calendar_timezone: string };
    }) => unknown,
  ) =>
    sel({
      activeWorkspace: {
        id: 'ws-1',
        category_type: 'fitness',
        calendar_timezone: 'America/Los_Angeles',
      },
    }),
}));

vi.mock('@/components/layout/layout-command-context', () => ({
  useLayoutCommands: () => ({ focusBoard: vi.fn() }),
}));

function deckSnapshot(metadata: Record<string, unknown>, title = 'Tabata'): SessionDeckSnapshot {
  const meta = metadata as TaskRow['metadata'];
  return {
    deckRowKey: 'row-1',
    snapshotId: 'snap-1',
    deckItemId: 'deck-1',
    originTaskId: 'task-1',
    task: { id: 'snap-1', title, metadata: meta, item_type: 'workout' } as TaskRow,
    baselineMetadata: meta,
    dirty: false,
  };
}

const mockDeckCtx = {
  deck: [] as SessionDeckSnapshot[],
  activeSnapshotId: 'snap-1',
  setDeckOrder: vi.fn(),
  setActiveSnapshotId: vi.fn(),
  removeSnapshot: vi.fn(),
  enterSelectionMode: vi.fn(),
  exitSelectionMode: vi.fn(),
  isSelectingFromBoard: false,
};

vi.mock('./workout-deck-selection-context', () => ({
  WorkoutDeckSelectionProvider: ({ children }: { children: React.ReactNode }) => children,
  useWorkoutDeckSelectionOptional: () => mockDeckCtx,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SessionDeckBuilder', () => {
  it('renders deck strip summary under rich tabata tile', () => {
    const metadata = richMetadataWithBlockFormat('tabata');
    const vm = buildWorkoutSessionViewModel(metadata);
    const main = vm.blocks.find((b) => b.section === 'main')!;
    mockDeckCtx.deck = [deckSnapshot(metadata)];

    const { getByTestId } = render(<SessionDeckBuilder state={initialSessionState} />);

    const strip = getByTestId('session-deck-workout-strip');
    expect(strip.textContent).toBeTruthy();
    if (main.subtitle) {
      expect(strip.textContent).toContain(main.subtitle);
    }
  });
});
