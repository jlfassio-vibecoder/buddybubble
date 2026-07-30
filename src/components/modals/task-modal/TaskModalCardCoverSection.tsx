'use client';

import { Image as ImageIcon } from 'lucide-react';
import { TaskCardCoverModalPreview } from '@/components/modals/task-modal/task-modal-media';
import { Button } from '@/components/ui/button';
import { TaskModalCardCoverAiBlock } from '@/components/modals/task-modal/TaskModalCardCoverAiBlock';
import {
  TaskModalDisclosure,
  TaskModalField,
} from '@/components/modals/task-modal/TaskModalSection';

export type TaskModalCardCoverSectionProps = {
  taskId: string | null;
  cardCoverPath: string;
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
    <TaskModalDisclosure
      icon={<ImageIcon className="size-4" aria-hidden />}
      title="Cover & appearance"
      meta="Board & chat cover"
    >
      <TaskModalField help="Optional image shown behind the title and details on the board and in chat.">
        {taskId ? (
          <>
            <TaskCardCoverModalPreview path={trimmed || null} />
            <div className="mt-2.5 flex flex-wrap gap-2">
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
            <div className="mt-3.5">
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
            </div>
          </>
        ) : (
          <p className="text-xs italic text-muted-foreground">
            Save the card first, then you can add a cover image.
          </p>
        )}
      </TaskModalField>
    </TaskModalDisclosure>
  );
}
