'use client';

import { TaskAttachmentImagePreview } from '@/components/modals/task-modal/task-modal-media';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { isLikelyTaskAttachmentImageFileName } from '@/lib/task-attachment-url';
import type { TaskAttachment } from '@/types/task-modal';

export type TaskModalAttachmentsSectionProps = {
  attachments: TaskAttachment[];
  isCreateMode: boolean;
  taskId: string | null;
  canWrite: boolean;
  typeNoun: string;
  onPickAttachmentFile: (file: File) => void | Promise<void>;
  onDownloadAttachment: (att: TaskAttachment) => void | Promise<void>;
  onRemoveAttachment: (att: TaskAttachment) => void | Promise<void>;
};

export function TaskModalAttachmentsSection({
  attachments,
  isCreateMode,
  taskId,
  canWrite,
  typeNoun,
  onPickAttachmentFile,
  onDownloadAttachment,
  onRemoveAttachment,
}: TaskModalAttachmentsSectionProps) {
  return (
    <div className="space-y-2">
      <Label>Attachments</Label>
      {!isCreateMode && taskId && canWrite && (
        <input
          type="file"
          className="block w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-2 file:py-1"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void onPickAttachmentFile(f);
          }}
        />
      )}
      {isCreateMode && (
        <p className="text-xs text-muted-foreground">
          Save the {typeNoun} first, then you can upload files.
        </p>
      )}
      <ul className="space-y-1">
        {attachments.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/50 px-2 py-1 text-sm"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {isLikelyTaskAttachmentImageFileName(a.name) ? (
                <TaskAttachmentImagePreview path={a.path} />
              ) : null}
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-primary hover:underline"
                onClick={() => void onDownloadAttachment(a)}
              >
                {a.name}
              </button>
            </div>
            {canWrite && !isCreateMode && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-destructive hover:text-destructive"
                onClick={() => void onRemoveAttachment(a)}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
