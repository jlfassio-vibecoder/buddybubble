'use client';

import { Paperclip, X } from 'lucide-react';
import { TaskAttachmentImagePreview } from '@/components/modals/task-modal/task-modal-media';
import { Button } from '@/components/ui/button';
import {
  TaskModalDisclosure,
  TaskModalField,
} from '@/components/modals/task-modal/TaskModalSection';
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
    <TaskModalDisclosure
      icon={<Paperclip className="size-4" aria-hidden />}
      title="Attachments & files"
      meta={attachments.length ? `${attachments.length} files` : '0 files'}
    >
      <TaskModalField
        help={
          isCreateMode
            ? `Save the ${typeNoun} first, then you can upload files.`
            : "PDFs, images, or a program export. Shown in the card's Files drawer."
        }
      >
        {!isCreateMode && taskId && canWrite ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="secondary" size="sm" asChild>
              <label className="cursor-pointer">
                <Paperclip className="size-3.5" aria-hidden />
                Choose file
                <input
                  type="file"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void onPickAttachmentFile(f);
                  }}
                />
              </label>
            </Button>
          </div>
        ) : null}
      </TaskModalField>

      {attachments.length > 0 ? (
        <ul className="space-y-1.5">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-[13px]"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2 text-muted-foreground">
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
                <button
                  type="button"
                  className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => void onRemoveAttachment(a)}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </TaskModalDisclosure>
  );
}
