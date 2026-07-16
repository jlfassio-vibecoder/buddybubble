import { describe, expect, it } from 'vitest';
import { assertPublicPublicationPlayback } from './public-playback';

const readyMeta = {
  class_recording: {
    type: 'class_recording',
    status: 'ready',
    provider: 'browser',
    storagePath: 'ws/ci/studio-capture.webm',
  },
};

const base = {
  unpublished_at: null as string | null,
  access_scope: 'public_storefront',
  workspace_is_public: true,
  class_instance_metadata: readyMeta,
};

describe('assertPublicPublicationPlayback', () => {
  it('returns storagePath when all gates pass', () => {
    expect(assertPublicPublicationPlayback(base)).toEqual({
      kind: 'storagePath',
      storagePath: 'ws/ci/studio-capture.webm',
    });
  });

  it('returns playbackUrl when only legacy URL is present', () => {
    expect(
      assertPublicPublicationPlayback({
        ...base,
        class_instance_metadata: {
          class_recording: {
            type: 'class_recording',
            status: 'ready',
            playbackUrl: 'https://cdn.example.com/v.webm',
          },
        },
      }),
    ).toEqual({ kind: 'playbackUrl', playbackUrl: 'https://cdn.example.com/v.webm' });
  });

  it('rejects unpublished', () => {
    expect(
      assertPublicPublicationPlayback({
        ...base,
        unpublished_at: '2026-07-01T00:00:00Z',
      }),
    ).toBeNull();
  });

  it('rejects non-public scope', () => {
    expect(
      assertPublicPublicationPlayback({
        ...base,
        access_scope: 'workspace',
      }),
    ).toBeNull();
  });

  it('rejects non-public workspace', () => {
    expect(
      assertPublicPublicationPlayback({
        ...base,
        workspace_is_public: false,
      }),
    ).toBeNull();
  });

  it('rejects not-ready recording', () => {
    expect(
      assertPublicPublicationPlayback({
        ...base,
        class_instance_metadata: {
          class_recording: {
            type: 'class_recording',
            status: 'uploading',
            storagePath: 'ws/ci/x.webm',
          },
        },
      }),
    ).toBeNull();
  });
});
