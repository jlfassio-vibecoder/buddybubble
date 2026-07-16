import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { VideoLibraryListItem } from '@/lib/video-library/library';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
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
