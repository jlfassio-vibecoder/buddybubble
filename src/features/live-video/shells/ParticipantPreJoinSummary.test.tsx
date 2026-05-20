import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { useLiveSessionDeck } from '@/features/live-video/hooks/useLiveSessionDeck';
import { ParticipantPreJoinSummary } from './ParticipantPreJoinSummary';

vi.mock('@/features/live-video/hooks/useLiveSessionDeck', () => ({
  useLiveSessionDeck: vi.fn(),
}));

const mockUseLiveSessionDeck = vi.mocked(useLiveSessionDeck);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const supabase = {} as SupabaseClient<Database>;

describe('ParticipantPreJoinSummary', () => {
  it('renders compact block list for rich deck row metadata', () => {
    const metadata = richMetadataWithBlockFormat('tabata');
    mockUseLiveSessionDeck.mockReturnValue({
      rows: [
        {
          id: 'deck-1',
          task_id: 'task-1',
          tasks: { id: 'task-1', title: 'Tabata card', metadata },
        },
      ],
      loading: false,
      error: null,
      refresh: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof useLiveSessionDeck>);

    const { getByTestId, getByText } = render(
      <ParticipantPreJoinSummary
        sessionId="session-1"
        localUserId="user-1"
        displayName="Alex"
        supabase={supabase}
        onJoin={() => {}}
      />,
    );

    expect(getByTestId('workout-metadata-preview-blocks')).toBeTruthy();
    expect(getByText('MAIN')).toBeTruthy();
    expect(getByText('Tabata card')).toBeTruthy();
  });

  it('renders flat preview for legacy exercise metadata', () => {
    mockUseLiveSessionDeck.mockReturnValue({
      rows: [
        {
          id: 'deck-1',
          task_id: 'task-1',
          tasks: {
            id: 'task-1',
            title: 'Legacy card',
            metadata: { exercises: [{ name: 'Push-ups', sets: 3, reps: 10 }] },
          },
        },
      ],
      loading: false,
      error: null,
      refresh: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof useLiveSessionDeck>);

    const { getByTestId, getByText } = render(
      <ParticipantPreJoinSummary
        sessionId="session-1"
        localUserId="user-1"
        displayName="Alex"
        supabase={supabase}
        onJoin={() => {}}
      />,
    );

    expect(getByTestId('workout-metadata-preview-flat')).toBeTruthy();
    expect(getByText('Push-ups')).toBeTruthy();
  });
});
