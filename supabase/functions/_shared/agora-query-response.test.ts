/**
 * Parser checks for Agora `query` JSON variants (run: `deno test supabase/functions/_shared/agora-query-response.test.ts`).
 */
import { assertEquals } from 'jsr:@std/assert@1';
import {
  extractFileNamesFromAgoraQueryResponse,
  pickQueryPlaybackFileName,
} from './agora-query-response.ts';

Deno.test('extractFileNames prefers extensionServiceState fileList filename', () => {
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
  assertEquals(names.includes('main.mp4'), true);
  assertEquals(names.includes('subdir/playback.m3u8'), true);
});

Deno.test('pickQueryPlaybackFileName prefers mp4 over m3u8', () => {
  assertEquals(pickQueryPlaybackFileName(['a.m3u8', 'b.mp4', 'c.ts']), 'b.mp4');
  assertEquals(pickQueryPlaybackFileName(['x.m3u8']), 'x.m3u8');
});

Deno.test('extractFileNames handles fileName key and string fileList', () => {
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
  assertEquals(names.includes('legacy.mp4'), true);
  assertEquals(names.includes('single.ts'), true);
});

Deno.test('extractFileNames empty when no serverResponse', () => {
  assertEquals(extractFileNamesFromAgoraQueryResponse({}), []);
});
