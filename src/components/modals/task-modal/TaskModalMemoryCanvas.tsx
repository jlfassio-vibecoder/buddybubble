'use client';

import { useRef } from 'react';
import { Camera, Plus, X } from 'lucide-react';
import { TaskAttachmentImagePreview } from '@/components/modals/task-modal/task-modal-media';
import { TaskModalSection } from '@/components/modals/task-modal/TaskModalSection';
import { isLikelyTaskAttachmentImageFileName } from '@/lib/task-attachment-url';
import type { TaskAttachment } from '@/types/task-modal';
import { cn } from '@/lib/utils';

export type TaskModalMemoryCanvasProps = {
  attachments: TaskAttachment[];
  canWrite: boolean;
  isCreateMode: boolean;
  taskId: string | null;
  typeNoun: string;
  onPickAttachmentFile: (file: File) => void | Promise<void>;
  onDownloadAttachment: (att: TaskAttachment) => void | Promise<void>;
  onRemoveAttachment: (att: TaskAttachment) => void | Promise<void>;
  className?: string;
};

/**
 * Handoff-aligned Memory Photos gallery from image attachments.
 * Caption / happened-on stay in Moment metadata + Schedule.
 */
export function TaskModalMemoryCanvas({
  attachments,
  canWrite,
  isCreateMode,
  taskId,
  typeNoun,
  onPickAttachmentFile,
  onDownloadAttachment,
  onRemoveAttachment,
  className,
}: TaskModalMemoryCanvasProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const images = attachments.filter((a) => isLikelyTaskAttachmentImageFileName(a.name));
  const canAdd = Boolean(canWrite && !isCreateMode && taskId);

  return (
    <div className={className} data-testid="task-modal-memory-canvas">
      <TaskModalSection
        icon={<Camera className="size-4" aria-hidden />}
        title="Photos"
        sub={
          isCreateMode
            ? `Save the ${typeNoun} first, then add photos here or under Attachments.`
            : 'Images from this memory. Non-image files stay under Attachments.'
        }
      >
        <div
          className="grid grid-cols-3 gap-2 sm:grid-cols-4"
          data-testid="task-modal-memory-gallery"
        >
          {images.map((a) => (
            <div
              key={a.id}
              className="group relative aspect-square overflow-hidden rounded-[var(--radius-xl)] border border-border bg-secondary"
            >
              <button
                type="button"
                className="absolute inset-0 flex items-center justify-center"
                onClick={() => void onDownloadAttachment(a)}
                aria-label={`Open ${a.name}`}
              >
                <span className="pointer-events-none scale-150">
                  <TaskAttachmentImagePreview path={a.path} />
                </span>
              </button>
              {canWrite && !isCreateMode ? (
                <button
                  type="button"
                  className={cn(
                    'absolute right-1.5 top-1.5 rounded-md bg-background/90 p-1 text-muted-foreground opacity-0 shadow-sm transition-opacity',
                    'hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100',
                  )}
                  aria-label={`Remove ${a.name}`}
                  onClick={() => void onRemoveAttachment(a)}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </div>
          ))}

          {canAdd ? (
            <button
              type="button"
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[var(--radius-xl)] border border-dashed border-border bg-transparent text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              data-testid="task-modal-memory-add-photo"
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus className="size-5" aria-hidden strokeWidth={2} />
              <span className="text-[11px] font-semibold">Add photo</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void onPickAttachmentFile(f);
                }}
              />
            </button>
          ) : null}
        </div>

        {images.length === 0 && !canAdd ? (
          <p className="mt-2 text-xs text-muted-foreground" data-testid="task-modal-memory-empty">
            No photos yet.
          </p>
        ) : null}
      </TaskModalSection>
    </div>
  );
}
