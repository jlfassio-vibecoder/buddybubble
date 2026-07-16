import { describe, expect, it } from 'vitest';
import { mapPublicVideoPublications, publicationDisplayTitle } from './public-video-types';

describe('publicationDisplayTitle', () => {
  it('prefers title then offering', () => {
    expect(publicationDisplayTitle('A', 'B')).toBe('A');
    expect(publicationDisplayTitle(null, 'B')).toBe('B');
    expect(publicationDisplayTitle('  ', null)).toBe('Untitled recording');
  });
});

describe('mapPublicVideoPublications', () => {
  it('maps ready public rows', () => {
    const cards = mapPublicVideoPublications([
      {
        id: 'pub-1',
        title: null,
        published_at: '2026-07-01T00:00:00Z',
        class_instances: {
          metadata: {
            class_recording: {
              type: 'class_recording',
              status: 'ready',
              storagePath: 'ws/ci/x.webm',
            },
          },
          class_offerings: { name: 'Spin' },
        },
      },
    ]);
    expect(cards).toEqual([
      {
        publicationId: 'pub-1',
        title: 'Spin',
        publishedAt: '2026-07-01T00:00:00Z',
      },
    ]);
  });

  it('skips not-ready recordings when metadata present', () => {
    const cards = mapPublicVideoPublications([
      {
        id: 'pub-2',
        title: 'Soon',
        published_at: '2026-07-01T00:00:00Z',
        class_instances: {
          metadata: {
            class_recording: {
              type: 'class_recording',
              status: 'uploading',
              storagePath: 'ws/ci/x.webm',
            },
          },
        },
      },
    ]);
    expect(cards).toEqual([]);
  });
});
