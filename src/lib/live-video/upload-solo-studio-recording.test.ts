import { describe, expect, it } from 'vitest';
import {
  SOLO_STUDIO_CAPTURE_FILENAME,
  uploadSoloStudioRecording,
} from '@/lib/live-video/upload-solo-studio-recording';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const LIVE_SESSION_ID = '33333333-3333-4333-8333-333333333333';
const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const CLASS_INSTANCE_ID = '22222222-2222-4222-8222-222222222222';

function createMockSupabase(opts?: {
  initialMetadata?: Record<string, unknown>;
  uploadError?: { message: string } | null;
  /** When true, update returns no row (RLS / missing id). */
  updateAffectsZeroRows?: boolean;
  rpcError?: { message: string } | null;
  rpcResult?: number;
}) {
  const updates: unknown[] = [];
  const uploads: Array<{ path: string; body: Blob; options: unknown }> = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

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
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: opts?.updateAffectsZeroRows ? null : { id: 'inst' },
                  error: null,
                }),
              }),
            }),
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
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (opts?.rpcError) {
        return { data: null, error: opts.rpcError };
      }
      return { data: opts?.rpcResult ?? 2, error: null };
    },
  } as unknown as SupabaseClient<Database>;

  return { supabase, updates, uploads, rpcCalls };
}

describe('uploadSoloStudioRecording', () => {
  it('uploads studio-capture.webm, sets ready, and reverse-copies the live deck', async () => {
    const { supabase, updates, uploads, rpcCalls } = createMockSupabase();
    const blob = new Blob(['fake-webm'], { type: 'video/webm' });

    const result = await uploadSoloStudioRecording({
      supabase,
      workspaceId: WORKSPACE_ID,
      classInstanceId: CLASS_INSTANCE_ID,
      liveSessionId: LIVE_SESSION_ID,
      blob,
      nowIso: '2026-07-16T12:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.storagePath).toBe(
        `${WORKSPACE_ID}/${CLASS_INSTANCE_ID}/${SOLO_STUDIO_CAPTURE_FILENAME}`,
      );
      expect(result.deckCopyWarning).toBeUndefined();
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

    expect(rpcCalls).toEqual([
      {
        name: 'copy_live_deck_to_class_session',
        args: {
          p_live_session_id: LIVE_SESSION_ID,
          p_class_instance_id: CLASS_INSTANCE_ID,
        },
      },
    ]);
  });

  it('keeps recording ready when reverse-copy fails', async () => {
    const { supabase, rpcCalls } = createMockSupabase({
      rpcError: { message: 'not authorized' },
    });
    const result = await uploadSoloStudioRecording({
      supabase,
      workspaceId: WORKSPACE_ID,
      classInstanceId: CLASS_INSTANCE_ID,
      liveSessionId: LIVE_SESSION_ID,
      blob: new Blob(['x'], { type: 'video/webm' }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.deckCopyWarning).toBe('not authorized');
    }
    expect(rpcCalls).toHaveLength(1);
  });

  it('skips reverse-copy when liveSessionId is empty', async () => {
    const { supabase, rpcCalls } = createMockSupabase();
    const result = await uploadSoloStudioRecording({
      supabase,
      workspaceId: WORKSPACE_ID,
      classInstanceId: CLASS_INSTANCE_ID,
      liveSessionId: '   ',
      blob: new Blob(['x'], { type: 'video/webm' }),
    });
    expect(result.ok).toBe(true);
    expect(rpcCalls).toHaveLength(0);
  });

  it('marks failed when storage upload errors', async () => {
    const { supabase, updates, rpcCalls } = createMockSupabase({
      uploadError: { message: 'bucket full' },
    });
    const result = await uploadSoloStudioRecording({
      supabase,
      workspaceId: 'ws',
      classInstanceId: 'inst',
      liveSessionId: LIVE_SESSION_ID,
      blob: new Blob(['x'], { type: 'video/webm' }),
    });
    expect(result.ok).toBe(false);
    const last = updates[updates.length - 1] as { class_recording: { status: string } };
    expect(last.class_recording.status).toBe('failed');
    expect(rpcCalls).toHaveLength(0);
  });

  it('fails fast when metadata update affects zero rows', async () => {
    const { supabase, uploads, rpcCalls } = createMockSupabase({ updateAffectsZeroRows: true });
    const result = await uploadSoloStudioRecording({
      supabase,
      workspaceId: 'ws',
      classInstanceId: 'missing',
      liveSessionId: LIVE_SESSION_ID,
      blob: new Blob(['x'], { type: 'video/webm' }),
    });
    expect(result.ok).toBe(false);
    expect(uploads).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
  });
});
