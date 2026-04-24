'use client';

import { useId } from 'react';
import { Sparkles } from 'lucide-react';
import { PremiumGate } from '@/components/subscription/premium-gate';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CARD_COVER_PRESET_GROUPS } from '@/lib/ai/card-cover-presets';

export type TaskModalCardCoverAiBlockProps = {
  presetId: string;
  onPresetChange: (id: string) => void;
  hint: string;
  onHintChange: (hint: string) => void;
  isGenerating: boolean;
  isDisabled: boolean;
  onGenerate: () => void | Promise<void>;
  canWrite: boolean;
};

/**
 * Shared AI card cover controls: visual preset, style hint, Premium-gated generate.
 * Used from TaskModal Details and WorkoutViewer embedded pane; each mount gets unique ids via `useId`.
 */
export function TaskModalCardCoverAiBlock({
  presetId,
  onPresetChange,
  hint,
  onHintChange,
  isGenerating,
  isDisabled,
  onGenerate,
  canWrite,
}: TaskModalCardCoverAiBlockProps) {
  const baseId = useId();
  const presetIdAttr = `${baseId}-preset`;
  const hintId = `${baseId}-hint`;
  const controlsDisabled = isDisabled || isGenerating;

  return (
    <div className="space-y-2 pt-1">
      <div className="space-y-1">
        <Label htmlFor={presetIdAttr} className="text-xs text-muted-foreground">
          Visual preset
        </Label>
        <select
          id={presetIdAttr}
          value={presetId}
          onChange={(e) => onPresetChange(e.target.value)}
          disabled={controlsDisabled}
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
        <Label htmlFor={hintId} className="text-xs text-muted-foreground">
          Style hint (optional)
        </Label>
        <Textarea
          id={hintId}
          value={hint}
          onChange={(e) => onHintChange(e.target.value)}
          disabled={controlsDisabled}
          rows={2}
          maxLength={220}
          className="max-w-md min-h-[2.5rem] resize-y text-xs"
          placeholder="e.g. soft gradients, minimal illustration"
        />
      </div>
      {canWrite ? (
        <PremiumGate feature="ai" inline>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            disabled={isGenerating || isDisabled}
            onClick={() => void onGenerate()}
          >
            <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
            {isGenerating ? 'Generating…' : 'Generate cover (AI)'}
          </Button>
        </PremiumGate>
      ) : null}
    </div>
  );
}
