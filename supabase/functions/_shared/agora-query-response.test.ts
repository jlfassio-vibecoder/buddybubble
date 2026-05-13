/**
 * Parser checks for Agora `query` JSON variants (covered by Vitest include `supabase/functions/_shared`).
 */
import { describe, expect, it } from 'vitest';
import {
  extractFileNamesFromAgoraQueryResponse,
  pickQueryPlaybackFileName,
} from './agora-query-response.ts';

describe('extractFileNamesFromAgoraQueryResponse', () => {
  it('prefers extensionServiceState fileList filename', () => {
    const body = {
      serverResponse: {
        status: 5,
        extensionServiceState: [
          {
            payload: {
              fileList: [{ filename: 'subdir/playback.m3u8' }, { filename: 'main.mp4' }],
            },
          },
        ],
      },
    };
    const names = extractFileNamesFromAgoraQueryResponse(body);
    expect(names.includes('main.mp4')).toBe(true);
    expect(names.includes('subdir/playback.m3u8')).toBe(true);
  });

  it('handles fileName key and string fileList', () => {
    const body = {
      serverResponse: {
        extensionServiceState: [
          {
            payload: {
              fileList: [{ fileName: 'legacy.mp4' }],
            },
          },
          {
            payload: {
              fileList: 'single.ts',
            },
          },
        ],
      },
    };
    const names = extractFileNamesFromAgoraQueryResponse(body);
    expect(names.includes('legacy.mp4')).toBe(true);
    expect(names.includes('single.ts')).toBe(true);
  });

  it('returns empty when no serverResponse', () => {
    expect(extractFileNamesFromAgoraQueryResponse({})).toEqual([]);
  });
});

describe('pickQueryPlaybackFileName', () => {
  it('prefers mp4 over m3u8', () => {
    expect(pickQueryPlaybackFileName(['a.m3u8', 'b.mp4', 'c.ts'])).toBe('b.mp4');
    expect(pickQueryPlaybackFileName(['x.m3u8'])).toBe('x.m3u8');
  });
});
