'use client';

import type { RefObject } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { TaskCardCoverModalPreview } from '@/components/modals/task-modal/task-modal-media';
import { Button } from '@/components/ui/button';
import { TaskModalCardCoverAiBlock } from '@/components/modals/task-modal/TaskModalCardCoverAiBlock';

export type TaskModalCardCoverSectionProps = {
  taskId: string | null;
  cardCoverPath: string;
  cardCoverFileInputRef: RefObject<HTMLInputElement | null>;
  onCardCoverFileChange: (file: File) => void;
  onPickCardCover: () => void;
  onRemoveCardCover: () => void;
  cardCoverPresetId: string;
  onCardCoverPresetIdChange: (id: string) => void;
  cardCoverAiHint: string;
  onCardCoverAiHintChange: (hint: string) => void;
  canWrite: boolean;
  saving: boolean;
  aiCardCoverGenerating: boolean;
  onGenerateCardCoverWithAi: () => void | Promise<void>;
};

export function TaskModalCardCoverSection({
  taskId,
  cardCoverPath,
  cardCoverFileInputRef,
  onCardCoverFileChange,
  onPickCardCover,
  onRemoveCardCover,
  cardCoverPresetId,
  onCardCoverPresetIdChange,
  cardCoverAiHint,
  onCardCoverAiHintChange,
  canWrite,
  saving,
  aiCardCoverGenerating,
  onGenerateCardCoverWithAi,
}: TaskModalCardCoverSectionProps) {
  const trimmed = cardCoverPath.trim();

  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
        <p className="text-xs font-medium text-muted-foreground">Board & chat cover</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Optional image shown behind the title and details on the board and in chat.
      </p>
      {taskId ? (
        <>
          <TaskCardCoverModalPreview path={trimmed || null} />
          <div className="flex flex-wrap gap-2">
            <input
              ref={cardCoverFileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void onCardCoverFileChange(f);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!canWrite || saving}
              onClick={onPickCardCover}
            >
              {trimmed ? 'Replace image' : 'Upload image'}
            </Button>
            {trimmed ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canWrite || saving}
                onClick={() => void onRemoveCardCover()}
              >
                Remove
              </Button>
            ) : null}
          </div>
          <TaskModalCardCoverAiBlock
            presetId={cardCoverPresetId}
            onPresetChange={onCardCoverPresetIdChange}
            hint={cardCoverAiHint}
            onHintChange={onCardCoverAiHintChange}
            isGenerating={aiCardCoverGenerating}
            isDisabled={!canWrite || saving || aiCardCoverGenerating}
            onGenerate={onGenerateCardCoverWithAi}
            canWrite={canWrite}
          />
        </>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          Save the card first, then you can add a cover image.
        </p>
      )}
    </div>
  );
}
