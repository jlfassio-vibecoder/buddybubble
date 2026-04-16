'use client';

import type { RefObject } from 'react';
import { Image as ImageIcon, Sparkles } from 'lucide-react';
import { TaskCardCoverModalPreview } from '@/components/modals/task-modal/task-modal-media';
import { PremiumGate } from '@/components/subscription/premium-gate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CARD_COVER_PRESET_GROUPS } from '@/lib/ai/card-cover-presets';

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
          <div className="space-y-2 pt-1">
            <div className="space-y-1">
              <Label htmlFor="card-cover-preset" className="text-xs text-muted-foreground">
                Visual preset
              </Label>
              <select
                id="card-cover-preset"
                value={cardCoverPresetId}
                onChange={(e) => onCardCoverPresetIdChange(e.target.value)}
                disabled={!canWrite || saving || aiCardCoverGenerating}
                className="flex h-8 max-w-md rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Auto (by card type)</option>
                {CARD_COVER_PRESET_GROUPS.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="card-cover-ai-hint" className="text-xs text-muted-foreground">
                Style hint (optional)
              </Label>
              <Input
                id="card-cover-ai-hint"
                value={cardCoverAiHint}
                onChange={(e) => onCardCoverAiHintChange(e.target.value)}
                disabled={!canWrite || saving || aiCardCoverGenerating}
                className="h-8 max-w-md text-xs"
                placeholder="e.g. soft gradients, minimal illustration"
                maxLength={220}
              />
            </div>
            {canWrite ? (
              <PremiumGate feature="ai" inline>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 gap-1 px-2 text-xs"
                  disabled={aiCardCoverGenerating || saving}
                  onClick={() => void onGenerateCardCoverWithAi()}
                >
                  <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
                  {aiCardCoverGenerating ? 'Generating…' : 'Generate cover (AI)'}
                </Button>
              </PremiumGate>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          Save the card first, then you can add a cover image.
        </p>
      )}
    </div>
  );
}
