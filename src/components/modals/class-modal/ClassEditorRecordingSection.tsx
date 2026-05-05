'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Loader2, Trash2, Upload } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import type { Json } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { formatUserFacingError } from '@/lib/format-error';
import { mergeClassRecordingIntoInstanceMetadata } from '@/lib/class-recording-metadata';
import {
  CLASS_RECORDINGS_BUCKET,
  buildClassRecordingObjectPath,
} from '@/lib/class-recording-storage';
import { cn } from '@/lib/utils';
import {
  parseClassRecordingFromInstanceMetadata,
  type ClassRecordingPayload,
} from '@/types/live-session-invite';
import { toast } from 'sonner';

export type ClassEditorRecordingSectionProps = {
  workspaceId: string;
  classInstanceId: string;
  canWrite: boolean;
  disabledForm: boolean;
  rawInstanceMetadata: Json;
  setRawInstanceMetadata: (next: Json) => void;
};

function statusLabel(rec: ClassRecordingPayload | null): string {
  if (!rec) return 'No recording attached.';
  switch (rec.status) {
    case 'processing':
      return 'Processing — file upload or server pipeline in progress.';
    case 'failed':
      return rec.errorMessage?.trim()
        ? `Failed — ${rec.errorMessage.trim()}`
        : 'Failed — see error details below.';
    case 'ready':
      return 'Ready — members can play when async workout is enabled.';
    default:
      return 'No recording attached.';
  }
}

export function ClassEditorRecordingSection({
  workspaceId,
  classInstanceId,
  canWrite,
  disabledForm,
  rawInstanceMetadata,
  setRawInstanceMetadata,
}: ClassEditorRecordingSectionProps) {
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const recording = useMemo(
    () => parseClassRecordingFromInstanceMetadata(rawInstanceMetadata),
    [rawInstanceMetadata],
  );

  const persistMetadata = useCallback(
    async (nextMeta: Json) => {
      const { error } = await supabase
        .from('class_instances')
        .update({ metadata: nextMeta })
        .eq('id', classInstanceId);
      if (error) throw error;
      setRawInstanceMetadata(nextMeta);
    },
    [classInstanceId, setRawInstanceMetadata, supabase],
  );

  const removeOldStorageObject = useCallback(
    async (storagePath: string | undefined) => {
      if (!storagePath?.trim()) return;
      const { error } = await supabase.storage.from(CLASS_RECORDINGS_BUCKET).remove([storagePath]);
      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[class_recording] remove previous object', error);
        }
      }
    },
    [supabase],
  );

  const handleUploadFile = useCallback(
    async (file: File) => {
      if (!canWrite || disabledForm || uploading) return;
      const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
      if (!isVideo) {
        toast.error('Please upload a video file (MP4 recommended).');
        return;
      }

      setUploading(true);
      const ext =
        file.name.includes('.') && /\.[a-z0-9]+$/i.test(file.name)
          ? file.name.slice(file.name.lastIndexOf('.'))
          : '.mp4';
      const objectName = `recording-${Date.now()}${ext}`;
      const storagePath = buildClassRecordingObjectPath(workspaceId, classInstanceId, objectName);

      const now = new Date().toISOString();
      let meta: Json = rawInstanceMetadata;
      const prev = parseClassRecordingFromInstanceMetadata(meta);

      const processingPayload: ClassRecordingPayload = {
        type: 'class_recording',
        status: 'processing',
        storagePath,
        ...(prev?.createdAt ? { createdAt: prev.createdAt } : { createdAt: now }),
        updatedAt: now,
      };

      try {
        meta = mergeClassRecordingIntoInstanceMetadata(meta, processingPayload);
        await persistMetadata(meta);

        const { error: upErr } = await supabase.storage
          .from(CLASS_RECORDINGS_BUCKET)
          .upload(storagePath, file, {
            upsert: true,
            cacheControl: '3600',
            contentType: file.type || 'video/mp4',
          });

        if (upErr) {
          meta = mergeClassRecordingIntoInstanceMetadata(meta, {
            type: 'class_recording',
            status: 'failed',
            storagePath,
            createdAt: processingPayload.createdAt,
            updatedAt: new Date().toISOString(),
            errorMessage: formatUserFacingError(upErr),
          });
          await persistMetadata(meta);
          toast.error(formatUserFacingError(upErr));
          return;
        }

        await removeOldStorageObject(
          prev?.storagePath && prev.storagePath !== storagePath ? prev.storagePath : undefined,
        );

        meta = mergeClassRecordingIntoInstanceMetadata(meta, {
          type: 'class_recording',
          status: 'ready',
          storagePath,
          createdAt: processingPayload.createdAt,
          updatedAt: new Date().toISOString(),
        });
        await persistMetadata(meta);
        toast.success('Recording uploaded');
      } catch (e) {
        const msg = formatUserFacingError(e);
        try {
          meta = mergeClassRecordingIntoInstanceMetadata(meta, {
            type: 'class_recording',
            status: 'failed',
            storagePath,
            createdAt: processingPayload.createdAt,
            updatedAt: new Date().toISOString(),
            errorMessage: msg,
          });
          await persistMetadata(meta);
        } catch {
          /* ignore secondary failure */
        }
        toast.error(msg);
      } finally {
        setUploading(false);
      }
    },
    [
      canWrite,
      disabledForm,
      persistMetadata,
      rawInstanceMetadata,
      removeOldStorageObject,
      supabase,
      uploading,
      workspaceId,
      classInstanceId,
    ],
  );

  const handleRemove = useCallback(async () => {
    if (!canWrite || disabledForm || uploading) return;
    const prev = parseClassRecordingFromInstanceMetadata(rawInstanceMetadata);
    setUploading(true);
    try {
      await removeOldStorageObject(prev?.storagePath);
      await persistMetadata(mergeClassRecordingIntoInstanceMetadata(rawInstanceMetadata, null));
      toast.success('Recording removed');
    } catch (e) {
      toast.error(formatUserFacingError(e));
    } finally {
      setUploading(false);
    }
  }, [
    canWrite,
    disabledForm,
    persistMetadata,
    rawInstanceMetadata,
    removeOldStorageObject,
    uploading,
  ]);

  if (!canWrite) return null;

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Recording management
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Upload an MP4 for async playback. Large files may take a few minutes to upload.
        </p>
      </div>

      <div className="space-y-1">
        <Label>Status</Label>
        <p className="text-sm text-foreground">{statusLabel(recording)}</p>
        {recording?.storagePath ? (
          <p className="break-all text-[11px] text-muted-foreground">{recording.storagePath}</p>
        ) : null}
        {recording?.playbackUrl && !recording.storagePath ? (
          <p className="break-all text-[11px] text-muted-foreground">
            External URL (legacy): {recording.playbackUrl}
          </p>
        ) : null}
      </div>

      <div
        className={cn(
          'flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center transition-colors',
          dragActive && 'border-primary bg-primary/5',
          (disabledForm || uploading) && 'pointer-events-none opacity-60',
        )}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void handleUploadFile(f);
        }}
      >
        <Upload className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Drag and drop a video here, or choose a file.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabledForm || uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                Uploading…
              </>
            ) : (
              'Choose video'
            )}
          </Button>
          {recording ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabledForm || uploading}
              onClick={() => void handleRemove()}
            >
              <Trash2 className="mr-1.5 size-3.5" aria-hidden />
              Remove
            </Button>
          ) : null}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,.mp4,.mov,.webm,.m4v"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void handleUploadFile(f);
          }}
        />
      </div>
    </div>
  );
}
