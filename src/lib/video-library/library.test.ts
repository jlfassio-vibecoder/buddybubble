import { describe, expect, it } from 'vitest';
import {
  accessScopeBadge,
  filterLibraryItems,
  isVideoLibraryBubble,
  offeringNameFromEmbed,
  publicationDisplayTitle,
  type VideoLibraryListItem,
} from './library';

const baseItem: VideoLibraryListItem = {
  id: 'p1',
  title: 'Morning HIIT',
  access_scope: 'workspace',
  published_at: '2026-07-01T12:00:00Z',
  published_by: 'user-a',
  class_instance_id: 'ci-1',
  offeringName: 'Offering Name',
};

describe('isVideoLibraryBubble', () => {
  it('matches metadata.kind', () => {
    expect(isVideoLibraryBubble({ name: 'Renamed', metadata: { kind: 'video_library' } })).toBe(
      true,
    );
  });

  it('falls back to name', () => {
    expect(isVideoLibraryBubble({ name: 'Video Library', metadata: {} })).toBe(true);
  });

  it('rejects unrelated bubbles', () => {
    expect(isVideoLibraryBubble({ name: 'Classes', metadata: {} })).toBe(false);
  });
});

describe('publicationDisplayTitle', () => {
  it('prefers title', () => {
    expect(publicationDisplayTitle(baseItem)).toBe('Morning HIIT');
  });

  it('falls back to offering name', () => {
    expect(publicationDisplayTitle({ title: null, offeringName: 'Tabata' })).toBe('Tabata');
  });

  it('uses untitled when both missing', () => {
    expect(publicationDisplayTitle({ title: '  ', offeringName: null })).toBe('Untitled recording');
  });
});

describe('accessScopeBadge', () => {
  it('maps scopes', () => {
    expect(accessScopeBadge('public_storefront')).toEqual({ label: 'Public', icon: 'globe' });
    expect(accessScopeBadge('workspace')).toEqual({ label: 'Workspace', icon: 'users' });
    expect(accessScopeBadge('bubble_members')).toEqual({ label: 'Private', icon: 'lock' });
  });
});

describe('filterLibraryItems', () => {
  const items: VideoLibraryListItem[] = [
    baseItem,
    {
      ...baseItem,
      id: 'p2',
      published_by: 'user-b',
      access_scope: 'public_storefront',
    },
  ];

  it('returns all for all filter', () => {
    expect(filterLibraryItems(items, 'all', 'user-a')).toHaveLength(2);
  });

  it('filters mine by published_by', () => {
    expect(filterLibraryItems(items, 'mine', 'user-a').map((i) => i.id)).toEqual(['p1']);
  });

  it('filters public scope', () => {
    expect(filterLibraryItems(items, 'public', 'user-a').map((i) => i.id)).toEqual(['p2']);
  });
});

describe('offeringNameFromEmbed', () => {
  it('reads nested object', () => {
    expect(offeringNameFromEmbed({ class_offerings: { name: 'Spin' } })).toBe('Spin');
  });

  it('reads nested array', () => {
    expect(offeringNameFromEmbed({ class_offerings: [{ name: 'Yoga' }] })).toBe('Yoga');
  });
});
