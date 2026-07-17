import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { VideoLibraryListItem } from '@/lib/video-library/library';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/app/ws',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/app/(dashboard)/app/[workspace_id]/video-library-actions', () => ({
  unpublishFromVideoLibraryAction: vi.fn(),
}));

import { VideoPublicationCard } from './VideoPublicationCard';

const item: VideoLibraryListItem = {
  id: 'pub-1',
  title: 'Ready Workout',
  access_scope: 'workspace',
  published_at: '2026-07-01T12:00:00Z',
  published_by: 'user-a',
  class_instance_id: 'ci-1',
  offeringName: null,
};

afterEach(() => {
  cleanup();
  replaceMock.mockClear();
});

describe('VideoPublicationCard', () => {
  it('shows Unpublish menu trigger only when canManage', () => {
    const { rerender } = render(
      <VideoPublicationCard item={item} canManage workspaceId="ws-1" onUnpublished={vi.fn()} />,
    );
    expect(screen.getByLabelText('Publication actions')).toBeTruthy();

    rerender(
      <VideoPublicationCard
        item={item}
        canManage={false}
        workspaceId="ws-1"
        onUnpublished={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Publication actions')).toBeNull();
  });

  it('offers Edit workout in the manage menu and routes to class_deck_builder', async () => {
    render(
      <VideoPublicationCard item={item} canManage workspaceId="ws-1" onUnpublished={vi.fn()} />,
    );

    fireEvent.click(screen.getByLabelText('Publication actions'));
    const editItem = await screen.findByRole('menuitem', { name: /edit workout/i });
    fireEvent.click(editItem);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/app/ws?class_deck_builder=ci-1', {
        scroll: false,
      });
    });
  });

  it('renders title and Workspace badge', () => {
    render(
      <VideoPublicationCard
        item={item}
        canManage={false}
        workspaceId="ws-1"
        onUnpublished={vi.fn()}
      />,
    );
    expect(screen.getByText('Ready Workout')).toBeTruthy();
    expect(screen.getByText('Workspace')).toBeTruthy();
    expect(screen.getByRole('button', { name: /play/i })).toBeTruthy();
  });
});
