import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

vi.mock('@utils/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              order: () =>
                Promise.resolve({
                  data: [],
                  error: null,
                }),
            }),
          }),
        }),
      }),
    }),
    channel: () => ({
      on: function on() {
        return this;
      },
      subscribe: () => ({ unsubscribe: vi.fn() }),
    }),
    removeChannel: vi.fn(),
  }),
}));

vi.mock('@/components/fitness/VideoPublicationCard', () => ({
  VideoPublicationCard: () => null,
}));

import { VideoLibraryBoard } from './VideoLibraryBoard';

afterEach(() => {
  cleanup();
});

describe('VideoLibraryBoard empty states', () => {
  it('shows coach empty copy when canManage', async () => {
    render(<VideoLibraryBoard workspaceId="ws-1" bubbleId="bub-1" canManage />);
    await waitFor(() => {
      expect(
        screen.getByText(/Record a session in the Solo Studio or publish a class recording/i),
      ).toBeTruthy();
    });
    expect(screen.getByLabelText('Filter publications')).toBeTruthy();
  });

  it('shows member empty copy when not canManage', async () => {
    render(<VideoLibraryBoard workspaceId="ws-1" bubbleId="bub-1" canManage={false} />);
    await waitFor(() => {
      expect(screen.getByText(/No videos have been published here yet/i)).toBeTruthy();
    });
    expect(screen.queryByLabelText('Filter publications')).toBeNull();
  });
});
