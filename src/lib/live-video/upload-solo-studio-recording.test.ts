import { describe, expect, it } from 'vitest';
import {
  SOLO_STUDIO_CAPTURE_FILENAME,
  uploadSoloStudioRecording,
} from '@/lib/live-video/upload-solo-studio-recording';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

function createMockSupabase(opts?: {
  initialMetadata?: Record<string, unknown>;
  uploadError?: { message: string } | null;
}) {
  const updates: unknown[] = [];
  const uploads: Array<{ path: string; body: Blob; options: unknown }> = [];

  const supabase = {
    from: (table: string) => {
      if (table !== 'class_instances') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                metadata: opts?.initialMetadata ?? { async_session: { type: 'async_session' } },
              },
              error: null,
            }),
          }),
        }),
        update: (payload: { metadata: unknown }) => {
          updates.push(payload.metadata);
          return {
            eq: async () => ({ error: null }),
          };
        },
      };
    },
    storage: {
      from: () => ({
        upload: async (path: string, body: Blob, options: unknown) => {
          uploads.push({ path, body, options });
          return { error: opts?.uploadError ?? null };
        },
        remove: async () => ({ error: null }),
      }),
    },
  } as unknown as SupabaseClient<Database>;

  return { supabase, updates, uploads };
}

describe('uploadSoloStudioRecording', () => {
  it('uploads studio-capture.webm and sets ready with provider browser', async () => {
    const { supabase, updates, uploads } = createMockSupabase();
    const blob = new Blob(['fake-webm'], { type: 'video/webm' });

    const result = await uploadSoloStudioRecording({
      supabase,
      workspaceId: '11111111-1111-4111-8111-111111111111',
      classInstanceId: '22222222-2222-4222-8222-222222222222',
      blob,
      nowIso: '2026-07-16T12:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.storagePath).toBe(
        `11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/${SOLO_STUDIO_CAPTURE_FILENAME}`,
      );
    }

    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.path).toContain(SOLO_STUDIO_CAPTURE_FILENAME);

    const uploadingMeta = updates[0] as { class_recording: { status: string; provider: string } };
    expect(uploadingMeta.class_recording.status).toBe('uploading');
    expect(uploadingMeta.class_recording.provider).toBe('browser');

    const readyMeta = updates[updates.length - 1] as {
      class_recording: { status: string; provider: string; storagePath: string };
    };
    expect(readyMeta.class_recording.status).toBe('ready');
    expect(readyMeta.class_recording.provider).toBe('browser');
    expect(readyMeta.class_recording.storagePath).toContain(SOLO_STUDIO_CAPTURE_FILENAME);
  });

  it('marks failed when storage upload errors', async () => {
    const { supabase, updates } = createMockSupabase({
      uploadError: { message: 'bucket full' },
    });
    const result = await uploadSoloStudioRecording({
      supabase,
      workspaceId: 'ws',
      classInstanceId: 'inst',
      blob: new Blob(['x'], { type: 'video/webm' }),
    });
    expect(result.ok).toBe(false);
    const last = updates[updates.length - 1] as { class_recording: { status: string } };
    expect(last.class_recording.status).toBe('failed');
  });
});
